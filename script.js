/* DCT Code - Stabil Sürüm (Klasör & Dosya Açma Fix + ZIP Export)
   Düzeltmeler:
   - Deterministik buildTree (sentinel -> klasör)
   - openFile içinde gereksiz yeniden render kaldırıldı
   - Klasör & dosya oluşturunca parent'lar expand
   - Boş klasör doğru görünüyor
*/

const STORAGE_KEY_CURRENT = "dctcode_current_project";
const STORAGE_KEY_SLOTS = "dctcode_slots";
const MAX_SLOTS = 5;
const THEME_STORAGE_KEY = "dctcode_theme";
const PAT_STORAGE_KEY = "dctcode_pat";
const GITHUB_API_BASE = "https://api.github.com";

let project = null;
let fileTreeRoot = {};
let dirtyFiles = new Set();
let suppressEditor = false;
let githubUser = null;
const expandedFolders = new Set();

let DCT_DEBUG = false; // Konsolda debug istiyorsan true yap veya window.DCT_DEBUG = true

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
  exportZipBtn: document.getElementById("btn-export-zip"),

  themeToggle: document.getElementById("btn-theme-toggle"),

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

/* ---------------- HELPERS ---------------- */
function dbg(...a){ if(DCT_DEBUG) console.log("[DCT]", ...a); }
function nowISO(){ return new Date().toISOString(); }
function pathParts(p){ return p.split("/").filter(Boolean); }
function normalizePath(p){
  return p.replace(/\\/g,"/").replace(/\/+/g,"/").replace(/^\//,"").replace(/\s+$/,"");
}
function ensureProject(){
  if(!project){
    project = createEmptyProject("DCT Project");
    saveCurrentProject();
  }
}
function createEmptyProject(name="Yeni Proje"){
  return {
    name,
    files:{ "README.md": "# "+name+"\n\nProjenize hoş geldiniz." },
    openFiles:["README.md"],
    activeFile:"README.md",
    created: nowISO(),
    updated: nowISO()
  };
}
function saveCurrentProject(){
  if(!project) return;
  project.updated = nowISO();
  localStorage.setItem(STORAGE_KEY_CURRENT, JSON.stringify(project));
}
function loadCurrentProject(){
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY_CURRENT)||"null"); } catch { return null; }
}

/* ---------------- BUILD TREE (YENİ) ----------------
   Strateji:
   1. Tüm sentinel (.dct_folder) dosyalarından klasör set’i çıkarılır.
   2. Klasör set’ine dosyaların parent klasörleri de eklenir.
   3. Önce klasör düğümleri, sonra dosya düğümleri oluşturulur.
*/
function buildTree(filesMap){
  const root = { type:"folder", name:"/", children:{} };
  const folderSet = new Set();

  Object.keys(filesMap).forEach(fp=>{
    if(fp.endsWith(".dct_folder")){
      const folderPath = fp.replace(/\/\.dct_folder$/,"").replace(/\/$/,"");
      if(folderPath) folderSet.add(folderPath);
    }
  });

  Object.keys(filesMap).forEach(fp=>{
    if(fp.endsWith(".dct_folder")) return;
    const parts = pathParts(fp);
    if(parts.length > 1){
      for(let i=1;i<parts.length;i++){
        const folderPath = parts.slice(0,i).join("/");
        folderSet.add(folderPath);
      }
    }
  });

  function ensureFolderNode(folderPath){
    const parts = pathParts(folderPath);
    let cur = root;
    let accum = [];
    for(let i=0;i<parts.length;i++){
      accum.push(parts[i]);
      const segPath = accum.join("/");
      if(!cur.children[parts[i]]){
        cur.children[parts[i]] = { type:"folder", name:parts[i], children:{}, path:segPath };
      } else if(cur.children[parts[i]].type === "file"){
        // Yanlışlıkla file olmuşsa dönüştür
        cur.children[parts[i]] = { type:"folder", name:parts[i], children:{}, path:segPath };
      }
      cur = cur.children[parts[i]];
    }
    return cur;
  }

  // Klasörleri oluştur
  Array.from(folderSet).sort().forEach(f=>ensureFolderNode(f));

  // Dosyalar
  Object.keys(filesMap).sort().forEach(fp=>{
    if(fp.endsWith(".dct_folder")) return;
    const parts = pathParts(fp);
    const fileName = parts[parts.length-1];
    let parent = root;
    if(parts.length>1){
      const folderPath = parts.slice(0,-1).join("/");
      parent = ensureFolderNode(folderPath);
    }
    if(!parent.children[fileName]){
      parent.children[fileName] = { type:"file", name:fileName, path:fp };
    }
  });

  return root;
}

/* ---------------- RENDERING ---------------- */
function renderFileTree(){
  ensureProject();
  fileTreeRoot = buildTree(project.files);
  els.fileTree.innerHTML = "";
  Object.values(fileTreeRoot.children).forEach(node=>{
    els.fileTree.appendChild(renderNode(node));
  });
  refreshActiveInTree();
}

function renderNode(node){
  const li = document.createElement("li");
  const item = document.createElement("div");
  item.className = "tree-item "+node.type + (node.type==="folder"?" folder":" file");
  item.dataset.path = node.path || node.name;

  const twisty = document.createElement("span");
  twisty.className = "twisty";
  twisty.textContent = node.type==="folder" ? (expandedFolders.has(node.path) ? "▾" : "▸") : "";

  const icon = document.createElement("span");
  icon.className = "icon";
  icon.textContent = node.type==="folder" ? "📁" : "📄";

  const name = document.createElement("span");
  name.className = "name";
  name.textContent = node.name;

  item.appendChild(twisty);
  item.appendChild(icon);
  item.appendChild(name);
  li.appendChild(item);

  if(node.type==="folder"){
    const childrenWrap = document.createElement("div");
    childrenWrap.className = "children";
    Object.values(node.children).forEach(ch=>{
      childrenWrap.appendChild(renderNode(ch));
    });
    if(expandedFolders.has(node.path)){
      item.classList.add("expanded");
    } else {
      childrenWrap.style.display = "none";
    }
    item.addEventListener("click",(e)=>{
      if(e.detail===1){
        const expanded = item.classList.toggle("expanded");
        if(expanded){
          twisty.textContent = "▾";
          childrenWrap.style.display = "";
          expandedFolders.add(node.path);
        } else {
          twisty.textContent = "▸";
          childrenWrap.style.display = "none";
          expandedFolders.delete(node.path);
        }
      }
    });
    li.appendChild(childrenWrap);
  } else {
    item.addEventListener("click",()=>{
      openFile(node.path);
    });
  }

  item.addEventListener("contextmenu",(e)=>{
    e.preventDefault();
    showContextMenu("file", e.pageX, e.pageY, node);
  });

  if(node.type==="file" && node.path === project.activeFile){
    item.classList.add("active");
  }
  if(node.type==="file" && dirtyFiles.has(node.path)){
    name.classList.add("changed");
  }

  return li;
}

function refreshActiveInTree(){
  document.querySelectorAll(".tree-item.file.active").forEach(el=>el.classList.remove("active"));
  if(!project.activeFile) return;
  const el = document.querySelector(`.tree-item.file[data-path="${CSS.escape(project.activeFile)}"]`);
  if(el) el.classList.add("active");
}

function renderTabs(){
  els.tabsBar.innerHTML = "";
  project.openFiles.forEach(p=>{
    const tab = document.createElement("div");
    tab.className = "tab" + (p===project.activeFile?" active":"");
    tab.dataset.path = p;
    const title = document.createElement("span");
    title.textContent = p.split("/").pop();
    if(dirtyFiles.has(p)){
      const d = document.createElement("span");
      d.className="dirty"; d.textContent=" *";
      title.appendChild(d);
    }
    const close = document.createElement("span");
    close.className="close-btn"; close.textContent="×";
    close.addEventListener("click",(e)=>{ e.stopPropagation(); closeTab(p); });
    tab.appendChild(title);
    tab.appendChild(close);
    tab.addEventListener("click",()=>openFile(p));
    tab.addEventListener("contextmenu",(e)=>{
      e.preventDefault();
      showContextMenu("tab", e.pageX,e.pageY,{path:p});
    });
    els.tabsBar.appendChild(tab);
  });
}

function renderEditor(){
  const f = project.activeFile;
  if(!f){
    els.editor.value="";
    els.editor.disabled=true;
    els.status.file.textContent="No File";
    return;
  }
  els.editor.disabled=false;
  suppressEditor = true;
  els.editor.value = project.files[f] ?? "";
  suppressEditor = false;
  els.status.file.textContent = f;
  updateStatusChanged();
}

function renderProjectName(){
  els.projectName.value = project.name;
  els.status.project.textContent = project.name;
}
function fullRender(){
  renderProjectName();
  renderFileTree();
  renderTabs();
  renderEditor();
}

function updateStatusChanged(){
  if(dirtyFiles.size===0){
    els.status.changed.textContent="Saved";
    els.status.changed.className="saved";
  } else {
    els.status.changed.textContent="Unsaved ("+dirtyFiles.size+")";
    els.status.changed.className="dirty";
  }
}

/* ---------------- FILE OPS ---------------- */
function revealParents(path){
  const parts = pathParts(path);
  for(let i=1;i<parts.length;i++){
    const fp = parts.slice(0,i).join("/");
    expandedFolders.add(fp);
  }
}

function openFile(path){
  ensureProject();
  path = normalizePath(path);
  if(!project.files[path]) {
    dbg("openFile: path yok", path);
    return;
  }
  if(!project.openFiles.includes(path)) project.openFiles.push(path);
  project.activeFile = path;
  revealParents(path);
  saveCurrentProject();
  renderTabs();
  refreshActiveInTree();
  // renderFileTree() ÇAĞIRMADIK — event kaybını önler
  renderEditor();
}

function closeTab(path){
  const idx = project.openFiles.indexOf(path);
  if(idx>=0) project.openFiles.splice(idx,1);
  if(project.activeFile === path){
    project.activeFile = project.openFiles[project.openFiles.length-1] || null;
  }
  saveCurrentProject();
  renderTabs();
  renderEditor();
  refreshActiveInTree();
}

function createFile(path, content=""){
  path = normalizePath(path);
  if(!path){
    alert("Geçersiz dosya adı");
    return;
  }
  if(project.files[path]){
    alert("Bu isimde dosya var.");
    return;
  }
  project.files[path] = content;
  revealParents(path);
  saveCurrentProject();
  openFile(path);
  renderFileTree(); // yeni düğümü göstermek için
}

function createFolder(path){
  path = normalizePath(path);
  if(!path){
    alert("Geçersiz klasör adı");
    return;
  }
  const sentinel = path + "/.dct_folder";
  if(project.files[sentinel]){
    alert("Klasör zaten var.");
    return;
  }
  project.files[sentinel] = "";
  expandedFolders.add(path);
  revealParents(path+"/x"); // parentları aç
  saveCurrentProject();
  renderFileTree();
}

function renamePath(oldPath,newPath){
  oldPath = normalizePath(oldPath);
  newPath = normalizePath(newPath);
  if(project.files[newPath]){ alert("Yeni ad zaten mevcut."); return; }
  const content = project.files[oldPath];
  project.files[newPath] = content;
  delete project.files[oldPath];
  const oi = project.openFiles.indexOf(oldPath);
  if(oi>=0) project.openFiles[oi] = newPath;
  if(project.activeFile === oldPath) project.activeFile = newPath;
  if(dirtyFiles.has(oldPath)){ dirtyFiles.delete(oldPath); dirtyFiles.add(newPath); }
  revealParents(newPath);
  saveCurrentProject();
  fullRender();
}

function deletePath(path){
  path = normalizePath(path);
  if(project.files[path]) {
    if(!confirm("Silinsin mi? "+path)) return;
    delete project.files[path];
    dirtyFiles.delete(path);
    const idx = project.openFiles.indexOf(path);
    if(idx>=0) project.openFiles.splice(idx,1);
    if(project.activeFile === path){
      project.activeFile = project.openFiles[project.openFiles.length-1] || null;
    }
    saveCurrentProject();
    fullRender();
    return;
  }
  // Klasör olabilir:
  const prefix = path.replace(/\/?$/,"/");
  const keys = Object.keys(project.files).filter(k=>k.startsWith(prefix));
  if(keys.length===0){ dbg("Silinecek path bulunamadı", path); return; }
  if(!confirm("Klasörü silmek istediğinize emin misiniz?\n"+path)) return;
  keys.forEach(k=>{
    delete project.files[k];
    dirtyFiles.delete(k);
    const idx = project.openFiles.indexOf(k);
    if(idx>=0) project.openFiles.splice(idx,1);
  });
  if(project.activeFile && !project.files[project.activeFile]){
    project.activeFile = project.openFiles[project.openFiles.length-1] || null;
  }
  expandedFolders.delete(path);
  saveCurrentProject();
  fullRender();
}

/* ---------------- NEW PROJECT ---------------- */
function newProject(){
  if(dirtyFiles.size>0){
    if(!confirm("Kaydedilmemiş değişiklikler var. Yeni proje oluşturulsun mu?")) return;
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
function loadSlots(){
  let raw = localStorage.getItem(STORAGE_KEY_SLOTS);
  if(!raw){
    const arr = new Array(MAX_SLOTS).fill(null);
    localStorage.setItem(STORAGE_KEY_SLOTS, JSON.stringify(arr));
    return arr;
  }
  try { return JSON.parse(raw); } catch { return new Array(MAX_SLOTS).fill(null); }
}
function saveSlots(slots){ localStorage.setItem(STORAGE_KEY_SLOTS, JSON.stringify(slots)); }

function renderSlots(){
  const slots = loadSlots();
  els.slotsList.innerHTML="";
  slots.forEach((slot,i)=>{
    const div = document.createElement("div");
    div.className = "slot"+(!slot?" empty":"");
    const header = document.createElement("div");
    header.className = "slot-header";
    header.innerHTML = `<span>Slot ${i+1}</span>`;
    const buttons = document.createElement("div");
    buttons.className="slot-buttons";
    const bSave = document.createElement("button");
    bSave.textContent="Kaydet";
    bSave.addEventListener("click",()=>saveToSlot(i));
    const bLoad = document.createElement("button");
    bLoad.textContent="Yükle"; bLoad.disabled=!slot;
    bLoad.addEventListener("click",()=>loadFromSlot(i));
    const bClear = document.createElement("button");
    bClear.textContent="Sil"; bClear.disabled=!slot;
    bClear.addEventListener("click",()=>clearSlot(i));
    buttons.append(bSave,bLoad,bClear);
    header.appendChild(buttons);
    const info = document.createElement("div");
    info.style.fontSize="11px"; info.style.color="var(--text-dim)";
    info.textContent = slot ? `${slot.name} | ${slot.updated}` : "Boş";
    div.append(header,info);
    els.slotsList.appendChild(div);
  });
}
function saveToSlot(i){
  if(!project) return;
  const slots = loadSlots();
  slots[i] = JSON.parse(JSON.stringify(project));
  saveSlots(slots);
  renderSlots();
  logClone(`Slot ${i+1} kaydedildi.`);
}
function loadFromSlot(i){
  const slots = loadSlots();
  const slot = slots[i];
  if(!slot){ alert("Slot boş"); return; }
  if(dirtyFiles.size>0 && !confirm("Kaydedilmemiş değişiklikler var. Yine de yükle?")) return;
  project = JSON.parse(JSON.stringify(slot));
  dirtyFiles.clear();
  expandedFolders.clear();
  saveCurrentProject();
  fullRender();
  logClone(`Slot ${i+1} yüklendi.`);
}
function clearSlot(i){
  if(!confirm("Slot temizlensin mi?")) return;
  const slots = loadSlots();
  slots[i]=null;
  saveSlots(slots);
  renderSlots();
  logClone(`Slot ${i+1} temizlendi.`);
}

/* ---------------- EDITOR ---------------- */
els.editor.addEventListener("input",()=>{
  if(suppressEditor) return;
  if(!project.activeFile) return;
  project.files[project.activeFile] = els.editor.value;
  dirtyFiles.add(project.activeFile);
  updateStatusChanged();
  markDirtyUI(project.activeFile);
});
function markDirtyUI(path){
  const tab = document.querySelector(`.tab[data-path="${CSS.escape(path)}"]`);
  if(tab && !tab.querySelector(".dirty")){
    const span = tab.querySelector("span");
    const d = document.createElement("span");
    d.className="dirty"; d.textContent=" *";
    span.appendChild(d);
  }
  const treeName = document.querySelector(`.tree-item.file[data-path="${CSS.escape(path)}"] .name`);
  if(treeName && !treeName.classList.contains("changed")){
    treeName.classList.add("changed");
  }
}

/* ---------------- SHORTCUTS ---------------- */
document.addEventListener("keydown",(e)=>{
  if((e.ctrlKey||e.metaKey) && e.key.toLowerCase()==="s"){ e.preventDefault(); saveAll(); }
  if((e.ctrlKey||e.metaKey) && e.shiftKey && e.key.toLowerCase()==="n"){ e.preventDefault(); newProject(); }
  if((e.ctrlKey||e.metaKey) && e.altKey && e.key.toLowerCase()==="t"){ e.preventDefault(); toggleTheme(); }
});
function saveAll(){
  if(dirtyFiles.size===0) return;
  dirtyFiles.clear();
  updateStatusChanged();
  document.querySelectorAll(".tab .dirty").forEach(el=>el.remove());
  document.querySelectorAll(".tree-item .name.changed").forEach(el=>el.classList.remove("changed"));
  saveCurrentProject();
  logClone("Değişiklikler kaydedildi.");
}

/* ---------------- PROJECT NAME ---------------- */
els.projectName.addEventListener("change",()=>{
  project.name = els.projectName.value.trim() || "Adsiz Proje";
  saveCurrentProject();
  renderProjectName();
});

/* ---------------- CONTEXT MENUS ---------------- */
let contextTarget = null;
document.addEventListener("click", ()=>hideAllMenus());
function showContextMenu(type,x,y,target){
  hideAllMenus();
  contextTarget=target;
  const menu = type==="file" ? els.menus.file : els.menus.tab;
  menu.style.left = x+"px";
  menu.style.top = y+"px";
  menu.classList.remove("hidden");
}
function hideAllMenus(){
  Object.values(els.menus).forEach(m=>m.classList.add("hidden"));
  contextTarget=null;
}
els.menus.file.addEventListener("click",(e)=>{
  if(e.target.tagName!=="LI") return;
  const action = e.target.dataset.action;
  const node = contextTarget;
  hideAllMenus();
  if(!node) return;
  const path = node.path;
  if(action==="new-file"){
    const fname = prompt("Dosya adı:"); if(!fname)return;
    const base = node.type==="folder" ? path : path.replace(/\/?[^\/]+$/,"");
    const full = base ? base + "/" + fname : fname;
    createFile(full);
  } else if(action==="new-folder"){
    const dname = prompt("Klasör adı:"); if(!dname)return;
    const base = node.type==="folder" ? path : path.replace(/\/?[^\/]+$/,"");
    const full = base ? base + "/" + dname : dname;
    createFolder(full);
  } else if(action==="rename"){
    if(node.type==="folder"){
      alert("Klasör rename henüz yok.");
    } else {
      const newName = prompt("Yeni ad:", path.split("/").pop()); if(!newName) return;
      const baseDir = path.includes("/") ? path.replace(/\/[^\/]+$/,"") : "";
      const newPath = baseDir ? baseDir + "/" + newName : newName;
      renamePath(path,newPath);
    }
  } else if(action==="delete"){
    if(node.type==="folder") deletePath(node.path); else deletePath(path);
  }
});
els.menus.tab.addEventListener("click",(e)=>{
  if(e.target.tagName!=="LI") return;
  const action = e.target.dataset.action;
  const path = contextTarget.path;
  hideAllMenus();
  if(action==="close") closeTab(path);
  else if(action==="close-others"){
    project.openFiles = project.openFiles.filter(p=>p===path);
    project.activeFile = path;
    saveCurrentProject(); renderTabs(); renderEditor();
  } else if(action==="close-all"){
    project.openFiles = []; project.activeFile=null;
    saveCurrentProject(); renderTabs(); renderEditor();
  }
});

/* ---------------- LOG ---------------- */
function logClone(msg){
  const div = document.createElement("div");
  div.textContent = msg;
  els.cloneProgress.appendChild(div);
  els.cloneProgress.scrollTop = els.cloneProgress.scrollHeight;
}

/* ---------------- GITHUB CLONE ---------------- */
if(els.cloneBtn){
  els.cloneBtn.addEventListener("click", async ()=>{
    const url = els.githubUrl.value.trim();
    if(!url){ alert("URL girin"); return; }
    if(dirtyFiles.size>0 && !confirm("Kaydedilmemiş değişiklikler silinebilir, devam?")) return;
    try{
      els.cloneProgress.innerHTML="";
      logClone("Klon başlıyor...");
      const { owner, repo, branch } = parseGitHubUrl(url);
      const realBranch = await detectBranch(owner, repo, branch);
      logClone(`Branch: ${realBranch}`);
      const tree = await fetchRepoTree(owner, repo, realBranch);
      const blobs = tree.filter(i=>i.type==="blob");
      logClone(`Toplam dosya: ${blobs.length}`);
      const newFiles = {};
      let c=0;
      for(const b of blobs){
        const raw = await fetchRaw(owner, repo, realBranch, b.path);
        newFiles[b.path] = raw;
        c++;
        if(c%20===0) logClone(`İndirildi: ${c}/${blobs.length}`);
      }
      project = {
        name: repo,
        files: newFiles,
        openFiles: [],
        activeFile: null,
        created: nowISO(),
        updated: nowISO()
      };
      dirtyFiles.clear();
      expandedFolders.clear();
      saveCurrentProject();
      fullRender();
      if(newFiles["README.md"]) openFile("README.md");
      else if(blobs.length>0) openFile(blobs[0].path);
      logClone("Klon tamamlandı.");
    }catch(err){
      console.error(err);
      logClone("Hata: "+err.message);
    }
  });
}
function parseGitHubUrl(url){
  const m = url.match(/github\.com\/([^\/]+)\/([^\/#]+)(?:\/tree\/([^\/]+))?/);
  if(!m) throw new Error("Geçersiz GitHub URL");
  return { owner:m[1], repo:m[2].replace(/\.git$/,""), branch:m[3]||null };
}
async function detectBranch(owner, repo, branch){
  if(branch) return branch;
  for(const c of ["main","master"]){
    const r = await fetch(`${GITHUB_API_BASE}/repos/${owner}/${repo}/branches/${c}`);
    if(r.status===200) return c;
  }
  const info = await fetchJSON(`${GITHUB_API_BASE}/repos/${owner}/${repo}`);
  return info.default_branch;
}
async function fetchRepoTree(owner, repo, branch){
  const url = `${GITHUB_API_BASE}/repos/${owner}/${repo}/git/trees/${encodeURIComponent(branch)}?recursive=1`;
  const json = await fetchJSON(url);
  if(!json.tree) throw new Error("Ağaç alınamadı");
  return json.tree;
}
async function fetchRaw(owner, repo, branch, path){
  const res = await fetch(`https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`);
  if(!res.ok) return "";
  return await res.text();
}
async function fetchJSON(url,opt={}){
  const res = await fetch(url,opt);
  if(!res.ok) throw new Error("İstek başarısız: "+res.status);
  return await res.json();
}

/* ---------------- PAT / AUTH ---------------- */
function loadPAT(){ return localStorage.getItem(PAT_STORAGE_KEY)||""; }
function savePAT(token){
  localStorage.setItem(PAT_STORAGE_KEY, token);
  els.patInput.value = token;
  logClone("PAT kaydedildi.");
}
function clearPAT(){
  localStorage.removeItem(PAT_STORAGE_KEY);
  githubUser=null;
  els.patInput.value="";
  hideUserInfo();
  logClone("PAT silindi.");
}
function showUserInfo(){
  if(!githubUser) return;
  els.userInfoBox.style.display="flex";
  els.userLogin.textContent=githubUser.login;
  els.userName.textContent=githubUser.name||"";
  els.userAvatar.src=githubUser.avatar_url;
  els.authBox.classList.add("authenticated");
}
function hideUserInfo(){
  els.userInfoBox.style.display="none";
  els.authBox.classList.remove("authenticated");
}
async function validatePAT(){
  const token = loadPAT();
  if(!token){ alert("Önce PAT girin"); return; }
  try{
    logClone("PAT doğrulanıyor...");
    const user = await githubAPIFetch("/user");
    githubUser=user;
    showUserInfo();
    logClone("Doğrulandı: "+user.login);
  }catch(e){
    logClone("Doğrulama hatası: "+e.message);
    alert("Geçersiz token olabilir.");
  }
}
async function githubAPIFetch(path, options={}){
  const token = loadPAT();
  if(!token) throw new Error("PAT yok");
  const headers = Object.assign({}, options.headers || {}, {
    Authorization: "token "+token,
    Accept: "application/vnd.github+json"
  });
  const res = await fetch(GITHUB_API_BASE+path, { ...options, headers });
  if(!res.ok){
    const txt = await res.text();
    throw new Error(`GitHub API Hatası ${res.status}: ${txt}`);
  }
  if(res.status===204) return {};
  return await res.json();
}

/* ---------------- REPO LIST ---------------- */
async function listRepos(){
  if(!loadPAT()){ alert("PAT gir."); return; }
  logClone("Repo listesi alınıyor...");
  els.repoSelect.innerHTML=`<option value="">(yükleniyor...)</option>`;
  try{
    const repos = await githubAPIFetch(`/user/repos?per_page=100&sort=updated`);
    repos.sort((a,b)=>a.full_name.localeCompare(b.full_name));
    els.repoSelect.innerHTML=`<option value="">-- Repo Seç --</option>`;
    for(const r of repos){
      const opt=document.createElement("option");
      opt.value = r.full_name;
      opt.textContent = r.full_name + (r.private?" (private)":"");
      els.repoSelect.appendChild(opt);
    }
    logClone("Repo sayısı: "+repos.length);
  }catch(e){
    logClone("Repo listesi hatası: "+e.message);
  }
}

/* ---------------- BRANCH OPS ---------------- */
async function checkBranch(){
  const repo = els.repoSelect.value;
  const branch = els.branchInput.value.trim();
  if(!repo||!branch){ alert("Repo ve branch gir."); return; }
  try{
    await githubAPIFetch(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    logClone("Branch mevcut.");
    return true;
  }catch(e){
    logClone("Branch yok: "+e.message);
    return false;
  }
}
async function createBranch(){
  const repo = els.repoSelect.value;
  const branch = els.branchInput.value.trim();
  if(!repo||!branch){ alert("Repo ve branch gir."); return; }
  try{
    const baseRef = await tryFindDefaultBaseRef(repo);
    await githubAPIFetch(`/repos/${repo}/git/refs`, {
      method:"POST",
      body: JSON.stringify({ ref:`refs/heads/${branch}`, sha:baseRef.object.sha })
    });
    logClone("Branch oluşturuldu.");
  }catch(e){
    logClone("Branch oluşturma hatası: "+e.message);
  }
}
async function tryFindDefaultBaseRef(repo){
  for(const c of ["main","master"]){
    try { return await githubAPIFetch(`/repos/${repo}/git/ref/heads/${c}`); } catch{}
  }
  const repoInfo = await githubAPIFetch(`/repos/${repo}`);
  const def = repoInfo.default_branch;
  return await githubAPIFetch(`/repos/${repo}/git/ref/heads/${def}`);
}

/* ---------------- PUSH ---------------- */
async function pushProject(){
  if(!githubUser){ alert("Önce PAT doğrula."); return; }
  const repo = els.repoSelect.value;
  const branch = els.branchInput.value.trim() || "main";
  const prefix = els.prefixInput.value.trim().replace(/^\/|\/$/g,"");
  const message = els.commitMsgInput.value.trim() || "DCT Code commit";
  if(!repo){ alert("Repo seç."); return; }

  const exists = await checkBranch();
  if(!exists){
    if(!confirm("Branch yok. Oluşturalım mı?")) return;
    await createBranch();
  }

  try{
    logClone("Push başlıyor...");
    const ref = await githubAPIFetch(`/repos/${repo}/git/ref/heads/${encodeURIComponent(branch)}`);
    const baseCommitSha = ref.object.sha;
    const baseCommit = await githubAPIFetch(`/repos/${repo}/git/commits/${baseCommitSha}`);
    const baseTreeSha = baseCommit.tree.sha;

    const fileEntries = Object.entries(project.files).filter(([p])=>!p.endsWith(".dct_folder"));
    logClone(`Dosya sayısı: ${fileEntries.length}`);

    const treeItems = [];
    let done=0;
    for(const [p,content] of fileEntries){
      const finalPath = prefix ? `${prefix}/${p}` : p;
      const blob = await githubAPIFetch(`/repos/${repo}/git/blobs`, {
        method:"POST",
        body: JSON.stringify({ content, encoding:"utf-8" })
      });
      treeItems.push({ path:finalPath, mode:"100644", type:"blob", sha:blob.sha });
      if(++done % 10 === 0) logClone(`Blob: ${done}/${fileEntries.length}`);
    }

    const newTree = await githubAPIFetch(`/repos/${repo}/git/trees`, {
      method:"POST",
      body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems })
    });

    const newCommit = await githubAPIFetch(`/repos/${repo}/git/commits`, {
      method:"POST",
      body: JSON.stringify({ message, tree:newTree.sha, parents:[baseCommitSha] })
    });

    await githubAPIFetch(`/repos/${repo}/git/refs/heads/${encodeURIComponent(branch)}`, {
      method:"PATCH",
      body: JSON.stringify({ sha:newCommit.sha })
    });

    logClone("Push tamam: "+newCommit.sha);
    alert("Push başarılı!");
  }catch(e){
    logClone("Push hatası: "+e.message);
    alert("Push başarısız: "+e.message);
  }
}

/* ---------------- ZIP EXPORT ---------------- */
function exportProjectZip(){
  ensureProject();
  const files = Object.entries(project.files).filter(([p])=>!p.endsWith(".dct_folder"));
  if(files.length===0){ alert("İndirilecek dosya yok."); return; }
  const blob = buildZip(files);
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = (project.name||"project") + ".zip";
  document.body.appendChild(a);
  a.click();
  setTimeout(()=>{
    URL.revokeObjectURL(a.href);
    a.remove();
  },1500);
  logClone("ZIP oluşturuldu: "+a.download);
}

function buildZip(fileEntries){
  const encoder = new TextEncoder();
  const fileDataParts = [];
  const centralDirParts = [];
  let offset = 0;
  const entriesMeta = [];

  function crc32(buf){
    let table = crc32.table;
    if(!table){
      table = crc32.table = [];
      for(let i=0;i<256;i++){
        let c=i;
        for(let k=0;k<8;k++) c=((c&1)?(0xEDB88320^(c>>>1)):(c>>>1));
        table[i]=c>>>0;
      }
    }
    let crc = 0 ^ (-1);
    for(let i=0;i<buf.length;i++)
      crc = (crc>>>8) ^ table[(crc ^ buf[i]) & 0xFF];
    return (crc ^ (-1)) >>> 0;
  }

  for(const [path,content] of fileEntries){
    const nameBytes = encoder.encode(path);
    const dataBytes = encoder.encode(content);
    const crc = crc32(dataBytes);
    const size = dataBytes.length;
    const local = new DataView(new ArrayBuffer(30));
    let p=0;
    local.setUint32(p,0x04034b50,true); p+=4;
    local.setUint16(p,10,true); p+=2;
    local.setUint16(p,0,true); p+=2;
    local.setUint16(p,0,true); p+=2;
    local.setUint16(p,0,true); p+=2;
    local.setUint16(p,0,true); p+=2;
    local.setUint32(p,crc,true); p+=4;
    local.setUint32(p,size,true); p+=4;
    local.setUint32(p,size,true); p+=4;
    local.setUint16(p,nameBytes.length,true); p+=2;
    local.setUint16(p,0,true); p+=2;
    fileDataParts.push(local,nameBytes,dataBytes);
    entriesMeta.push({ nameBytes, crc, size, offset });
    offset += 30 + nameBytes.length + size;
  }

  let centralSize = 0;
  for(const meta of entriesMeta){
    const cdir = new DataView(new ArrayBuffer(46));
    let p=0;
    cdir.setUint32(p,0x02014b50,true); p+=4;
    cdir.setUint16(p,20,true); p+=2;
    cdir.setUint16(p,10,true); p+=2;
    cdir.setUint16(p,0,true); p+=2;
    cdir.setUint16(p,0,true); p+=2;
    cdir.setUint16(p,0,true); p+=2;
    cdir.setUint16(p,0,true); p+=2;
    cdir.setUint32(p,meta.crc,true); p+=4;
    cdir.setUint32(p,meta.size,true); p+=4;
    cdir.setUint32(p,meta.size,true); p+=4;
    cdir.setUint16(p,meta.nameBytes.length,true); p+=2;
    cdir.setUint16(p,0,true); p+=2;
    cdir.setUint16(p,0,true); p+=2;
    cdir.setUint16(p,0,true); p+=2;
    cdir.setUint16(p,0,true); p+=2;
    cdir.setUint32(p,0,true); p+=4;
    cdir.setUint32(p,meta.offset,true); p+=4;
    centralDirParts.push(cdir, meta.nameBytes);
    centralSize += 46 + meta.nameBytes.length;
  }

  const end = new DataView(new ArrayBuffer(22));
  let q=0;
  end.setUint32(q,0x06054b50,true); q+=4;
  end.setUint16(q,0,true); q+=2;
  end.setUint16(q,0,true); q+=2;
  end.setUint16(q,entriesMeta.length,true); q+=2;
  end.setUint16(q,entriesMeta.length,true); q+=2;
  end.setUint32(q,centralSize,true); q+=4;
  end.setUint32(q,offset,true); q+=4;
  end.setUint16(q,0,true); q+=2;

  return new Blob([...fileDataParts, ...centralDirParts, end], {type:"application/zip"});
}

/* ---------------- THEME ---------------- */
function loadTheme(){ return localStorage.getItem(THEME_STORAGE_KEY)||"dark"; }
function saveTheme(theme){ localStorage.setItem(THEME_STORAGE_KEY, theme); }
function applyTheme(theme){
  document.documentElement.setAttribute("data-theme", theme==="light"?"light":"");
  if(els.themeToggle) els.themeToggle.textContent = theme==="light"?"☀️":"🌙";
}
function toggleTheme(){
  const next = loadTheme()==="light"?"dark":"light";
  saveTheme(next);
  applyTheme(next);
  logClone("Tema: "+next);
}

/* ---------------- PANELS ---------------- */
els.activityItems.forEach(item=>{
  item.addEventListener("click",()=>{
    els.activityItems.forEach(i=>i.classList.remove("active"));
    item.classList.add("active");
    const view = item.dataset.view;
    Object.entries(els.panels).forEach(([k,p])=>p.classList.toggle("hidden", k!==view));
    if(view==="slots") renderSlots();
  });
});

/* ---------------- CONTEXT MENUS already defined above ---------------- */

/* ---------------- INIT ---------------- */
function init(){
  project = loadCurrentProject() || createEmptyProject("DCT Project");
  applyTheme(loadTheme());
  saveCurrentProject();
  fullRender();
  renderSlots();

  if(els.newFileBtn) els.newFileBtn.addEventListener("click",()=>{
    const name = prompt("Dosya adı:"); if(!name)return;
    createFile(name);
  });
  if(els.newFolderBtn) els.newFolderBtn.addEventListener("click",()=>{
    const name = prompt("Klasör adı:"); if(!name)return;
    createFolder(name);
  });
  if(els.newProjectBtn) els.newProjectBtn.addEventListener("click", newProject);
  if(els.exportZipBtn) els.exportZipBtn.addEventListener("click", exportProjectZip);
  if(els.themeToggle) els.themeToggle.addEventListener("click", toggleTheme);

  const existingPat = loadPAT();
  if(existingPat) els.patInput.value = existingPat;

  if(els.savePatBtn) els.savePatBtn.addEventListener("click", ()=>{
    const t = els.patInput.value.trim();
    if(!t){ alert("Token gir."); return; }
    savePAT(t);
  });
  if(els.clearPatBtn) els.clearPatBtn.addEventListener("click", ()=>{
    if(confirm("Token silinsin mi?")) clearPAT();
  });
  if(els.validatePatBtn) els.validatePatBtn.addEventListener("click", validatePAT);
  if(els.listReposBtn) els.listReposBtn.addEventListener("click", listRepos);
  if(els.checkBranchBtn) els.checkBranchBtn.addEventListener("click", checkBranch);
  if(els.createBranchBtn) els.createBranchBtn.addEventListener("click", createBranch);
  if(els.pushProjectBtn) els.pushProjectBtn.addEventListener("click", pushProject);

  window.addEventListener("beforeunload",(e)=>{
    if(dirtyFiles.size>0){
      e.preventDefault();
      e.returnValue="";
    }
  });

  // Test için açmak istersen (DevTools):
  window.DCT_DEBUG_ON = ()=>{ DCT_DEBUG=true; console.log("DCT DEBUG ON"); };
  window.DCT_DEBUG_OFF = ()=>{ DCT_DEBUG=false; console.log("DCT DEBUG OFF"); };
  window.DCT_DUMP = ()=>console.log("project.files", project.files);
}

init();
