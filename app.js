'use strict';

// ===== FIREBASE CONFIG =====
const firebaseConfig = {
  apiKey: "AIzaSyDr4cW8390CZzejR4-msKcjJ_DPYhl6DDU",
  authDomain: "completaods.firebaseapp.com",
  projectId: "completaods",
  storageBucket: "completaods.firebasestorage.app",
  messagingSenderId: "890482535912",
  appId: "1:890482535912:web:83656cbc3f2edf7aa1885d"
};

// ===== STATE =====
let games = [];
let currentView = localStorage.getItem('completados_view') || 'grid3';
let currentSort = localStorage.getItem('completados_sort') || 'recent';
let sortDir = localStorage.getItem('completados_dir') || 'desc';
let imgTab = 'url';
let pendingImg = null;
let detailId = null;
let firestoreDb = null;
let fsCollection = null;
let fsSetDoc = null;
let fsDeleteDoc = null;
let fsDoc = null;
let fsGetDocs = null;

// ===== INDEXEDDB =====
let db;
function openDB() {
  return new Promise((res, rej) => {
    const req = indexedDB.open('gameshelf', 2);
    req.onupgradeneeded = e => {
      const d = e.target.result;
      if (!d.objectStoreNames.contains('games')) d.createObjectStore('games', { keyPath: 'id' });
    };
    req.onsuccess = e => { db = e.target.result; res(db); };
    req.onerror = () => rej(req.error);
  });
}
function dbGetAll() {
  return new Promise((res, rej) => {
    const tx = db.transaction('games','readonly');
    const req = tx.objectStore('games').getAll();
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
function dbPutLocal(game) {
  return new Promise((res, rej) => {
    const tx = db.transaction('games','readwrite');
    const req = tx.objectStore('games').put(game);
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}
function dbDeleteLocal(id) {
  return new Promise((res, rej) => {
    const tx = db.transaction('games','readwrite');
    const req = tx.objectStore('games').delete(Number(id));
    req.onsuccess = () => res();
    req.onerror = () => rej(req.error);
  });
}
async function dbClearAll() {
  return new Promise((res, rej) => {
    const tx = db.transaction('games','readwrite');
    tx.objectStore('games').clear();
    tx.oncomplete = res; tx.onerror = rej;
  });
}

// ===== FIREBASE INIT (no auto-sync) =====
async function initFirebase() {
  try {
    const { initializeApp } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js');
    const { getFirestore, collection, getDocs, setDoc, deleteDoc, doc } = await import('https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js');
    const app = initializeApp(firebaseConfig);
    firestoreDb = getFirestore(app);
    fsCollection = () => collection(firestoreDb, 'games');
    fsSetDoc = (id, data) => setDoc(doc(firestoreDb, 'games', String(id)), data);
    fsDeleteDoc = id => deleteDoc(doc(firestoreDb, 'games', String(id)));
    fsGetDocs = getDocs;
    setCloudStatus('ok');
  } catch(e) {
    console.warn('Firebase init failed:', e);
    setCloudStatus('error');
  }
}

function setCloudStatus(status) {
  const btn = document.getElementById('btnCloud');
  if (!btn) return;
  if (status === 'ok')      btn.title = 'Nube conectada';
  if (status === 'error')   btn.title = 'Sin conexión a la nube';
  if (status === 'loading') btn.title = 'Conectando...';
}

// ===== MANUAL CLOUD SYNC =====
async function uploadToCloud() {
  if (!fsSetDoc) { showCloudHint('Sin conexión a la nube', 'err'); return; }
  const btn = document.getElementById('btnCloudUpload');
  btn.disabled = true; btn.textContent = 'Subiendo...';
  try {
    for (const g of games) await fsSetDoc(g.id, g);
    showCloudHint(`✓ ${games.length} juegos subidos a la nube`);
  } catch(e) {
    showCloudHint('Error al subir', 'err');
  } finally { btn.disabled = false; btn.textContent = '↑ Subir a la nube'; }
}

async function downloadFromCloud() {
  if (!fsGetDocs) { showCloudHint('Sin conexión a la nube', 'err'); return; }
  const btn = document.getElementById('btnCloudDownload');
  btn.disabled = true; btn.textContent = 'Bajando...';
  try {
    const snapshot = await fsGetDocs(fsCollection());
    const cloudGames = snapshot.docs.map(d => ({ ...d.data(), id: Number(d.id) }));
    if (cloudGames.length === 0) { showCloudHint('La nube está vacía', 'err'); btn.disabled = false; btn.textContent = '↓ Bajar de la nube'; return; }
    await dbClearAll();
    for (const g of cloudGames) await dbPutLocal(g);
    games = cloudGames;
    render();
    showCloudHint(`✓ ${games.length} juegos bajados de la nube`);
  } catch(e) {
    showCloudHint('Error al bajar', 'err');
  } finally { btn.disabled = false; btn.textContent = '↓ Bajar de la nube'; }
}

function showCloudHint(msg, type = 'ok') {
  const el = document.getElementById('cloudHint');
  if (!el) return;
  el.textContent = msg;
  el.className = `backup-hint ${type}`;
  setTimeout(() => { el.textContent = ''; el.className = 'backup-hint'; }, 3500);
}



// ===== LOCAL SAVE/DELETE =====
async function saveGame(game) { await dbPutLocal(game); }
async function deleteGame(id) { await dbDeleteLocal(id); }

// ===== SORT LABELS =====
const sortLabels = {
  recent: { asc: 'Antiguos ↑', desc: 'Recientes ↓' },
  alpha:  { asc: 'A–Z ↑',      desc: 'Z–A ↓' }
};

function updateSortBtnLabels() {
  document.querySelectorAll('.sort-btn').forEach(btn => {
    const s = btn.dataset.sort;
    if (s === currentSort) {
      btn.textContent = sortLabels[s][sortDir];
      btn.dataset.dir = sortDir;
    } else {
      const defaultDir = s === 'recent' ? 'desc' : 'asc';
      btn.textContent = sortLabels[s][defaultDir];
      btn.dataset.dir = defaultDir;
    }
  });
}

// ===== RENDER =====
function render() {
  const col = document.getElementById('collection');
  const empty = document.getElementById('emptyState');
  const count = document.getElementById('gameCount');

  count.textContent = games.length === 1 ? '1 juego' : `${games.length} juegos`;

  let list = [...games];
  if (currentSort === 'alpha') {
    list.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
    if (sortDir === 'desc') list.reverse();
  } else {
    list.sort((a, b) => (b.customDate || b.id) - (a.customDate || a.id));
    if (sortDir === 'asc') list.reverse();
  }

  if (list.length === 0) {
    col.innerHTML = ''; col.className = '';
    empty.classList.add('show'); return;
  }
  empty.classList.remove('show');
  col.className = currentView === 'list' ? 'view-list' : currentView === 'grid3' ? 'view-grid3' : 'view-grid';

  col.innerHTML = list.map((g, i) => {
    const coverHtml = g.img
      ? `<img src="${g.img}" alt="${esc(g.name)}" loading="lazy" onerror="this.style.display='none'">`
      : '🎮';
    if (currentView === 'list') {
      return `<div class="card-list" data-id="${g.id}" style="animation-delay:${Math.min(i*0.03,0.3)}s">
        <div class="cover-thumb">${coverHtml}</div>
        <div class="list-info"><div class="list-name">${esc(g.name)}</div></div>
        <span class="list-arrow">›</span>
      </div>`;
    } else {
      return `<div class="card-grid" data-id="${g.id}" style="animation-delay:${Math.min(i*0.03,0.3)}s">
        <div class="cover">${coverHtml}</div>
        <div class="card-label">${esc(g.name)}</div>
      </div>`;
    }
  }).join('');

  col.querySelectorAll('[data-id]').forEach(el => {
    el.addEventListener('click', () => openDetail(el.dataset.id));
  });
}

const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

// ===== ADD MODAL =====
function openAdd() {
  resetAddForm();
  document.getElementById('addOverlay').classList.add('open');
  setTimeout(() => document.getElementById('inp-name').focus(), 350);
}
function closeAdd() {
  document.getElementById('addOverlay').classList.remove('open');
}
function resetAddForm() {
  document.getElementById('inp-name').value = '';
  document.getElementById('inp-url').value = '';
  document.getElementById('file-label').textContent = 'Toca para elegir imagen';
  document.getElementById('img-preview-wrap').style.display = 'none';
  document.getElementById('img-preview').src = '';
  pendingImg = null;
  setTab('url', document.querySelector('.itab[data-tab="url"]'));
}

function setTab(tab, el) {
  imgTab = tab;
  document.querySelectorAll('.itab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('tab-url').style.display  = tab === 'url'  ? '' : 'none';
  document.getElementById('tab-file').style.display = tab === 'file' ? '' : 'none';
}

document.getElementById('inp-url').addEventListener('input', e => {
  const url = e.target.value.trim();
  if (url) { showPreview(url); pendingImg = { src: url, type: 'url' }; }
  else { hidePreview(); pendingImg = null; }
});

document.getElementById('inp-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    pendingImg = { src: ev.target.result, type: 'base64' };
    showPreview(ev.target.result);
    document.getElementById('file-label').textContent = file.name;
  };
  reader.readAsDataURL(file);
});

function showPreview(src) {
  document.getElementById('img-preview').src = src;
  document.getElementById('img-preview-wrap').style.display = 'flex';
}
function hidePreview() {
  document.getElementById('img-preview-wrap').style.display = 'none';
}

document.getElementById('btnClearImg').addEventListener('click', () => {
  pendingImg = null; hidePreview();
  document.getElementById('inp-url').value = '';
  document.getElementById('file-label').textContent = 'Toca para elegir imagen';
});

document.getElementById('btnSave').addEventListener('click', async () => {
  const name = document.getElementById('inp-name').value.trim();
  if (!name) { document.getElementById('inp-name').focus(); return; }
  const game = { id: Date.now(), name, img: pendingImg?.src || null };
  games.push(game);
  await saveGame(game);
  render(); closeAdd();
});

document.getElementById('inp-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btnSave').click();
});

// ===== DETAIL MODAL =====
function openDetail(id) {
  const g = games.find(x => x.id == id);
  if (!g) return;
  detailId = id;
  document.getElementById('detail-cover').innerHTML = g.img ? `<img src="${g.img}" alt="${esc(g.name)}">` : '🎮';
  document.getElementById('detail-name').textContent = g.name;
  updateDetailDate(g);
  document.getElementById('detailOverlay').classList.add('open');
}
function closeDetail() {
  document.getElementById('detailOverlay').classList.remove('open');
  detailId = null;
}

function updateDetailDate(g) {
  const ts = g.customDate || g.id;
  document.getElementById('detail-date-text').textContent = new Date(ts).toLocaleString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
}

document.getElementById('detail-date').addEventListener('click', () => {
  const g = games.find(x => x.id == detailId);
  if (!g) return;
  const d = new Date(g.customDate || g.id);
  document.getElementById('d-day').value   = d.getDate();
  document.getElementById('d-month').value = d.getMonth() + 1;
  document.getElementById('d-year').value  = d.getFullYear();
  document.getElementById('d-hour').value  = d.getHours();
  document.getElementById('d-min').value   = d.getMinutes();
  document.getElementById('d-sec').value   = d.getSeconds();
  document.getElementById('dateOverlay').classList.add('open');
});

document.getElementById('btnSaveDate').addEventListener('click', async () => {
  const g = games.find(x => x.id == detailId);
  if (!g) return;
  g.customDate = new Date(
    parseInt(document.getElementById('d-year').value)  || new Date().getFullYear(),
    (parseInt(document.getElementById('d-month').value) || 1) - 1,
    parseInt(document.getElementById('d-day').value)   || 1,
    parseInt(document.getElementById('d-hour').value)  || 0,
    parseInt(document.getElementById('d-min').value)   || 0,
    parseInt(document.getElementById('d-sec').value)   || 0
  ).getTime();
  await saveGame(g);
  render(); updateDetailDate(g);
  document.getElementById('dateOverlay').classList.remove('open');
});

document.getElementById('btnDelete').addEventListener('click', async () => {
  if (!detailId) return;
  const id = detailId;
  games = games.filter(g => g.id != id);
  await deleteGame(Number(id));
  render(); closeDetail();
});

// ===== EDIT NAME =====
document.getElementById('btnEdit').addEventListener('click', () => {
  const g = games.find(x => x.id == detailId);
  if (!g) return;
  document.getElementById('inp-edit-name').value = g.name;
  document.getElementById('editOverlay').classList.add('open');
  setTimeout(() => document.getElementById('inp-edit-name').focus(), 350);
});

document.getElementById('btnSaveEdit').addEventListener('click', async () => {
  const name = document.getElementById('inp-edit-name').value.trim();
  if (!name) return;
  const g = games.find(x => x.id == detailId);
  if (g) { g.name = name; await saveGame(g); render(); }
  document.getElementById('editOverlay').classList.remove('open');
  document.getElementById('detail-name').textContent = name;
});

document.getElementById('inp-edit-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btnSaveEdit').click();
});

// ===== EDIT IMAGE =====
function setEditImgTab(tab, el) {
  document.querySelectorAll('.edit-itab').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('edit-tab-url').style.display  = tab === 'url'  ? '' : 'none';
  document.getElementById('edit-tab-file').style.display = tab === 'file' ? '' : 'none';
}
document.querySelectorAll('.edit-itab').forEach(btn => {
  btn.addEventListener('click', () => setEditImgTab(btn.dataset.tab, btn));
});

document.getElementById('btnEditImg').addEventListener('click', () => {
  const g = games.find(x => x.id == detailId);
  if (!g) return;
  document.getElementById('inp-edit-img-url').value = (g.img && !g.img.startsWith('data:')) ? g.img : '';
  document.getElementById('edit-img-preview-wrap').style.display = 'none';
  document.getElementById('edit-img-preview').src = '';
  document.getElementById('edit-file-label').textContent = 'Toca para elegir imagen';
  setEditImgTab('url', document.querySelector('.edit-itab[data-tab="url"]'));
  document.getElementById('editImgOverlay').classList.add('open');
});

document.getElementById('inp-edit-img-url').addEventListener('input', e => {
  const url = e.target.value.trim();
  const wrap = document.getElementById('edit-img-preview-wrap');
  if (url) { document.getElementById('edit-img-preview').src = url; wrap.style.display = 'flex'; }
  else { wrap.style.display = 'none'; }
});

document.getElementById('inp-edit-img-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    document.getElementById('edit-img-preview').src = ev.target.result;
    document.getElementById('edit-img-preview-wrap').style.display = 'flex';
    document.getElementById('edit-file-label').textContent = file.name;
  };
  reader.readAsDataURL(file);
});

document.getElementById('btnSaveEditImg').addEventListener('click', async () => {
  const g = games.find(x => x.id == detailId);
  if (!g) return;
  const tab = document.querySelector('.edit-itab.active')?.dataset.tab;
  if (tab === 'url') {
    g.img = document.getElementById('inp-edit-img-url').value.trim() || null;
  } else {
    const src = document.getElementById('edit-img-preview').src;
    g.img = (src && src !== window.location.href) ? src : null;
  }
  await saveGame(g);
  render();
  document.getElementById('detail-cover').innerHTML = g.img ? `<img src="${g.img}" alt="${esc(g.name)}">` : '🎮';
  document.getElementById('editImgOverlay').classList.remove('open');
});

document.getElementById('btnRemoveImg').addEventListener('click', async () => {
  const g = games.find(x => x.id == detailId);
  if (!g) return;
  g.img = null;
  await saveGame(g);
  render();
  document.getElementById('detail-cover').innerHTML = '🎮';
  document.getElementById('editImgOverlay').classList.remove('open');
});

// ===== OVERLAY CLOSE ON BACKDROP =====
['addOverlay','detailOverlay','editOverlay','dateOverlay','editImgOverlay'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target.id === id) {
      if (id === 'addOverlay') closeAdd();
      else if (id === 'detailOverlay') closeDetail();
      else document.getElementById(id).classList.remove('open');
    }
  });
});

// ===== VIEW TOGGLE =====
document.querySelectorAll('.view-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentView = btn.dataset.view;
    localStorage.setItem('completados_view', currentView);
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });
});

// ===== SORT =====
document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.sort === currentSort) {
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      currentSort = btn.dataset.sort;
      sortDir = btn.dataset.sort === 'recent' ? 'desc' : 'asc';
    }
    localStorage.setItem('completados_sort', currentSort);
    localStorage.setItem('completados_dir', sortDir);
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updateSortBtnLabels();
    render();
  });
});

document.querySelectorAll('.itab').forEach(btn => {
  btn.addEventListener('click', () => setTab(btn.dataset.tab, btn));
});

document.getElementById('btnAdd').addEventListener('click', openAdd);

// ===== SETTINGS =====
const ACCENT_PRESETS = [
  '#e8ff47','#ff4757','#ff6b35','#ffd32a','#2ed573',
  '#1e90ff','#a55eea','#ff6eb4','#00d2d3','#ff9f43','#ffffff','#c8c8c8'
];
let currentAccent = localStorage.getItem('completados_accent') || '#e8ff47';

function applyAccent(color) {
  document.documentElement.style.setProperty('--accent', color);
  currentAccent = color;
}

function buildColorGrid() {
  const grid = document.getElementById('colorGrid');
  grid.innerHTML = ACCENT_PRESETS.map(c => `
    <div class="color-swatch ${c === currentAccent ? 'selected' : ''}" style="background:${c}" data-color="${c}"></div>
  `).join('');
  grid.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      grid.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      document.getElementById('inp-custom-color').value = sw.dataset.color;
      applyAccent(sw.dataset.color);
    });
  });
}

function openSettings() {
  document.getElementById('inp-app-name').value = localStorage.getItem('completados_appname') || '';
  document.getElementById('inp-custom-color').value = currentAccent;
  buildColorGrid();
  document.getElementById('settingsOverlay').classList.add('open');
}

document.getElementById('inp-custom-color').addEventListener('input', e => {
  applyAccent(e.target.value);
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
});

document.getElementById('btnSaveSettings').addEventListener('click', () => {
  const name = document.getElementById('inp-app-name').value.trim();
  const displayName = name || 'Completados';
  localStorage.setItem('completados_appname', name);
  localStorage.setItem('completados_accent', currentAccent);
  document.querySelector('.app-name').textContent = displayName;
  document.querySelector('.splash-name').textContent = displayName;
  document.title = displayName;
  document.getElementById('settingsOverlay').classList.remove('open');
});

document.getElementById('btnSettings').addEventListener('click', openSettings);
document.getElementById('btnCloud').addEventListener('click', () => {
  document.getElementById('cloudOverlay').classList.add('open');
});
document.getElementById('btnCloseCloud').addEventListener('click', () => {
  document.getElementById('cloudOverlay').classList.remove('open');
});
document.getElementById('cloudOverlay').addEventListener('click', e => {
  if (e.target.id === 'cloudOverlay') document.getElementById('cloudOverlay').classList.remove('open');
});
document.getElementById('btnCloudUpload').addEventListener('click', uploadToCloud);
document.getElementById('btnCloudDownload').addEventListener('click', downloadFromCloud);
document.getElementById('settingsOverlay').addEventListener('click', e => {
  if (e.target.id === 'settingsOverlay') document.getElementById('settingsOverlay').classList.remove('open');
});

// ===== BACKUP =====
function showHint(msg, type = 'ok') {
  const el = document.getElementById('backupHint');
  el.textContent = msg;
  el.className = `backup-hint ${type}`;
  setTimeout(() => { el.textContent = ''; el.className = 'backup-hint'; }, 3500);
}

document.getElementById('btnExport').addEventListener('click', () => {
  if (games.length === 0) { showHint('No hay juegos para exportar', 'err'); return; }
  const data = {
    version: 2, exportedAt: new Date().toISOString(),
    appName: localStorage.getItem('completados_appname') || '',
    accent: currentAccent, games
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `completados-backup-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showHint(`✓ ${games.length} juegos exportados`);
});

document.getElementById('btnImport').addEventListener('click', () => {
  document.getElementById('inp-backup-file').value = '';
  document.getElementById('inp-backup-file').click();
});

document.getElementById('inp-backup-file').addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.games || !Array.isArray(data.games)) throw new Error();
      const existingIds = new Set(games.map(g => g.id));
      const newGames = data.games.filter(g => !existingIds.has(g.id));
      for (const g of newGames) { games.push(g); await saveGame(g); }
      render();
      if (data.accent) { applyAccent(data.accent); localStorage.setItem('completados_accent', data.accent); }
      if (data.appName) {
        localStorage.setItem('completados_appname', data.appName);
        document.querySelector('.app-name').textContent = data.appName || 'Completados';
        document.title = data.appName || 'Completados';
      }
      showHint(`✓ ${newGames.length} juegos importados`);
    } catch { showHint('Error: archivo no válido', 'err'); }
  };
  reader.readAsText(file);
});

// ===== COMPARE BACKUP =====
document.getElementById('btnCompare').addEventListener('click', () => {
  document.getElementById('inp-compare-file').value = '';
  document.getElementById('inp-compare-file').click();
});

document.getElementById('inp-compare-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.games || !Array.isArray(data.games)) throw new Error();
      showCompareResults(data.games);
    } catch { showHint('Error: archivo no válido', 'err'); }
  };
  reader.readAsText(file);
});

function showCompareResults(backupGames) {
  const currentNames = new Set(games.map(g => g.name.trim().toLowerCase()));
  const backupNames  = new Set(backupGames.map(g => g.name.trim().toLowerCase()));

  // In backup but NOT in current collection
  const missing = backupGames.filter(g => !currentNames.has(g.name.trim().toLowerCase()));
  // In current but NOT in backup
  const extra   = games.filter(g => !backupNames.has(g.name.trim().toLowerCase()));
  // In both
  const matched = games.length - extra.length;

  let html = `<div class="compare-summary">
    Backup: <strong>${backupGames.length}</strong> juegos &nbsp;·&nbsp;
    Colección actual: <strong>${games.length}</strong> juegos
  </div>`;

  if (missing.length === 0 && extra.length === 0) {
    html += `<div class="compare-item" style="justify-content:center;color:#22c55e;font-weight:600">
      ✅ Tu colección está completa, no falta nada
    </div>`;
  }

  if (missing.length > 0) {
    html += `<div class="compare-section">
      <div class="compare-section-title compare-title-missing">
        ❌ Faltan en tu colección (${missing.length})
      </div>
      ${missing.map(g => `<div class="compare-item">
        <span class="compare-item-icon">🎮</span>${esc(g.name)}
      </div>`).join('')}
      <button class="btn-add-missing" id="btnAddMissing">
        ➕ Agregar los ${missing.length} juegos faltantes
      </button>
    </div>`;
  }

  if (extra.length > 0) {
    html += `<div class="compare-section">
      <div class="compare-section-title compare-title-extra">
        🟡 Tienes estos pero no están en el backup (${extra.length})
      </div>
      ${extra.map(g => `<div class="compare-item">
        <span class="compare-item-icon">🎮</span>${esc(g.name)}
      </div>`).join('')}
    </div>`;
  }

  html += `<div class="compare-section">
    <div class="compare-section-title compare-title-ok">
      ✅ Coinciden (${matched})
    </div>
  </div>`;

  document.getElementById('compareBody').innerHTML = html;
  document.getElementById('compareOverlay').classList.add('open');

  // Add missing button
  if (missing.length > 0) {
    document.getElementById('btnAddMissing').addEventListener('click', async () => {
      const btn = document.getElementById('btnAddMissing');
      btn.textContent = 'Agregando...';
      btn.disabled = true;
      for (const g of missing) {
        games.push(g);
        await saveGame(g);
      }
      render();
      document.getElementById('compareBody').innerHTML = `
        <div class="compare-item" style="justify-content:center;color:#22c55e;font-weight:600;margin-top:12px">
          ✅ ${missing.length} juegos agregados correctamente
        </div>`;
      showHint(`✓ ${missing.length} juegos agregados`, 'ok');
    });
  }
}

document.getElementById('btnCloseCompare').addEventListener('click', () => {
  document.getElementById('compareOverlay').classList.remove('open');
});
document.getElementById('compareOverlay').addEventListener('click', e => {
  if (e.target.id === 'compareOverlay') document.getElementById('compareOverlay').classList.remove('open');
});


if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// ===== INIT =====
window.addEventListener('load', async () => {
  await openDB();

  // Load from IndexedDB first (instant, offline-safe)
  games = await dbGetAll();
  applyAccent(currentAccent);
  const savedName = localStorage.getItem('completados_appname');
  if (savedName) {
    document.querySelector('.app-name').textContent = savedName;
    document.querySelector('.splash-name').textContent = savedName;
    document.title = savedName;
  }
  document.querySelectorAll('.view-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.view === currentView);
  });
  document.querySelector(`.sort-btn[data-sort="${currentSort}"]`)?.classList.add('active');
  document.querySelector(`.sort-btn:not([data-sort="${currentSort}"])`)?.classList.remove('active');
  updateSortBtnLabels();
  render();
  setTimeout(() => document.getElementById('splash').classList.add('out'), 800);

  // Init Firebase in background (no auto-sync)
  initFirebase();
});
