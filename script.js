/* DCT Code - Geliştirilmiş Sürüm
   Yeni Özellikler:
   - Monaco Editor entegrasyonu
   - ZIP dışa aktarım (sıkıştırmasız "store")
   - Tema switcher (light/dark)
   - HTML/CSS/JS basit ek lint kuralları (Monaco + custom markers)
*/

const STORAGE_KEY_CURRENT = "dctcode_current_project";
const STORAGE_KEY_SLOTS = "dctcode_slots";
const STORAGE_KEY_THEME = "dct_theme";
const MAX_SLOTS = 5;

// State
let project = null;
let fileTreeRoot = {};
let dirtyFiles = new Set();
let monacoEditor = null;
let monacoModelCache = new Map(); // path -> model
let lintDebounceTimer = null;

const els = {
  activityItems: document.querySelectorAll(".activity-item"),
  panels: {
    explorer: document.getElementById("panel-explorer"),
    slots: document.getElementById("panel-slots"),
    github: document.getElementById("panel-github"),
    about: document.getElementById("panel-about"),
  },
  fileTree: document.getElementById("file-tree"),
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
  exportZipBtn: document.getElementById("btn-export-zip"),
  themeToggle: document.getElementById("theme-toggle"),
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

  if (node.path === project.activeFile) {
    item.classList.add("active");
  }
  if (dirtyFiles.has(node.path)) {
    name.classList.add("changed");
  }

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
    els.status.file.textContent = "No File";
    if (monacoEditor) monacoEditor.setModel(null);
    return;
  }
  els.status.file.textContent = active;
  loadModelForFile(active);
  updateStatusChanged();
}

function updateStatusChanged() {
  if (dirtyFiles.size === 0) {
    els.status.changed.textContent = "Saved";
    els.status.changed.className = "saved";
  } else {
    els.status.changed.textContent = "Unsaved (" + dirtyFiles.size + ")";
    els.status.changed.className = "dirty";
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

// ---------- Monaco Setup ----------
function initMonaco() {
  require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.43.0/min/vs' } });
  require(["vs/editor/editor.main"], () => {
    defineThemes();
    monacoEditor = monaco.editor.create(document.getElementById("editor"), {
      value: "",
      language: "javascript",
      automaticLayout: true,
      theme: getCurrentTheme() === "dark" ? "dct-dark" : "dct-light",
      fontSize: 14,
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      renderWhitespace: "none",
      smoothScrolling: true
    });

    monacoEditor.onDidChangeModelContent(() => {
      const path = project.activeFile;
      if (!path) return;
      project.files[path] = monacoEditor.getValue();
      dirtyFiles.add(path);
      markDirtyUI(path);
      updateStatusChanged();
      scheduleLint();
    });

    if (project && project.activeFile) {
      loadModelForFile(project.activeFile);
    }
    scheduleLint();
  });
}

function getLanguageForPath(path) {
  if (!path) return "plaintext";
  const ext = path.split(".").pop().toLowerCase();
  switch (ext) {
    case "js": return "javascript";
    case "ts": return "typescript";
    case "css": return "css";
    case "html":
    case "htm": return "html";
    case "json": return "json";
    case "md": return "markdown";
    default: return "plaintext";
  }
}

function loadModelForFile(path) {
  const lang = getLanguageForPath(path);
  let model = monacoModelCache.get(path);
  if (!model) {
    model = monaco.editor.createModel(project.files[path] ?? "", lang, monaco.Uri.parse("inmemory:///" + path));
    monacoModelCache.set(path, model);
  } else if (model.getValue() !== project.files[path]) {
    model.setValue(project.files[path]);
  }
  monacoEditor.setModel(model);
  scheduleLint();
}

function defineThemes() {
  monaco.editor.defineTheme("dct-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "", foreground: "dcdfe4" },
      { token: "comment", foreground: "5a6b78" },
      { token: "keyword", foreground: "d92632" },
    ],
    colors: {
      "editor.background": "#1e1f22",
      "editorLineNumber.foreground": "#5c6066",
      "editorLineNumber.activeForeground": "#ffffff",
      "editor.lineHighlightBackground": "#2c2f33",
      "editorCursor.foreground": "#d92632",
      "editor.selectionBackground": "#444a52",
      "editorIndentGuide.background": "#303236",
      "editorIndentGuide.activeBackground": "#565a60",
      "minimap.background": "#1e1f22"
    }
  });
  monaco.editor.defineTheme("dct-light", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "", foreground: "22262b" },
      { token: "comment", foreground: "8a98a6" },
      { token: "keyword", foreground: "c51724" },
    ],
    colors: {
      "editor.background": "#ffffff",
      "editorLineNumber.foreground": "#88929c",
      "editorLineNumber.activeForeground": "#1e1f22",
      "editor.lineHighlightBackground": "#f2f4f7",
      "editorCursor.foreground": "#c51724",
      "editor.selectionBackground": "#d4dde8",
      "editorIndentGuide.background": "#d3d8de",
      "editorIndentGuide.activeBackground": "#9ea4ab",
      "minimap.background": "#ffffff"
    }
  });
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

  const oi = project.openFiles.indexOf(oldPath);
  if (oi >= 0) project.openFiles[oi] = newPath;
  if (project.activeFile === oldPath) project.activeFile = newPath;
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
    info.textContent = slot ? `${slot.name} | ${slot.updated}` : "Boş";
    div.appendChild(header);
    div.appendChild(info);
    els.slotsList.appendChild(div);
  });
}

function saveToSlot(index) {
  if (!project) return;
  const slots = loadSlots();
  slots[index] = JSON.parse(JSON.stringify(project));
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

// ---------- Dirty UI ----------
function markDirtyUI(path) {
  const tab = document.querySelector(`.tab[data-path="${CSS.escape(path)}"]`);
  if (tab && !tab.querySelector(".dirty")) {
    const title = tab.querySelector("span");
    const dirty = document.createElement("span");
    dirty.className = "dirty";
    dirty.textContent = " *";
    title.appendChild(dirty);
  }
  const treeName = document.querySelector(`.tree-item.file[data-path="${CSS.escape(path)}"] .name`);
  if (treeName && !treeName.classList.contains("changed")) {
    treeName.classList.add("changed");
  }
}

// ---------- Save All (Ctrl+S) ----------
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
      alert("Basit prototipte klasör yeniden adlandırma desteklenmiyor.");
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

function parseGitHubUrl(url) {
  const m = url.match(/github\.com\/([^\/]+)\/([^\/#]+)(?:\/tree\/([^\/]+))?/);
  if (!m) throw new Error("Geçersiz GitHub URL");
  return { owner: m[1], repo: m[2].replace(/\.git$/,""), branch: m[3] || null };
}

async function detectBranch(owner, repo, branch) {
  if (branch) return branch;
  const candidates = ["main","master"];
  for (const c of candidates) {
    const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/branches/${c}`);
    if (res.status === 200) return c;
  }
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

// ---------- Tema Switcher ----------
function getCurrentTheme() {
  return localStorage.getItem(STORAGE_KEY_THEME) || "dark";
}

function applyTheme(t) {
  document.documentElement.setAttribute("data-theme", t);
  if (monacoEditor) {
    monaco.editor.setTheme(t === "dark" ? "dct-dark" : "dct-light");
  }
  els.themeToggle.textContent = t === "dark" ? "🌙" : "☀️";
}

els.themeToggle.addEventListener("click", () => {
  const next = getCurrentTheme() === "dark" ? "light" : "dark";
  localStorage.setItem(STORAGE_KEY_THEME, next);
  applyTheme(next);
});

// ---------- ZIP Export ----------
els.exportZipBtn.addEventListener("click", () => {
  exportProjectAsZip();
});

function exportProjectAsZip() {
  ensureProject();
  // Filtre: sentinel klasör markerlarını (".dct_folder") zip'e dahil etmiyoruz
  const entries = Object.entries(project.files)
    .filter(([p]) => !p.endsWith("/.dct_folder") && !p.endsWith(".dct_folder"));
  const zip = createZip(entries);
  const blob = new Blob([zip], { type: "application/zip" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (project.name || "project") + ".zip";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  flashProgress("ZIP oluşturuldu: " + a.download);
}

// Basit ZIP oluşturucu (store compression)
// Referans format: https://pkware.cachefly.net/webdocs/casestudies/APPNOTE.TXT
function createZip(entries) {
  const encoder = new TextEncoder();
  let fileRecords = [];
  let centralRecords = [];
  let localOffset = 0;

  function crc32(buf) {
    let table = crc32.table;
    if (!table) {
      table = crc32.table = new Uint32Array(256).map((_,n) => {
        let c = n;
        for (let k=0;k<8;k++) c = c & 1 ? 0xEDB88320 ^ (c>>>1) : c>>>1;
        return c >>> 0;
      });
    }
    let crc = -1;
    for (let i=0; i<buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ -1) >>> 0;
  }

  for (const [path, content] of entries) {
    const data = encoder.encode(content);
    const filenameBytes = encoder.encode(path);
    const crc = crc32(data);
    const localHeader = new DataView(new ArrayBuffer(30));
    // Local file header signature
    localHeader.setUint32(0, 0x04034b50, true);
    localHeader.setUint16(4, 20, true); // version needed
    localHeader.setUint16(6, 0, true);  // flags
    localHeader.setUint16(8, 0, true);  // compression (0=store)
    const dt = new Date();
    const dosTime = ((dt.getHours() << 11) | (dt.getMinutes() << 5) | (dt.getSeconds()/2)) & 0xFFFF;
    const dosDate = (((dt.getFullYear()-1980) << 9) | ((dt.getMonth()+1) << 5) | dt.getDate()) & 0xFFFF;
    localHeader.setUint16(10, dosTime, true);
    localHeader.setUint16(12, dosDate, true);
    localHeader.setUint32(14, crc, true);
    localHeader.setUint32(18, data.length, true);
    localHeader.setUint32(22, data.length, true);
    localHeader.setUint16(26, filenameBytes.length, true);
    localHeader.setUint16(28, 0, true); // extra length

    const localParts = [new Uint8Array(localHeader.buffer), filenameBytes, data];
    const localSize = localParts.reduce((s,p)=>s+p.length,0);
    fileRecords.push(...localParts);

    // Central directory header
    const central = new DataView(new ArrayBuffer(46));
    central.setUint32(0, 0x02014b50, true);
    central.setUint16(4, 0x0314, true); // version made by
    central.setUint16(6, 20, true); // version needed
    central.setUint16(8, 0, true);  // flags
    central.setUint16(10, 0, true); // compression
    central.setUint16(12, dosTime, true);
    central.setUint16(14, dosDate, true);
    central.setUint32(16, crc, true);
    central.setUint32(20, data.length, true);
    central.setUint32(24, data.length, true);
    central.setUint16(28, filenameBytes.length, true);
    central.setUint16(30, 0, true); // extra
    central.setUint16(32, 0, true); // comment
    central.setUint16(34, 0, true); // disk number
    central.setUint16(36, 0, true); // internal attrs
    central.setUint32(38, 0, true); // external attrs
    central.setUint32(42, localOffset, true); // relative offset
    centralRecords.push(new Uint8Array(central.buffer));
    centralRecords.push(filenameBytes);

    localOffset += localSize;
  }

  const centralSize = centralRecords.reduce((s,p)=>s+p.length,0);
  const centralOffset = localOffset;
  // End of central directory
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(4, 0, true);
  end.setUint16(6, 0, true);
  const fileCount = entries.length;
  end.setUint16(8, fileCount, true);
  end.setUint16(10, fileCount, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, centralOffset, true);
  end.setUint16(20, 0, true); // comment length

  const totalSize = localOffset + centralSize + 22;
  const out = new Uint8Array(totalSize);
  let offset = 0;
  for (const part of fileRecords) {
    out.set(part, offset);
    offset += part.length;
  }
  for (const part of centralRecords) {
    out.set(part, offset);
    offset += part.length;
  }
  out.set(new Uint8Array(end.buffer), offset);
  return out;
}

// ---------- Linting (Custom Markers) ----------
function scheduleLint() {
  if (lintDebounceTimer) clearTimeout(lintDebounceTimer);
  lintDebounceTimer = setTimeout(runCustomLint, 400);
}

function runCustomLint() {
  if (!project || !project.activeFile || !monacoEditor) return;
  const path = project.activeFile;
  const model = monacoEditor.getModel();
  if (!model) return;
  const value = model.getValue();
  const lang = getLanguageForPath(path);

  let markers = [];

  if (lang === "html") {
    markers.push(...lintHTML(value, model));
  } else if (lang === "css") {
    markers.push(...lintCSS(value, model));
  } else if (lang === "javascript") {
    markers.push(...lintJS(value, model));
  }

  monaco.editor.setModelMarkers(model, "dct-custom", markers);
}

// HTML linter: img alt eksik, duplicate id
function lintHTML(text, model) {
  let markers = [];
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, "text/html");
    const parserErrors = doc.querySelectorAll("parsererror");
    parserErrors.forEach(pe => {
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: "HTML parse hatası",
        startLineNumber: 1,
        startColumn: 1,
        endLineNumber: 1,
        endColumn: 1
      });
    });
    // img alt
    const imgs = doc.querySelectorAll("img");
    imgs.forEach(img => {
      if (!img.hasAttribute("alt") || img.getAttribute("alt").trim() === "") {
        // Basit line bulma
        const src = img.getAttribute("src") || "";
        const lineInfo = findFirstLineContaining(model, "<img", src);
        markers.push({
          severity: monaco.MarkerSeverity.Warning,
            message: "<img> alt attribute eksik",
          ...lineInfo
        });
      }
    });
    // duplicate id
    const used = new Map();
    doc.querySelectorAll("[id]").forEach(el => {
      const id = el.id;
      if (!used.has(id)) used.set(id, []);
      used.get(id).push(el);
    });
    for (const [id, arr] of used.entries()) {
      if (arr.length > 1) {
        const lineInfo = findFirstLineContaining(model, `id=`, id);
        markers.push({
          severity: monaco.MarkerSeverity.Warning,
          message: `Tekrarlanan id: ${id}`,
          ...lineInfo
        });
      }
    }
  } catch {
    // ignore
  }
  return markers;
}

function findFirstLineContaining(model, needle, secondNeedle="") {
  const lines = model.getLinesContent();
  for (let i=0;i<lines.length;i++) {
    if (lines[i].includes(needle) && (secondNeedle==="" || lines[i].includes(secondNeedle))) {
      return {
        startLineNumber: i+1,
        startColumn: 1,
        endLineNumber: i+1,
        endColumn: lines[i].length+1
      };
    }
  }
  return { startLineNumber:1, startColumn:1, endLineNumber:1, endColumn:1 };
}

// CSS linter: basit property whitelist
const CSS_PROPERTY_WHITELIST = new Set([
  "color","background","background-color","margin","margin-left","margin-right","margin-top","margin-bottom",
  "padding","padding-left","padding-right","padding-top","padding-bottom","border","border-radius",
  "display","flex","flex-direction","justify-content","align-items","font-size","font-family","font-weight",
  "line-height","width","height","max-width","min-width","max-height","min-height","position","top","left","right","bottom",
  "overflow","overflow-y","overflow-x","z-index","cursor","opacity","box-shadow","text-align","letter-spacing",
  "grid","grid-template-columns","grid-template-rows","gap","background-image","background-position","background-size",
  "background-repeat","transition","transform","visibility","white-space","text-overflow","content"
]);

function lintCSS(text, model) {
  const markers = [];
  const lines = model.getLinesContent();
  const braceStack = [];
  lines.forEach((ln, idx) => {
    for (const ch of ln) {
      if (ch === '{') braceStack.push(idx);
      else if (ch === '}') {
        if (braceStack.length === 0) {
          markers.push({
            severity: monaco.MarkerSeverity.Error,
            message: "Eşleşmeyen '}'",
            startLineNumber: idx+1,
            startColumn: 1,
            endLineNumber: idx+1,
            endColumn: ln.length+1
          });
        } else {
          braceStack.pop();
        }
      }
    }
    const m = ln.match(/^\s*([a-zA-Z-]+)\s*:/);
    if (m) {
      const prop = m[1].toLowerCase();
      if (!CSS_PROPERTY_WHITELIST.has(prop)) {
        markers.push({
          severity: monaco.MarkerSeverity.Warning,
          message: "Bilinmeyen CSS property: " + prop,
          startLineNumber: idx+1,
          startColumn: 1,
          endLineNumber: idx+1,
          endColumn: ln.length+1
        });
      }
    }
  });
  if (braceStack.length > 0) {
    braceStack.forEach(lineIdx => {
      markers.push({
        severity: monaco.MarkerSeverity.Error,
        message: "Açılan '{' kapatılmamış",
        startLineNumber: lineIdx+1,
        startColumn: 1,
        endLineNumber: lineIdx+1,
        endColumn: lines[lineIdx].length+1
      });
    });
  }
  return markers;
}

// JS linter: TODO işaretleri info olarak
function lintJS(text, model) {
  const markers = [];
  const lines = model.getLinesContent();
  lines.forEach((ln, idx) => {
    if (ln.includes("TODO")) {
      markers.push({
        severity: monaco.MarkerSeverity.Info,
        message: "TODO bulundu",
        startLineNumber: idx+1,
        startColumn: 1,
        endLineNumber: idx+1,
        endColumn: ln.length+1
      });
    }
  });
  return markers;
}

// ---------- Init ----------
function init() {
  // Tema yükle
  applyTheme(getCurrentTheme());

  project = loadCurrentProject();
  if (!project) {
    project = createEmptyProject("DCT Project");
    saveCurrentProject();
  }
  fullRender();
  renderSlots();

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

  initMonaco();
}

init();

// Gelecek geliştirmeler: arama, drag-drop, git push, terminal, auto-format vb.
