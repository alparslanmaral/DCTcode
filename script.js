/* ÖNEMLİ NOT:
   Bu dosya önceki sürümünüzün üzerine yazılırsa tema, yeni proje, clone, push, slot gibi tüm özellikler burada birleşmiş haldedir.
   Eğer sizde zaten güncellenmiş bir script.js varsa diff alarak entegre edin.
*/

const STORAGE_KEY_CURRENT = "dctcode_current_project";
const STORAGE_KEY_SLOTS = "dctcode_slots";
const MAX_SLOTS = 5;
const THEME_STORAGE_KEY = "dctcode_theme";
const PAT_STORAGE_KEY = "dctcode_pat";
const GITHUB_API_BASE = "https://api.github.com";

// State
let project = null;
let fileTreeRoot = {};
let dirtyFiles = new Set();
let suppressEditor = false;
let githubUser = null; // Doğrulanmış kullanıcı objesi

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
  // GitHub Clone + Push
  githubUrl: document.getElementById("github-url"),
  cloneBtn: document.getElementById("btn-clone"),
  cloneProgress: document.getElementById("clone-progress"),

  // Explorer actions
  newFileBtn: document.getElementById("btn-new-file"),
  newFolderBtn: document.getElementById("btn-new-folder"),
  newProjectBtn: document.getElementById("btn-new-project"),

  // Theme
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

function buildTree(filesMap) {
  const root = { type:"folder", name:"/", children:{} };
  Object.keys(filesMap).sort().forEach(fp => {
    const parts = pathParts(fp);
    let cur = root;
    parts.forEach((part,i) => {
      const isLast = i === parts.length -1;
      if (!cur.children[part]) {
        cur.children[part] = isLast
          ? { type:"file", name:part, path: parts.slice(0,i+1).join("/") }
          : { type:"folder", name:part, children:{}, path: parts.slice(0,i+1).join("/") };
      }
      cur = cur.children[part];
    });
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
    item.addEventListener("click", e => {
      if (e.detail === 1) {
        const expanded = item.classList.toggle("expanded");
        twisty.textContent = expanded ? "▾" : "▸";
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
  saveCurrentProject();
  renderTabs();
  refreshActiveInTree();
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
  saveCurrentProject();
  openFile(path);
  renderFileTree();
}

function createFolder(path) {
  const marker = path.replace(/\/?$/,"/") + ".dct_folder";
  if (project.files[marker]) { alert("Klasör zaten var."); return; }
  project.files[marker] = "";
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
  saveCurrentProject();
  renderFileTree(); renderTabs(); refreshActiveInTree(); renderEditor();
}

function deletePath(path) {
  if (!project.files[path]) {
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

/* ---------------- GITHUB CLONE (MEVCUT) ---------------- */
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
function loadPAT() {
  return localStorage.getItem(PAT_STORAGE_KEY) || "";
}
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
    // Kullanıcıya ait repos (ilk 100)
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
  // main veya master referans alınmaya çalışılır
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
  // Sırayla main/master dene
  const candidates = ["main","master"];
  for (const c of candidates) {
    try {
      return await githubAPIFetch(`/repos/${repo}/git/ref/heads/${c}`);
    } catch {}
  }
  // HEAD fallback
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

  // Branch var mı?
  const exists = await checkBranch();
  if (!exists) {
    const create = confirm("Branch yok. Oluşturulsun mu?");
    if (!create) return;
    await createBranch();
  }

  try {
    logClone("Push başlıyor...");
    // 1) Ref al
    const ref = await githubAPIFetch(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    const baseCommitSha = ref.object.sha;
    logClone("Base commit: " + baseCommitSha);

    // 2) Base commit → tree sha
    const baseCommit = await githubAPIFetch(`/repos/${repo}/git/commits/${baseCommitSha}`);
    const baseTreeSha = baseCommit.tree.sha;
    logClone("Base tree: " + baseTreeSha);

    // 3) Dosyalardan blob oluştur
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

    // 4) Yeni tree
    const newTree = await githubAPIFetch(`/repos/${repo}/git/trees`, {
      method: "POST",
      body: JSON.stringify({
        base_tree: baseTreeSha,
        tree: treeItems
      })
    });
    logClone("Yeni tree: " + newTree.sha);

    // 5) Yeni commit
    const newCommit = await githubAPIFetch(`/repos/${repo}/git/commits`, {
      method: "POST",
      body: JSON.stringify({
        message,
        tree: newTree.sha,
        parents: [baseCommitSha]
      })
    });
    logClone("Yeni commit: " + newCommit.sha);

    // 6) Ref güncelle
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

/* ---------------- INIT ---------------- */
function init() {
  project = loadCurrentProject() || createEmptyProject("DCT Project");
  applyTheme(loadTheme());
  saveCurrentProject();
  fullRender();
  renderSlots();

  // Explorer buttons
  els.newFileBtn.addEventListener("click", () => {
    const name = prompt("Dosya adı:"); if (!name) return;
    createFile(name);
  });
  els.newFolderBtn.addEventListener("click", () => {
    const name = prompt("Klasör adı:"); if (!name) return;
    createFolder(name); renderFileTree();
  });
  els.newProjectBtn.addEventListener("click", newProject);

  if (els.themeToggle) els.themeToggle.addEventListener("click", toggleTheme);

  // PAT alanını doldur
  const existingPat = loadPAT();
  if (existingPat) els.patInput.value = existingPat;

  els.savePatBtn.addEventListener("click", () => {
    const t = els.patInput.value.trim();
    if (!t) { alert("Token gir."); return; }
    savePAT(t);
  });
  els.clearPatBtn.addEventListener("click", () => {
    if (confirm("Token silinsin mi?")) clearPAT();
  });
  els.validatePatBtn.addEventListener("click", validatePAT);
  els.listReposBtn.addEventListener("click", listRepos);
  els.checkBranchBtn.addEventListener("click", checkBranch);
  els.createBranchBtn.addEventListener("click", createBranch);
  els.pushProjectBtn.addEventListener("click", pushProject);

  window.addEventListener("beforeunload", (e) => {
    if (dirtyFiles.size > 0) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

init();