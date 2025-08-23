/* DCT Code - Basit VSCode benzeri editör
   Öz: Dosya sistemi = bellek + localStorage
   Yapı: project = { name, files: { path: content }, openFiles: [], activeFile, created, updated }
*/

const STORAGE_KEY_CURRENT = "dctcode_current_project";
const STORAGE_KEY_SLOTS = "dctcode_slots"; // array length 5 (null / {project})
const MAX_SLOTS = 5;

// State
let project = null;         // aktif proje objesi
let fileTreeRoot = {};      // ağaç yapısı için
let dirtyFiles = new Set(); // değişmiş dosyalar
let suppressEditor = false;

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
  menus: {
    file: document.getElementById("file-context"),
    tab: document.getElementById("tab-context")
  }
};

// ---------- Utility ----------
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
    files: {
      "README.md": "# " + name + "\n\nProjenize hoş geldiniz."
    },
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

function pathParts(p) {
  return p.split("/").filter(Boolean);
}

// Build file tree object => nested nodes { type:'folder'|'file', children:{}, name }
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

// ---------- Rendering ----------
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
    Object.values(node.children).forEach(child => {
      childrenWrap.appendChild(renderNode(child));
    });
    li.appendChild(childrenWrap);
    item.addEventListener("click", e => {
      if (e.detail === 1) {
        const expanded = item.classList.toggle("expanded");
        twisty.textContent = expanded ? "▾" : "▸";
      }
    });
  } else {
    item.addEventListener("click", () => {
      openFile(node.path);
    });
  }

  item.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    showContextMenu("file", e.pageX, e.pageY, node);
  });

  // Active style
  if (node.path === project.activeFile) {
    item.classList.add("active");
  }
  // Dirty mark
  if (dirtyFiles.has(node.path)) {
    name.classList.add("changed");
  }

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
    const shortName = path.split("/").pop();
    const title = document.createElement("span");
    title.textContent = shortName;
    if (dirtyFiles.has(path)) {
      const dirty = document.createElement("span");
      dirty.className = "dirty";
      dirty.textContent = " *";
      title.appendChild(dirty);
    }
    const close = document.createElement("span");
    close.className = "close-btn";
    close.textContent = "×";
    close.addEventListener("click", (e) => {
      e.stopPropagation();
      closeTab(path);
    });
    tab.appendChild(title);
    tab.appendChild(close);
    tab.addEventListener("click", (e) => {
      if (e.button === 0) openFile(path);
    });
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

// ---------- File Operations ----------
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
  if (project.activeFile === path) {
    project.activeFile = project.openFiles[project.openFiles.length -1] || null;
  }
  saveCurrentProject();
  renderTabs();
  renderEditor();
  refreshActiveInTree();
}

function createFile(path, content = "") {
  if (project.files[path]) {
    alert("Bu isimde dosya zaten var.");
    return;
  }
  project.files[path] = content;
  project.updated = nowISO();
  saveCurrentProject();
  openFile(path);
  renderFileTree();
}

function createFolder(path) {
  // Folder = placeholder by ensuring at least one hidden sentinel? VSCode'da boş klasör gösterilir.
  // Burada boş klasörleri göstermek için bir meta sistem gerekebilir. Basitlik için .dct_folder markerı koyabiliriz.
  const marker = path.replace(/\/?$/,"/") + ".dct_folder";
  if (project.files[marker]) {
    alert("Klasör zaten var.");
    return;
  }
  project.files[marker] = "";
  saveCurrentProject();
  renderFileTree();
}

function listFolderChildren(prefix) {
  const p = prefix.replace(/\/?$/,"/");
  return Object.keys(project.files).filter(f => f.startsWith(p));
}

function isFolderEmpty(folderPath) {
  const p = folderPath.replace(/\/?$/,"/");
  const children = listFolderChildren(folderPath).filter(f => f !== p + ".dct_folder");
  return children.length === 0;
}

function renamePath(oldPath, newPath) {
  if (project.files[newPath]) {
    alert("Yeni ad zaten mevcut.");
    return;
  }
  const content = project.files[oldPath];
  project.files[newPath] = content;
  delete project.files[oldPath];

  // tabs
  const oi = project.openFiles.indexOf(oldPath);
  if (oi >= 0) project.openFiles[oi] = newPath;
  if (project.activeFile === oldPath) project.activeFile = newPath;
  // dirty set
  if (dirtyFiles.has(oldPath)) {
    dirtyFiles.delete(oldPath);
    dirtyFiles.add(newPath);
  }
  saveCurrentProject();
  renderFileTree();
  renderTabs();
  refreshActiveInTree();
  renderEditor();
}

function deletePath(path) {
  if (!project.files[path]) {
    // might be folder sentinel
    // Delete all starting with path/
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

// ---------- Slots ----------
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
    buttons.appendChild(btnSave);
    buttons.appendChild(btnLoad);
    buttons.appendChild(btnClear);
    header.appendChild(buttons);
    const info = document.createElement("div");
    info.style.fontSize = "11px";
    info.style.color = "var(--text-dim)";
    if (slot) {
      info.textContent = `${slot.name} | ${slot.updated}`;
    } else {
      info.textContent = "Boş";
    }
    div.appendChild(header);
    div.appendChild(info);
    els.slotsList.appendChild(div);
  });
}

function saveToSlot(index) {
  if (!project) return;
  const slots = loadSlots();
  slots[index] = JSON.parse(JSON.stringify(project)); // derin kopya
  saveSlots(slots);
  renderSlots();
  flashProgress(`Slot ${index+1} kaydedildi.`);
}

function loadFromSlot(index) {
  const slots = loadSlots();
  const slot = slots[index];
  if (!slot) {
    alert("Slot boş");
    return;
  }
  if (dirtyFiles.size > 0 && !confirm("Kaydedilmemiş değişiklikler var. Yine de yüklemek?")) return;
  project = JSON.parse(JSON.stringify(slot));
  dirtyFiles.clear();
  saveCurrentProject();
  fullRender();
  flashProgress(`Slot ${index+1} yüklendi.`);
}

function clearSlot(index) {
  if (!confirm("Slot temizlensin mi?")) return;
  const slots = loadSlots();
  slots[index] = null;
  saveSlots(slots);
  renderSlots();
  flashProgress(`Slot ${index+1} temizlendi.`);
}

// ---------- Editor Events ----------
els.editor.addEventListener("input", () => {
  if (suppressEditor) return;
  if (!project.activeFile) return;
  project.files[project.activeFile] = els.editor.value;
  dirtyFiles.add(project.activeFile);
  updateStatusChanged();
  markDirtyUI(project.activeFile);
});

function markDirtyUI(path) {
  // Tab
  const tab = document.querySelector(`.tab[data-path="${CSS.escape(path)}"]`);
  if (tab && !tab.querySelector(".dirty")) {
    const title = tab.querySelector("span");
    const dirty = document.createElement("span");
    dirty.className = "dirty";
    dirty.textContent = " *";
    title.appendChild(dirty);
  }
  // Tree
  const treeName = document.querySelector(`.tree-item.file[data-path="${CSS.escape(path)}"] .name`);
  if (treeName && !treeName.classList.contains("changed")) {
    treeName.classList.add("changed");
  }
}

// Ctrl+S kaydet
document.addEventListener("keydown", (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
    e.preventDefault();
    saveAll();
  }
});

function saveAll() {
  if (dirtyFiles.size === 0) return;
  dirtyFiles.clear();
  updateStatusChanged();
  document.querySelectorAll(".tab .dirty").forEach(el => el.remove());
  document.querySelectorAll(".tree-item .name.changed").forEach(el => el.classList.remove("changed"));
  saveCurrentProject();
  flashProgress("Değişiklikler kaydedildi.");
}

// ---------- Project Name ----------
els.projectName.addEventListener("change", () => {
  project.name = els.projectName.value.trim() || "Adsiz Proje";
  saveCurrentProject();
  renderProjectName();
});

// ---------- Activity / Panels ----------
els.activityItems.forEach(item => {
  item.addEventListener("click", () => {
    els.activityItems.forEach(i => i.classList.remove("active"));
    item.classList.add("active");
    const view = item.dataset.view;
    Object.entries(els.panels).forEach(([k,p]) => {
      p.classList.toggle("hidden", k !== view);
    });
    if (view === "slots") renderSlots();
  });
});

// ---------- Context Menus ----------
let contextTarget = null;
document.addEventListener("click", () => hideAllMenus());
document.addEventListener("contextmenu", (e) => {
  // e.preventDefault() global engellemek istemiyoruz.
});

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
    const fname = prompt("Dosya adı:");
    if (!fname) return;
    const newPath = node.type === "folder" ? `${path}/${fname}` : path.replace(/\/?[^\/]+$/,"/") + fname;
    createFile(newPath);
  } else if (action === "new-folder") {
    const dname = prompt("Klasör adı:");
    if (!dname) return;
    const newPath = node.type === "folder" ? `${path}/${dname}` : path.replace(/\/?[^\/]+$/,"/") + dname;
    createFolder(newPath);
  } else if (action === "rename") {
    if (node.type === "folder") {
      alert("Basit prototipte klasör yeniden adlandırma desteklenmiyor (ileride genişlet).");
    } else {
      const newName = prompt("Yeni ad:", path.split("/").pop());
      if (!newName) return;
      const baseDir = path.includes("/") ? path.replace(/\/[^\/]+$/,"") : "";
      const newPath = baseDir ? baseDir + "/" + newName : newName;
      renamePath(path, newPath);
    }
  } else if (action === "delete") {
    if (node.type === "folder") {
      deletePath(node.path);
    } else {
      deletePath(path);
    }
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
    saveCurrentProject();
    renderTabs();
    renderEditor();
  } else if (action === "close-all") {
    project.openFiles = [];
    project.activeFile = null;
    saveCurrentProject();
    renderTabs();
    renderEditor();
  }
});

// ---------- GitHub Clone ----------
els.cloneBtn.addEventListener("click", async () => {
  const url = els.githubUrl.value.trim();
  if (!url) {
    alert("URL girin");
    return;
  }
  if (dirtyFiles.size > 0 && !confirm("Kaydedilmemiş değişiklikler silinebilir, klonlamaya devam?")) return;

  try {
    els.cloneProgress.innerHTML = "";
    flashProgress("Klon başlıyor...");
    const { owner, repo, branch } = parseGitHubUrl(url);
    logClone(`Repo: ${owner}/${repo} | Branch: ${branch || "(tarama...)"}`);
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
    // Açılsın diye README veya ilk dosya
    if (newFiles["README.md"]) {
      openFile("README.md");
    } else if (blobs.length > 0) {
      openFile(blobs[0].path);
    }
    dirtyFiles.clear();
    saveCurrentProject();
    fullRender();
    logClone("Klon tamamlandı.");
  } catch (err) {
    console.error(err);
    logClone("Hata: " + err.message);
  }
});

function logClone(msg) {
  const div = document.createElement("div");
  div.textContent = msg;
  els.cloneProgress.appendChild(div);
  els.cloneProgress.scrollTop = els.cloneProgress.scrollHeight;
}

function flashProgress(msg) {
  logClone(msg);
}

// Parse GitHub URL
function parseGitHubUrl(url) {
  // Örn: https://github.com/user/repo
  //      https://github.com/user/repo/tree/branch
  const m = url.match(/github\.com\/([^\/]+)\/([^\/#]+)(?:\/tree\/([^\/]+))?/);
  if (!m) throw new Error("Geçersiz GitHub URL");
  return { owner: m[1], repo: m[2].replace(/\.git$/,""), branch: m[3] || null };
}

async function detectBranch(owner, repo, branch) {
  if (branch) return branch;
  // main -> master fallback
  const candidates = ["main","master"];
  for (const c of candidates) {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches/${c}`);
    if (res.status === 200) return c;
  }
  // fallback: fetch repo default branch
  const info = await fetchJSON(`https://api.github.com/repos/${owner}/${repo}`);
  return info.default_branch;
}

async function fetchRepoTree(owner, repo, branch) {
  const url = `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
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

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("İstek başarısız: " + res.status);
  return await res.json();
}

// ---------- Init ----------
function init() {
  project = loadCurrentProject();
  if (!project) {
    project = createEmptyProject("DCT Project");
    saveCurrentProject();
  }
  fullRender();
  renderSlots();

  // Yeni dosya / klasör butonları
  els.newFileBtn.addEventListener("click", () => {
    const name = prompt("Dosya adı:");
    if (!name) return;
    createFile(name);
  });
  els.newFolderBtn.addEventListener("click", () => {
    const name = prompt("Klasör adı:");
    if (!name) return;
    createFolder(name);
    renderFileTree();
  });

  window.addEventListener("beforeunload", (e) => {
    if (dirtyFiles.size > 0) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

init();

// Gelecekte: drag-drop load, zip export, syntax highlight, Monaco integration
