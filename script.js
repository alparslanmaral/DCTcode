/* DCT Code - Güncellenmiş script.js
   Eklenen / Düzenlenen Özellikler:
   - ZIP Export (sentinel .dct_folder hariç tüm proje dosyalarını indir)
   - Klasör açılmama sorunu: yeni klasör ve içine dosya oluşturulduğunda otomatik expand
   - Açık klasör durumlarının korunması (expandedFolders)
   - buildTree içinde .dct_folder sentinel dosyaları ağaçta gizleme
   - Dosya / klasör açıldığında üst klasör zincirinin otomatik expand edilmesi
*/

/* ---------------- CONSTANTS ---------------- */
const STORAGE_KEY_CURRENT = "dctcode_current_project";
const STORAGE_KEY_SLOTS = "dctcode_slots";
const MAX_SLOTS = 5;
const THEME_STORAGE_KEY = "dctcode_theme";
const PAT_STORAGE_KEY = "dctcode_pat";
const GITHUB_API_BASE = "https://api.github.com";

/* ---------------- STATE ---------------- */
let project = null;
let fileTreeRoot = {};
let dirtyFiles = new Set();
let suppressEditor = false;
let githubUser = null; // Doğrulanmış kullanıcı objesi
const expandedFolders = new Set(); // Açık klasör path’leri

/* ---------------- ELEMENTS ---------------- */
const els = {
  activityItems: document.querySelectorAll(".activity-item"),
  panels: {
    explorer: document.getElementById("panel-explorer"),
    slots: document.getElementById("panel-slots"),
    github: document.getElementById("panel-github"),
    about: document.getElementById("panel-about"),
  },
  fileTree: document.getElementById("file-tree"),
  editor: document.getElementById("editor"),
  tabsBar: document.getElementById("tabs-bar"),
  projectName: document.getElementById("project-name"),
  status: {
    project: document.getElementById("status-project"),
    file: document.getElementById("status-file"),
    changed: document.getElementById("status-changed")
  },
  slotsList: document.getElementById("slots-list"),
  githubUrl: document.getElementById("github-url"),
  cloneBtn: document.getElementById("btn-clone"),
  cloneProgress: document.getElementById("clone-progress"),

  newFileBtn: document.getElementById("btn-new-file"),
  newFolderBtn: document.getElementById("btn-new-folder"),
  newProjectBtn: document.getElementById("btn-new-project"),
  exportZipBtn: document.getElementById("btn-export-zip"), // (index.html’de ZIP butonu varsa)

  themeToggle: document.getElementById("btn-theme-toggle"),

  // PAT / Auth
  patInput: document.getElementById("github-pat-input"),
  savePatBtn: document.getElementById("btn-save-pat"),
  validatePatBtn: document.getElementById("btn-validate-pat"),
  clearPatBtn: document.getElementById("btn-clear-pat"),
  listReposBtn: document.getElementById("btn-list-repos"),
  repoSelect: document.getElementById("github-repo-select"),
  branchInput: document.getElementById("github-branch-input"),
  prefixInput: document.getElementById("github-prefix-input"),
  commitMsgInput: document.getElementById("github-commit-message"),
  checkBranchBtn: document.getElementById("btn-check-branch"),
  createBranchBtn: document.getElementById("btn-create-branch"),
  pushProjectBtn: document.getElementById("btn-push-project"),

  authBox: document.getElementById("github-auth-box"),
  userInfoBox: document.getElementById("github-user-info"),
  userLogin: document.getElementById("github-user-login"),
  userName: document.getElementById("github-user-name"),
  userAvatar: document.getElementById("github-user-avatar"),

  menus: {
    file: document.getElementById("file-context"),
    tab: document.getElementById("tab-context")
  }
};

/* ---------------- THEME ---------------- */
function loadTheme() {
  return localStorage.getItem(THEME_STORAGE_KEY) || "dark";
}
function saveTheme(theme) {
  localStorage.setItem(THEME_STORAGE_KEY, theme);
}
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme === "light" ? "light" : "");
  if (els.themeToggle) {
    els.themeToggle.textContent = theme === "light" ? "☀️" : "🌙";
  }
}
function toggleTheme() {
  const next = loadTheme() === "light" ? "dark" : "light";
  saveTheme(next);
  applyTheme(next);
  logClone(`Tema: ${next}`);
}

/* ---------------- UTILS ---------------- */
function nowISO() { return new Date().toISOString(); }

function loadSlots() {
  let raw = localStorage.getItem(STORAGE_KEY_SLOTS);
  if (!raw) {
    const arr = new Array(MAX_SLOTS).fill(null);
    localStorage.setItem(STORAGE_KEY_SLOTS, JSON.stringify(arr));
    return arr;
  }
  try { return JSON.parse(raw); } catch { return new Array(MAX_SLOTS).fill(null); }
}
function saveSlots(slots) {
  localStorage.setItem(STORAGE_KEY_SLOTS, JSON.stringify(slots));
}
function saveCurrentProject() {
  if (!project) return;
  project.updated = nowISO();
  localStorage.setItem(STORAGE_KEY_CURRENT, JSON.stringify(project));
}
function loadCurrentProject() {
  const raw = localStorage.getItem(STORAGE_KEY_CURRENT);
  if (!raw) return null;
  try { return JSON.parse(raw); } catch { return null; }
}
function createEmptyProject(name = "Yeni Proje") {
  return {
    name,
    files: { "README.md": "# " + name + "\n\nProjenize hoş geldiniz." },
    openFiles: ["README.md"],
    activeFile: "README.md",
    created: nowISO(),
    updated: nowISO()
  };
}
function ensureProject() {
  if (!project) {
    project = createEmptyProject("DCT Project");
    saveCurrentProject();
  }
}
function pathParts(p) { return p.split("/").filter(Boolean); }

/* Üst klasörleri expandedFolders’a ekle */
function revealParents(path) {
  const parts = pathParts(path);
  for (let i = 1; i < parts.length; i++) {
    const folderPath = parts.slice(0, i).join("/");
    expandedFolders.add(folderPath);
  }
}

/* ---------------- BUILD TREE (sentinel gizle) ---------------- */
function buildTree(filesMap) {
  const root = { type: "folder", name: "/", children: {} };

  Object.keys(filesMap)
    .sort()
    .forEach(fp => {
      const isSentinel = fp.endsWith(".dct_folder");
      const parts = pathParts(fp);
      // Sentinel ise son parçayı (".dct_folder") ağaçta dosya olarak eklemeyeceğiz
      const limit = isSentinel ? parts.length - 1 : parts.length;
      if (limit <= 0) return; // güvenlik

      let cur = root;
      for (let i = 0; i < limit; i++) {
        const part = parts[i];
        const isLast = (i === limit - 1);
        if (!cur.children[part]) {
            cur.children[part] = isLast
              ? { type: "file", name: part, path: parts.slice(0, i + 1).join("/") }
              : { type: "folder", name: part, children: {}, path: parts.slice(0, i + 1).join("/") };
        } else {
          // Eğer mevcut node dosya olarak eklenmiş ama aslında klasör olmalıysa (teorik edge)
          if (isLast && !isSentinel && cur.children[part].type === "folder") {
            // bırak
          }
        }
        cur = cur.children[part];
      }

      // Eğer sentinel değilse ve son node file olarak eklendiyse tamamdır.
      // Sentinel ise dosya düğümü eklemedik, sadece klasör zincirini oluşturduk.
      // (Boş klasör böylece görünür.)
    });

  return root;
}

/* ---------------- RENDERING ---------------- */
function renderFileTree() {
  ensureProject();
  fileTreeRoot = buildTree(project.files);
  els.fileTree.innerHTML = "";
  Object.values(fileTreeRoot.children).forEach(node => {
    els.fileTree.appendChild(renderNode(node));
  });
}

function renderNode(node) {
  const li = document.createElement("li");
  const item = document.createElement("div");
  item.className = "tree-item " + node.type + (node.type === "folder" ? " folder" : " file");
  item.dataset.path = node.path || node.name;

  const twisty = document.createElement("span");
  twisty.className = "twisty";
  twisty.textContent = node.type === "folder" ? "▸" : "";

  const icon = document.createElement("span");
  icon.className = "icon";
  icon.textContent = node.type === "folder" ? "📁" : "📄";

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = node.name;

  item.appendChild(twisty);
  item.appendChild(icon);
  item.appendChild(name);
  li.appendChild(item);

  if (node.type === "folder") {
    const childrenWrap = document.createElement("div");
    childrenWrap.className = "children";
    Object.values(node.children).forEach(child => childrenWrap.appendChild(renderNode(child)));
    li.appendChild(childrenWrap);

    // Açık klasörleri koru
    if (expandedFolders.has(node.path)) {
      item.classList.add("expanded");
      twisty.textContent = "▾";
      childrenWrap.style.display = "block";
    }

    item.addEventListener("click", e => {
      if (e.detail === 1) {
        const expanded = item.classList.toggle("expanded");
        twisty.textContent = expanded ? "▾" : "▸";
        if (expanded) expandedFolders.add(node.path);
        else expandedFolders.delete(node.path);
      }
    });
  } else {
    item.addEventListener("click", () => openFile(node.path));
  }

  item.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showContextMenu("file", e.pageX, e.pageY, node);
  });

  if (node.path === project.activeFile) item.classList.add("active");
  if (dirtyFiles.has(node.path)) name.classList.add("changed");
  return li;
}

function refreshActiveInTree() {
  document.querySelectorAll(".tree-item.file.active").forEach(el => el.classList.remove("active"));
  if (!project.activeFile) return;
  const activeEl = document.querySelector(`.tree-item.file[data-path="${CSS.escape(project.activeFile)}"]`);
  if (activeEl) activeEl.classList.add("active");
}

function renderTabs() {
  els.tabsBar.innerHTML = "";
  project.openFiles.forEach(path => {
    const tab = document.createElement("div");
    tab.className = "tab" + (path === project.activeFile ? " active" : "");
    tab.dataset.path = path;
    const title = document.createElement("span");
    title.textContent = path.split("/").pop();
    if (dirtyFiles.has(path)) {
      const dirty = document.createElement("span");
      dirty.className = "dirty"; dirty.textContent = " *";
      title.appendChild(dirty);
    }
    const close = document.createElement("span");
    close.className = "close-btn";
    close.textContent = "×";
    close.addEventListener("click", (e) => { e.stopPropagation(); closeTab(path); });
    tab.appendChild(title);
    tab.appendChild(close);
    tab.addEventListener("click", () => openFile(path));
    tab.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      showContextMenu("tab", e.pageX, e.pageY, { path });
    });
    els.tabsBar.appendChild(tab);
  });
}

function renderEditor() {
  const active = project.activeFile;
  if (!active) {
    els.editor.value = "";
    els.editor.disabled = true;
    els.status.file.textContent = "No File";
    return;
  }
  els.editor.disabled = false;
  suppressEditor = true;
  els.editor.value = project.files[active] ?? "";
  suppressEditor = false;
  els.status.file.textContent = active;
  updateStatusChanged();
}

function updateStatusChanged() {
  if (dirtyFiles.size === 0) {
    els.status.changed.textContent = "Saved";
    els.status.changed.className = "";
    els.status.changed.classList.add("saved");
  } else {
    els.status.changed.textContent = "Unsaved (" + dirtyFiles.size + ")";
    els.status.changed.className = "";
    els.status.changed.classList.add("dirty");
  }
}
function renderProjectName() {
  els.projectName.value = project.name;
  els.status.project.textContent = project.name;
}
function fullRender() {
  renderProjectName();
  renderFileTree();
  renderTabs();
  renderEditor();
}

/* ---------------- FILE OPS ---------------- */
function openFile(path) {
  ensureProject();
  if (!project.files[path]) return;
  if (!project.openFiles.includes(path)) project.openFiles.push(path);
  project.activeFile = path;
  revealParents(path); // Üst klasörleri açık tut
  saveCurrentProject();
  renderTabs();
  refreshActiveInTree();
  renderFileTree(); // Açılma etkisini görmek için yeniden çiz
  renderEditor();
}

function closeTab(path) {
  const idx = project.openFiles.indexOf(path);
  if (idx >= 0) project.openFiles.splice(idx,1);
  if (project.activeFile === path) project.activeFile = project.openFiles[project.openFiles.length -1] || null;
  saveCurrentProject();
  renderTabs();
  renderEditor();
  refreshActiveInTree();
}

function createFile(path, content = "") {
  if (project.files[path]) { alert("Bu isimde dosya zaten var."); return; }
  project.files[path] = content;
  project.updated = nowISO();
  revealParents(path); // Klasörlerin açılmasını sağla
  saveCurrentProject();
  openFile(path);
  renderFileTree();
}

function createFolder(path) {
  const marker = path.replace(/\/?$/,"/") + ".dct_folder";
  if (project.files[marker]) { alert("Klasör zaten var."); return; }
  project.files[marker] = "";
  // Yeni klasörü otomatik expand et
  expandedFolders.add(path);
  revealParents(path + "/_temp"); // Üst klasörleri de aç
  saveCurrentProject();
  renderFileTree();
}

function renamePath(oldPath, newPath) {
  if (project.files[newPath]) { alert("Yeni ad zaten mevcut."); return; }
  const content = project.files[oldPath];
  project.files[newPath] = content;
  delete project.files[oldPath];
  const oi = project.openFiles.indexOf(oldPath);
  if (oi >= 0) project.openFiles[oi] = newPath;
  if (project.activeFile === oldPath) project.activeFile = newPath;
  if (dirtyFiles.has(oldPath)) { dirtyFiles.delete(oldPath); dirtyFiles.add(newPath); }
  revealParents(newPath);
  saveCurrentProject();
  fullRender();
}

function deletePath(path) {
  if (!project.files[path]) {
    // Folder (prefix)
    const prefix = path.replace(/\/?$/,"/");
    const keys = Object.keys(project.files).filter(k => k.startsWith(prefix));
    if (keys.length === 0) return;
    if (!confirm("Klasörü silmek istediğinize emin misiniz?\n" + path)) return;
    keys.forEach(k => {
      delete project.files[k];
      dirtyFiles.delete(k);
      const idx = project.openFiles.indexOf(k);
      if (idx >=0) project.openFiles.splice(idx,1);
    });
    if (project.activeFile && !project.files[project.activeFile]) {
      project.activeFile = project.openFiles[project.openFiles.length -1] || null;
    }
    expandedFolders.delete(path);
    saveCurrentProject();
    fullRender();
    return;
  }
  if (!confirm("Silinsin mi? " + path)) return;
  delete project.files[path];
  dirtyFiles.delete(path);
  const idx = project.openFiles.indexOf(path);
  if (idx >=0) project.openFiles.splice(idx,1);
  if (project.activeFile === path) {
    project.activeFile = project.openFiles[project.openFiles.length -1] || null;
  }
  saveCurrentProject();
  fullRender();
}

/* ---------------- YENİ PROJE ---------------- */
function newProject() {
  if (dirtyFiles.size > 0) {
    const proceed = confirm("Kaydedilmemiş değişiklikler var. Yeni proje oluşturulsun mu?");
    if (!proceed) return;
  }
  const name = prompt("Yeni proje adı:", "Yeni Proje") || "Yeni Proje";
  project = createEmptyProject(name);
  dirtyFiles.clear();
  expandedFolders.clear();
  saveCurrentProject();
  fullRender();
  logClone("Yeni proje oluşturuldu.");
}

/* ---------------- SLOTS ---------------- */
function renderSlots() {
  const slots = loadSlots();
  els.slotsList.innerHTML = "";
  slots.forEach((slot, i) => {
    const div = document.createElement("div");
    div.className = "slot" + (!slot ? " empty": "");
    const header = document.createElement("div");
    header.className = "slot-header";
    header.innerHTML = `<span>Slot ${i+1}</span>`;
    const buttons = document.createElement("div");
    buttons.className = "slot-buttons";
    const btnSave = document.createElement("button");
    btnSave.textContent = "Kaydet";
    btnSave.addEventListener("click", () => saveToSlot(i));
    const btnLoad = document.createElement("button");
    btnLoad.textContent = "Yükle";
    btnLoad.disabled = !slot;
    btnLoad.addEventListener("click", () => loadFromSlot(i));
    const btnClear = document.createElement("button");
    btnClear.textContent = "Sil";
    btnClear.disabled = !slot;
    btnClear.addEventListener("click", () => clearSlot(i));
    buttons.appendChild(btnSave); buttons.appendChild(btnLoad); buttons.appendChild(btnClear);
    header.appendChild(buttons);
    const info = document.createElement("div");
    info.style.fontSize = "11px"; info.style.color = "var(--text-dim)";
    info.textContent = slot ? `${slot.name} | ${slot.updated}` : "Boş";
    div.appendChild(header); div.appendChild(info);
    els.slotsList.appendChild(div);
  });
}
function saveToSlot(index) {
  if (!project) return;
  const slots = loadSlots();
  slots[index] = JSON.parse(JSON.stringify(project));
  saveSlots(slots);
  renderSlots();
  logClone(`Slot ${index+1} kaydedildi.`);
}
function loadFromSlot(index) {
  const slots = loadSlots();
  const slot = slots[index];
  if (!slot) { alert("Slot boş"); return; }
  if (dirtyFiles.size > 0 && !confirm("Kaydedilmemiş değişiklikler var. Yine de yüklemek?")) return;
  project = JSON.parse(JSON.stringify(slot));
  dirtyFiles.clear();
  expandedFolders.clear();
  saveCurrentProject();
  fullRender();
  logClone(`Slot ${index+1} yüklendi.`);
}
function clearSlot(index) {
  if (!confirm("Slot temizlensin mi?")) return;
  const slots = loadSlots();
  slots[index] = null;
  saveSlots(slots);
  renderSlots();
  logClone(`Slot ${index+1} temizlendi.`);
}

/* ---------------- EDITOR EVENTS ---------------- */
els.editor.addEventListener("input", () => {
  if (suppressEditor) return;
  if (!project.activeFile) return;
  project.files[project.activeFile] = els.editor.value;
  dirtyFiles.add(project.activeFile);
  updateStatusChanged();
  markDirtyUI(project.activeFile);
});

function markDirtyUI(path) {
  const tab = document.querySelector(`.tab[data-path="${CSS.escape(path)}"]`);
  if (tab && !tab.querySelector(".dirty")) {
    const title = tab.querySelector("span");
    const dirty = document.createElement("span");
    dirty.className = "dirty"; dirty.textContent = " *";
    title.appendChild(dirty);
  }
  const treeName = document.querySelector(`.tree-item.file[data-path="${CSS.escape(path)}"] .name`);
  if (treeName && !treeName.classList.contains("changed")) treeName.classList.add("changed");
}

/* ---------------- KISAYOLLAR ---------------- */
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault(); saveAll();
  }
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === "n") {
    e.preventDefault(); newProject();
  }
  if ((e.ctrlKey || e.metaKey) && e.altKey && e.key.toLowerCase() === "t") {
    e.preventDefault(); toggleTheme();
  }
});

function saveAll() {
  if (dirtyFiles.size === 0) return;
  dirtyFiles.clear();
  updateStatusChanged();
  document.querySelectorAll(".tab .dirty").forEach(el => el.remove());
  document.querySelectorAll(".tree-item .name.changed").forEach(el => el.classList.remove("changed"));
  saveCurrentProject();
  logClone("Değişiklikler kaydedildi.");
}

/* ---------------- PROJECT NAME ---------------- */
els.projectName.addEventListener("change", () => {
  project.name = els.projectName.value.trim() || "Adsiz Proje";
  saveCurrentProject();
  renderProjectName();
});

/* ---------------- PANELS ---------------- */
els.activityItems.forEach(item => {
  item.addEventListener("click", () => {
    els.activityItems.forEach(i => i.classList.remove("active"));
    item.classList.add("active");
    const view = item.dataset.view;
    Object.entries(els.panels).forEach(([k,p]) => p.classList.toggle("hidden", k !== view));
    if (view === "slots") renderSlots();
  });
});

/* ---------------- CONTEXT MENUS ---------------- */
let contextTarget = null;
document.addEventListener("click", () => hideAllMenus());
function showContextMenu(type, x, y, target) {
  hideAllMenus();
  contextTarget = target;
  const menu = type === "file" ? els.menus.file : els.menus.tab;
  menu.style.left = x + "px";
  menu.style.top = y + "px";
  menu.classList.remove("hidden");
}
function hideAllMenus() {
  Object.values(els.menus).forEach(m => m.classList.add("hidden"));
  contextTarget = null;
}
els.menus.file.addEventListener("click", (e) => {
  if (e.target.tagName !== "LI") return;
  const action = e.target.dataset.action;
  const node = contextTarget;
  hideAllMenus();
  if (!node) return;
  const path = node.path;
  if (action === "new-file") {
    const fname = prompt("Dosya adı:"); if(!fname) return;
    const newPath = node.type === "folder" ? `${path}/${fname}` : path.replace(/\/?[^\/]+$/,"/") + fname;
    createFile(newPath);
  } else if (action === "new-folder") {
    const dname = prompt("Klasör adı:"); if(!dname) return;
    const newPath = node.type === "folder" ? `${path}/${dname}` : path.replace(/\/?[^\/]+$/,"/") + dname;
    createFolder(newPath);
  } else if (action === "rename") {
    if (node.type === "folder") {
      alert("Klasör rename desteklenmiyor (prototip).");
    } else {
      const newName = prompt("Yeni ad:", path.split("/").pop());
      if (!newName) return;
      const baseDir = path.includes("/") ? path.replace(/\/[^\/]+$/,"") : "";
      const newPath = baseDir ? baseDir + "/" + newName : newName;
      renamePath(path, newPath);
    }
  } else if (action === "delete") {
    if (node.type === "folder") deletePath(node.path);
    else deletePath(path);
  }
});

els.menus.tab.addEventListener("click", (e) => {
  if (e.target.tagName !== "LI") return;
  const action = e.target.dataset.action;
  const path = contextTarget.path;
  hideAllMenus();
  if (action === "close") {
    closeTab(path);
  } else if (action === "close-others") {
    project.openFiles = project.openFiles.filter(p => p === path);
    project.activeFile = path;
    saveCurrentProject(); renderTabs(); renderEditor();
  } else if (action === "close-all") {
    project.openFiles = []; project.activeFile = null;
    saveCurrentProject(); renderTabs(); renderEditor();
  }
});

/* ---------------- LOG / PROGRESS ---------------- */
function logClone(msg) {
  const div = document.createElement("div");
  div.textContent = msg;
  els.cloneProgress.appendChild(div);
  els.cloneProgress.scrollTop = els.cloneProgress.scrollHeight;
}

/* ---------------- GITHUB CLONE ---------------- */
els.cloneBtn.addEventListener("click", async () => {
  const url = els.githubUrl.value.trim();
  if (!url) { alert("URL girin"); return; }
  if (dirtyFiles.size > 0 && !confirm("Kaydedilmemiş değişiklikler silinebilir, klona devam?")) return;

  try {
    els.cloneProgress.innerHTML = "";
    logClone("Klon başlıyor...");
    const { owner, repo, branch } = parseGitHubUrl(url);
    logClone(`Repo: ${owner}/${repo} | Branch: ${branch || "(arayacak)"}`);
    const realBranch = await detectBranch(owner, repo, branch);
    logClone(`Branch kullanılacak: ${realBranch}`);
    const tree = await fetchRepoTree(owner, repo, realBranch);
    const blobs = tree.filter(i => i.type === "blob");
    logClone(`Toplam dosya: ${blobs.length}`);
    const newFiles = {};
    let count = 0;
    for (const b of blobs) {
      const raw = await fetchRaw(owner, repo, realBranch, b.path);
      newFiles[b.path] = raw;
      count++;
      if (count % 20 === 0) logClone(`İndirildi: ${count}/${blobs.length}`);
    }
    project = {
      name: repo,
      files: newFiles,
      openFiles: [],
      activeFile: null,
      created: nowISO(),
      updated: nowISO()
    };
    expandedFolders.clear();
    if (newFiles["README.md"]) openFile("README.md");
    else if (blobs.length > 0) openFile(blobs[0].path);
    dirtyFiles.clear();
    saveCurrentProject();
    fullRender();
    logClone("Klon tamamlandı.");
  } catch (err) {
    console.error(err);
    logClone("Hata: " + err.message);
  }
});

function parseGitHubUrl(url) {
  const m = url.match(/github\.com\/([^\/]+)\/([^\/#]+)(?:\/tree\/([^\/]+))?/);
  if (!m) throw new Error("Geçersiz GitHub URL");
  return { owner: m[1], repo: m[2].replace(/\.git$/,""), branch: m[3] || null };
}
async function detectBranch(owner, repo, branch) {
  if (branch) return branch;
  const candidates = ["main","master"];
  for (const c of candidates) {
    const res = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/branches/${c}`);
    if (res.status === 200) return c;
  }
  const info = await fetchJSON(`${GITHUB_API_BASE}/repos/${owner}/${repo}`);
  return info.default_branch;
}
async function fetchRepoTree(owner, repo, branch) {
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const json = await fetchJSON(url);
  if (!json.tree) throw new Error("Ağaç alınamadı.");
  return json.tree;
}
async function fetchRaw(owner, repo, branch, path) {
  const url = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
  const res = await fetch(url);
  if (!res.ok) return "";
  return await res.text();
}
async function fetchJSON(url, opt = {}) {
  const res = await fetch(url, opt);
  if (!res.ok) throw new Error("İstek başarısız: " + res.status);
  return await res.json();
}

/* ---------------- GITHUB PAT / AUTH ---------------- */
function loadPAT() { return localStorage.getItem(PAT_STORAGE_KEY) || ""; }
function savePAT(token) {
  localStorage.setItem(PAT_STORAGE_KEY, token);
  els.patInput.value = token;
  logClone("PAT kaydedildi (localStorage).");
}
function clearPAT() {
  localStorage.removeItem(PAT_STORAGE_KEY);
  githubUser = null;
  els.patInput.value = "";
  hideUserInfo();
  logClone("PAT silindi.");
}
function showUserInfo() {
  if (!githubUser) return;
  els.userInfoBox.style.display = "flex";
  els.userLogin.textContent = githubUser.login;
  els.userName.textContent = githubUser.name || "";
  els.userAvatar.src = githubUser.avatar_url;
  els.authBox.classList.add("authenticated");
}
function hideUserInfo() {
  els.userInfoBox.style.display = "none";
  els.authBox.classList.remove("authenticated");
}
async function validatePAT() {
  const token = loadPAT();
  if (!token) { alert("Önce PAT girin ve kaydedin."); return; }
  try {
    logClone("PAT doğrulanıyor...");
    const user = await githubAPIFetch("/user");
    githubUser = user;
    showUserInfo();
    logClone("Doğrulandı: " + user.login);
  } catch (e) {
    logClone("Doğrulama hatası: " + e.message);
    alert("Token geçersiz olabilir.");
  }
}
async function githubAPIFetch(path, options = {}) {
  const token = loadPAT();
  if (!token) throw new Error("PAT yok.");
  const headers = Object.assign({}, options.headers || {}, {
    "Authorization": "token " + token,
    "Accept": "application/vnd.github+json"
  });
  const res = await fetch(GITHUB_API_BASE + path, { ...options, headers });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`GitHub API Hatası ${res.status}: ${txt}`);
  }
  if (res.status === 204) return {};
  return await res.json();
}

/* ---------------- REPO LİSTELEME ---------------- */
async function listRepos() {
  const token = loadPAT();
  if (!token) { alert("PAT gir."); return; }
  logClone("Repo listesi çekiliyor...");
  els.repoSelect.innerHTML = `<option value="">(yükleniyor...)</option>`;
  try {
    const repos = await githubAPIFetch(`/user/repos?per_page=100&sort=updated`);
    repos.sort((a,b) => a.full_name.localeCompare(b.full_name));
    els.repoSelect.innerHTML = `<option value="">-- Repo Seç --</option>`;
    for (const r of repos) {
      const opt = document.createElement("option");
      opt.value = r.full_name;
      opt.textContent = r.full_name + (r.private ? " (private)" : "");
      els.repoSelect.appendChild(opt);
    }
    logClone(`Repo sayısı: ${repos.length}`);
  } catch (e) {
    logClone("Repo listesi çekilemedi: " + e.message);
  }
}

/* ---------------- BRANCH KONTROL / OLUŞTUR ---------------- */
async function checkBranch() {
  const repo = els.repoSelect.value;
  const branch = els.branchInput.value.trim();
  if (!repo || !branch) { alert("Repo ve branch girin."); return; }
  try {
    logClone(`Branch kontrol: ${branch}`);
    await githubAPIFetch(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    logClone("Branch mevcut.");
    return true;
  } catch (e) {
    logClone("Branch yok veya erişim yok: " + e.message);
    return false;
  }
}
async function createBranch() {
  const repo = els.repoSelect.value;
  const branch = els.branchInput.value.trim();
  if (!repo || !branch) { alert("Repo ve branch girin."); return; }
  try {
    const baseRef = await tryFindDefaultBaseRef(repo);
    logClone(`Yeni branch '${branch}' base: ${baseRef.object.sha}`);
    await githubAPIFetch(`/repos/${repo}/git/refs`, {
      method: "POST",
      body: JSON.stringify({
        ref: `refs/heads/${branch}`,
        sha: baseRef.object.sha
      })
    });
    logClone("Branch oluşturuldu.");
  } catch (e) {
    logClone("Branch oluşturma hatası: " + e.message);
  }
}
async function tryFindDefaultBaseRef(repo) {
  const candidates = ["main","master"];
  for (const c of candidates) {
    try {
      return await githubAPIFetch(`/repos/${repo}/git/ref/heads/${c}`);
    } catch {}
  }
  const repoInfo = await githubAPIFetch(`/repos/${repo}`);
  const def = repoInfo.default_branch;
  return await githubAPIFetch(`/repos/${repo}/git/ref/heads/${def}`);
}

/* ---------------- PUSH (TEK COMMIT) ---------------- */
async function pushProject() {
  if (!githubUser) { alert("Önce PAT doğrulayın."); return; }
  const repo = els.repoSelect.value;
  const branch = els.branchInput.value.trim() || "main";
  const prefix = els.prefixInput.value.trim().replace(/^\/|\/$/g,""); // opt
  const message = els.commitMsgInput.value.trim() || "DCT Code commit";
  if (!repo) { alert("Repo seç."); return; }

  const exists = await checkBranch();
  if (!exists) {
    const create = confirm("Branch yok. Oluşturulsun mu?");
    if (!create) return;
    await createBranch();
  }

  try {
    logClone("Push başlıyor...");
    const ref = await githubAPIFetch(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    const baseCommitSha = ref.object.sha;
    logClone("Base commit: " + baseCommitSha);

    const baseCommit = await githubAPIFetch(`/repos/${repo}/git/commits/${baseCommitSha}`);
    const baseTreeSha = baseCommit.tree.sha;
    logClone("Base tree: " + baseTreeSha);

    const fileEntries = Object.entries(project.files)
      .filter(([p]) => !p.endsWith(".dct_folder"));
    logClone(`Dosya sayısı (blob üretilecek): ${fileEntries.length}`);

    const treeItems = [];
    let done = 0;
    for (const [path, content] of fileEntries) {
      const finalPath = prefix ? `${prefix}/${path}` : path;
      const blob = await githubAPIFetch(`/repos/${repo}/git/blobs`, {
        method: "POST",
        body: JSON.stringify({
          content,
          encoding: "utf-8"
        })
      });
      treeItems.push({
        path: finalPath,
        mode: "100644",
        type: "blob",
        sha: blob.sha
      });
      done++;
      if (done % 10 === 0) logClone(`Blob oluşturuldu: ${done}/${fileEntries.length}`);
    }

    const newTree = await githubAPIFetch(`/repos/${repo}/git/trees`, {
      method: "POST",
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeItems
      })
    });
    logClone("Yeni tree: " + newTree.sha);

    const newCommit = await githubAPIFetch(`/repos/${repo}/git/commits`, {
      method: "POST",
      body: JSON.stringify({
        message,
        tree: newTree.sha,
        parents: [baseCommitSha]
      })
    });
    logClone("Yeni commit: " + newCommit.sha);

    await githubAPIFetch(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: "PATCH",
      body: JSON.stringify({ sha: newCommit.sha })
    });
    logClone("Push tamamlandı. Commit: " + newCommit.sha);
    alert("Push başarılı!");
  } catch (e) {
    logClone("Push hatası: " + e.message);
    alert("Push başarısız: " + e.message);
  }
}

/* ---------------- ZIP EXPORT ---------------- */
function exportProjectZip() {
  ensureProject();
  const files = Object.entries(project.files).filter(([p]) => !p.endsWith(".dct_folder"));
  if (files.length === 0) {
    alert("İndirilecek dosya yok.");
    return;
  }
  const blob = buildZip(files);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (project.name || "project") + ".zip";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1500);
  logClone("ZIP export oluşturuldu: " + a.download);
}

/* Basit (STORE) ZIP oluşturucu */
function buildZip(fileEntries) {
  const encoder = new TextEncoder();
  const fileDataParts = [];
  const centralDirParts = [];
  let offset = 0;
  const entriesMeta = [];

  function crc32(buf) {
    let table = crc32.table;
    if (!table) {
      table = crc32.table = [];
      for (let i = 0; i < 256; i++) {
        let c = i;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[i] = c >>> 0;
      }
    }
    let crc = 0 ^ (-1);
    for (let i = 0; i < buf.length; i++)
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
    return (crc ^ (-1)) >>> 0;
  }

  for (const [path, content] of fileEntries) {
    const nameBytes = encoder.encode(path);
    const dataBytes = encoder.encode(content);
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    // Local File Header
    const local = new DataView(new ArrayBuffer(30));
    let p = 0;
    local.setUint32(p, 0x04034b50, true); p += 4;
    local.setUint16(p, 10, true); p += 2; // version needed
    local.setUint16(p, 0, true); p += 2;  // flags
    local.setUint16(p, 0, true); p += 2;  // compression (0 store)
    local.setUint16(p, 0, true); p += 2;  // mod time
    local.setUint16(p, 0, true); p += 2;  // mod date
    local.setUint32(p, crc, true); p += 4;
    local.setUint32(p, size, true); p += 4;
    local.setUint32(p, size, true); p += 4;
    local.setUint16(p, nameBytes.length, true); p += 2;
    local.setUint16(p, 0, true); p += 2; // extra len

    fileDataParts.push(local, nameBytes, dataBytes);

    entriesMeta.push({
      nameBytes,
      crc,
      size,
      offset
    });
    offset += 30 + nameBytes.length + size;
  }

  let centralDirSize = 0;
  for (const meta of entriesMeta) {
    const cdir = new DataView(new ArrayBuffer(46));
    let p = 0;
    cdir.setUint32(p, 0x02014b50, true); p += 4; // central dir sig
    cdir.setUint16(p, 20, true); p += 2; // version made by
    cdir.setUint16(p, 10, true); p += 2; // version needed
    cdir.setUint16(p, 0, true); p += 2; // flags
    cdir.setUint16(p, 0, true); p += 2; // compression
    cdir.setUint16(p, 0, true); p += 2; // mod time
    cdir.setUint16(p, 0, true); p += 2; // mod date
    cdir.setUint32(p, meta.crc, true); p += 4;
    cdir.setUint32(p, meta.size, true); p += 4;
    cdir.setUint32(p, meta.size, true); p += 4;
    cdir.setUint16(p, meta.nameBytes.length, true); p += 2;
    cdir.setUint16(p, 0, true); p += 2; // extra
    cdir.setUint16(p, 0, true); p += 2; // comment
    cdir.setUint16(p, 0, true); p += 2; // disk number
    cdir.setUint16(p, 0, true); p += 2; // internal attrs
    cdir.setUint32(p, 0, true); p += 4; // external attrs
    cdir.setUint32(p, meta.offset, true); p += 4;
    centralDirParts.push(cdir, meta.nameBytes);
    centralDirSize += 46 + meta.nameBytes.length;
  }

  const end = new DataView(new ArrayBuffer(22));
  let q = 0;
  end.setUint32(q, 0x06054b50, true); q += 4; // end sig
  end.setUint16(q, 0, true); q += 2; // disk
  end.setUint16(q, 0, true); q += 2; // disk start
  end.setUint16(q, entriesMeta.length, true); q += 2;
  end.setUint16(q, entriesMeta.length, true); q += 2;
  end.setUint32(q, centralDirSize, true); q += 4;
  end.setUint32(q, offset, true); q += 4;
  end.setUint16(q, 0, true); q += 2; // comment length

  return new Blob([...fileDataParts, ...centralDirParts, end], { type: "application/zip" });
}

/* ---------------- INIT ---------------- */
function init() {
  project = loadCurrentProject() || createEmptyProject("DCT Project");
  applyTheme(loadTheme());
  saveCurrentProject();
  fullRender();
  renderSlots();

  // Explorer buttons
  if (els.newFileBtn)
    els.newFileBtn.addEventListener("click", () => {
      const name = prompt("Dosya adı:"); if (!name) return;
      createFile(name);
    });
  if (els.newFolderBtn)
    els.newFolderBtn.addEventListener("click", () => {
      const name = prompt("Klasör adı:"); if (!name) return;
      createFolder(name); renderFileTree();
    });
  if (els.newProjectBtn)
    els.newProjectBtn.addEventListener("click", newProject);
  if (els.exportZipBtn)
    els.exportZipBtn.addEventListener("click", exportProjectZip);

  if (els.themeToggle) els.themeToggle.addEventListener("click", toggleTheme);

  // PAT alanını doldur
  const existingPat = loadPAT();
  if (existingPat) els.patInput.value = existingPat;

  if (els.savePatBtn)
    els.savePatBtn.addEventListener("click", () => {
      const t = els.patInput.value.trim();
      if (!t) { alert("Token gir."); return; }
      savePAT(t);
    });
  if (els.clearPatBtn)
    els.clearPatBtn.addEventListener("click", () => {
      if (confirm("Token silinsin mi?")) clearPAT();
    });
  if (els.validatePatBtn)
    els.validatePatBtn.addEventListener("click", validatePAT);
  if (els.listReposBtn)
    els.listReposBtn.addEventListener("click", listRepos);
  if (els.checkBranchBtn)
    els.checkBranchBtn.addEventListener("click", checkBranch);
  if (els.createBranchBtn)
    els.createBranchBtn.addEventListener("click", createBranch);
  if (els.pushProjectBtn)
    els.pushProjectBtn.addEventListener("click", pushProject);

  window.addEventListener("beforeunload", (e) => {
    if (dirtyFiles.size > 0) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

init();
