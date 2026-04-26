'use strict';

// ===== STATE =====
let games = JSON.parse(localStorage.getItem('gameshelf_v2') || '[]');
let currentView = localStorage.getItem('gameshelf_view') || 'grid';
let currentSort = localStorage.getItem('gameshelf_sort') || 'recent';
let sortDir = localStorage.getItem('gameshelf_dir') || 'desc';
let imgTab = 'url';
let pendingImg = null;
let detailId = null;

// ===== IGDB =====
const IGDB_CLIENT_ID = 'ku4od5y234yhcc3xj3ktdacu4px8fe';
const IGDB_CLIENT_SECRET = '5xw3k556ww1tbpgu1w4f1058vq3dd0';
let igdbToken = null;

async function getIgdbToken() {
  if (igdbToken) return igdbToken;
  const cached = JSON.parse(localStorage.getItem('igdb_token') || 'null');
  if (cached && cached.expires > Date.now()) { igdbToken = cached.token; return igdbToken; }
  const res = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${IGDB_CLIENT_ID}&client_secret=${IGDB_CLIENT_SECRET}&grant_type=client_credentials`, { method: 'POST' });
  const data = await res.json();
  igdbToken = data.access_token;
  localStorage.setItem('igdb_token', JSON.stringify({ token: igdbToken, expires: Date.now() + (data.expires_in - 60) * 1000 }));
  return igdbToken;
}

async function searchIgdb(query) {
  const token = await getIgdbToken();
  const res = await fetch('https://api.igdb.com/v4/games', {
    method: 'POST',
    headers: {
      'Client-ID': IGDB_CLIENT_ID,
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'text/plain'
    },
    body: `search "${query}"; fields name,cover.image_id; where cover.image_id != null; limit 9;`
  });
  return await res.json();
}

function igdbCoverUrl(imageId, size = 'cover_big') {
  return `https://images.igdb.com/igdb/image/upload/t_${size}/${imageId}.jpg`;
}

// IGDB UI
document.getElementById('btnIgdbSearch').addEventListener('click', doIgdbSearch);
document.getElementById('inp-igdb-search').addEventListener('keydown', e => {
  if (e.key === 'Enter') doIgdbSearch();
});

async function doIgdbSearch() {
  const q = document.getElementById('inp-igdb-search').value.trim();
  if (!q) return;
  const btn = document.getElementById('btnIgdbSearch');
  const resultsEl = document.getElementById('igdb-results');
  btn.disabled = true;
  btn.textContent = '...';
  resultsEl.innerHTML = '<div class="igdb-status">Buscando...</div>';
  try {
    const results = await searchIgdb(q);
    if (!results.length) { resultsEl.innerHTML = '<div class="igdb-status">Sin resultados</div>'; return; }
    resultsEl.innerHTML = results.map(g => `
      <div class="igdb-card" data-id="${g.id}" data-name="${g.name.replace(/"/g,'&quot;')}" data-img="${igdbCoverUrl(g.cover.image_id)}">
        <img src="${igdbCoverUrl(g.cover.image_id)}" alt="${g.name}" loading="lazy" />
        <div class="igdb-card-name">${g.name}</div>
      </div>
    `).join('');
    resultsEl.querySelectorAll('.igdb-card').forEach(card => {
      card.addEventListener('click', () => {
        resultsEl.querySelectorAll('.igdb-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        // Auto-fill name if empty
        const nameInp = document.getElementById('inp-name');
        if (!nameInp.value.trim()) nameInp.value = card.dataset.name;
        pendingImg = { src: card.dataset.img, type: 'url' };
        showPreview(card.dataset.img);
      });
    });
  } catch(e) {
    resultsEl.innerHTML = '<div class="igdb-status">Error al buscar</div>';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Buscar';
  }
}


// ===== PERSIST =====
const save = () => localStorage.setItem('gameshelf_v2', JSON.stringify(games));

// ===== SORT LABELS =====
const sortLabels = {
  recent: { asc: 'Antiguos ↑', desc: 'Recientes ↓' },
  alpha:  { asc: 'A–Z ↑',      desc: 'Z–A ↓' }
};

function updateSortBtnLabels() {
  document.querySelectorAll('.sort-btn').forEach(btn => {
    const s = btn.dataset.sort;
    if (s === currentSort) {
      // Active button: show current direction
      btn.textContent = sortLabels[s][sortDir];
      btn.dataset.dir = sortDir;
    } else {
      // Inactive button: show its default direction label
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
    col.innerHTML = '';
    col.className = '';
    empty.classList.add('show');
    return;
  }
  empty.classList.remove('show');

  col.className = currentView === 'grid' ? 'view-grid' : 'view-list';

  col.innerHTML = list.map((g, i) => {
    const coverHtml = g.img
      ? `<img src="${g.img}" alt="${esc(g.name)}" loading="lazy" onerror="this.style.display='none'">`
      : '🎮';

    if (currentView === 'grid') {
      return `<div class="card-grid" data-id="${g.id}" style="animation-delay:${Math.min(i*0.03,0.3)}s">
        <div class="cover">${coverHtml}</div>
        <div class="card-label">${esc(g.name)}</div>
      </div>`;
    } else {
      return `<div class="card-list" data-id="${g.id}" style="animation-delay:${Math.min(i*0.03,0.3)}s">
        <div class="cover-thumb">${coverHtml}</div>
        <div class="list-info">
          <div class="list-name">${esc(g.name)}</div>
        </div>
        <span class="list-arrow">›</span>
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
  document.getElementById('inp-igdb-search').value = '';
  document.getElementById('igdb-results').innerHTML = '';
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
  document.getElementById('tab-igdb').style.display = tab === 'igdb' ? '' : 'none';
  document.getElementById('tab-url').style.display  = tab === 'url'  ? '' : 'none';
  document.getElementById('tab-file').style.display = tab === 'file' ? '' : 'none';
}

// URL input → instant preview
document.getElementById('inp-url').addEventListener('input', e => {
  const url = e.target.value.trim();
  if (url) {
    showPreview(url);
    pendingImg = { src: url, type: 'url' };
  } else {
    hidePreview();
    pendingImg = null;
  }
});

// File upload
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
  const img = document.getElementById('img-preview');
  img.src = src;
  document.getElementById('img-preview-wrap').style.display = 'flex';
}
function hidePreview() {
  document.getElementById('img-preview-wrap').style.display = 'none';
}

document.getElementById('btnClearImg').addEventListener('click', () => {
  pendingImg = null;
  hidePreview();
  document.getElementById('inp-url').value = '';
  document.getElementById('file-label').textContent = 'Toca para elegir imagen';
});

// Save
document.getElementById('btnSave').addEventListener('click', () => {
  const name = document.getElementById('inp-name').value.trim();
  if (!name) { document.getElementById('inp-name').focus(); return; }
  games.push({ id: Date.now(), name, img: pendingImg?.src || null });
  save(); render(); closeAdd();
});

document.getElementById('inp-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btnSave').click();
});

// ===== DETAIL MODAL =====
function openDetail(id) {
  const g = games.find(x => x.id == id);
  if (!g) return;
  detailId = id;

  const cover = document.getElementById('detail-cover');
  cover.innerHTML = g.img ? `<img src="${g.img}" alt="${esc(g.name)}">` : '🎮';

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
  const date = new Date(ts).toLocaleString('es-MX', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  document.getElementById('detail-date-text').textContent = date;
}

// Edit date
document.getElementById('detail-date').addEventListener('click', () => {
  const g = games.find(x => x.id == detailId);
  if (!g) return;
  const d = new Date(g.customDate || g.id);
  const pad = n => String(n).padStart(2, '0');
  document.getElementById('d-day').value   = d.getDate();
  document.getElementById('d-month').value = d.getMonth() + 1;
  document.getElementById('d-year').value  = d.getFullYear();
  document.getElementById('d-hour').value  = d.getHours();
  document.getElementById('d-min').value   = d.getMinutes();
  document.getElementById('d-sec').value   = d.getSeconds();
  document.getElementById('dateOverlay').classList.add('open');
});

document.getElementById('btnSaveDate').addEventListener('click', () => {
  const g = games.find(x => x.id == detailId);
  if (!g) return;
  const day   = parseInt(document.getElementById('d-day').value)   || 1;
  const month = parseInt(document.getElementById('d-month').value) || 1;
  const year  = parseInt(document.getElementById('d-year').value)  || new Date().getFullYear();
  const hour  = parseInt(document.getElementById('d-hour').value)  || 0;
  const min   = parseInt(document.getElementById('d-min').value)   || 0;
  const sec   = parseInt(document.getElementById('d-sec').value)   || 0;
  g.customDate = new Date(year, month - 1, day, hour, min, sec).getTime();
  save(); render();
  updateDetailDate(g);
  document.getElementById('dateOverlay').classList.remove('open');
});

document.getElementById('dateOverlay').addEventListener('click', e => {
  if (e.target.id === 'dateOverlay') document.getElementById('dateOverlay').classList.remove('open');
});

document.getElementById('btnDelete').addEventListener('click', () => {
  if (!detailId) return;
  games = games.filter(g => g.id != detailId);
  save(); render(); closeDetail();
});

document.getElementById('btnEdit').addEventListener('click', () => {
  const g = games.find(x => x.id == detailId);
  if (!g) return;
  document.getElementById('inp-edit-name').value = g.name;
  document.getElementById('editOverlay').classList.add('open');
  setTimeout(() => document.getElementById('inp-edit-name').focus(), 350);
});

// ===== EDIT NAME MODAL =====
document.getElementById('btnSaveEdit').addEventListener('click', () => {
  const name = document.getElementById('inp-edit-name').value.trim();
  if (!name) return;
  const g = games.find(x => x.id == detailId);
  if (g) { g.name = name; save(); render(); }
  document.getElementById('editOverlay').classList.remove('open');
  // Update detail name
  document.getElementById('detail-name').textContent = name;
});

document.getElementById('inp-edit-name').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btnSaveEdit').click();
});

// ===== OVERLAY CLOSE ON BACKDROP =====
['addOverlay','detailOverlay','editOverlay'].forEach(id => {
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
    localStorage.setItem('gameshelf_view', currentView);
    document.querySelectorAll('.view-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    render();
  });
});

// ===== SORT =====
document.querySelectorAll('.sort-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.sort === currentSort) {
      // Same sort — toggle direction
      sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    } else {
      // New sort — switch to it with its default direction
      currentSort = btn.dataset.sort;
      sortDir = btn.dataset.sort === 'recent' ? 'desc' : 'asc';
    }
    localStorage.setItem('gameshelf_sort', currentSort);
    localStorage.setItem('gameshelf_dir', sortDir);
    document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    updateSortBtnLabels();
    render();
  });
});

// ===== IMG TAB TOGGLE =====
document.querySelectorAll('.itab').forEach(btn => {
  btn.addEventListener('click', () => setTab(btn.dataset.tab, btn));
});

// ===== ADD BUTTON =====
document.getElementById('btnAdd').addEventListener('click', openAdd);

// ===== SETTINGS =====
const ACCENT_PRESETS = [
  '#e8ff47', // lime yellow (default)
  '#ff4757', // red
  '#ff6b35', // orange
  '#ffd32a', // yellow
  '#2ed573', // green
  '#1e90ff', // blue
  '#a55eea', // purple
  '#ff6eb4', // pink
  '#00d2d3', // cyan
  '#ff9f43', // amber
  '#ffffff', // white
  '#c8c8c8', // silver
];

let currentAccent = localStorage.getItem('gameshelf_accent') || '#e8ff47';

function applyAccent(color) {
  document.documentElement.style.setProperty('--accent', color);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', '#0a0a0a');
  currentAccent = color;
}

function buildColorGrid() {
  const grid = document.getElementById('colorGrid');
  grid.innerHTML = ACCENT_PRESETS.map(c => `
    <div class="color-swatch ${c === currentAccent ? 'selected' : ''}"
      style="background:${c}"
      data-color="${c}">
    </div>
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
  // Fill current app name
  const stored = localStorage.getItem('gameshelf_appname') || '';
  document.getElementById('inp-app-name').value = stored;
  document.getElementById('inp-custom-color').value = currentAccent;
  buildColorGrid();
  document.getElementById('settingsOverlay').classList.add('open');
}

document.getElementById('inp-custom-color').addEventListener('input', e => {
  const c = e.target.value;
  applyAccent(c);
  // Deselect presets
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
});

document.getElementById('btnSaveSettings').addEventListener('click', () => {
  const name = document.getElementById('inp-app-name').value.trim();
  const displayName = name || 'GameShelf';
  localStorage.setItem('gameshelf_appname', name);
  localStorage.setItem('gameshelf_accent', currentAccent);
  // Update UI text
  document.querySelector('.app-name').textContent = displayName;
  document.querySelector('.splash-name').textContent = displayName;
  document.title = displayName;
  document.getElementById('settingsOverlay').classList.remove('open');
});

document.getElementById('btnSettings').addEventListener('click', openSettings);

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
    version: 1,
    exportedAt: new Date().toISOString(),
    appName: localStorage.getItem('gameshelf_appname') || '',
    accent: currentAccent,
    games
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `gameshelf-backup-${date}.json`;
  a.click();
  URL.revokeObjectURL(url);
  showHint(`✓ ${games.length} juegos exportados`);
});

document.getElementById('btnImport').addEventListener('click', () => {
  document.getElementById('inp-backup-file').value = '';
  document.getElementById('inp-backup-file').click();
});

document.getElementById('inp-backup-file').addEventListener('change', e => {
  const file = e.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = ev => {
    try {
      const data = JSON.parse(ev.target.result);
      if (!data.games || !Array.isArray(data.games)) throw new Error('Formato inválido');

      // Merge or replace — ask via hint flow
      const incoming = data.games.length;
      const existingIds = new Set(games.map(g => g.id));
      const newGames = data.games.filter(g => !existingIds.has(g.id));
      games = [...games, ...newGames];
      save();
      render();

      // Restore accent and name if present
      if (data.accent) { applyAccent(data.accent); localStorage.setItem('gameshelf_accent', data.accent); }
      if (data.appName) {
        localStorage.setItem('gameshelf_appname', data.appName);
        document.querySelector('.app-name').textContent = data.appName || 'GameShelf';
        document.title = data.appName || 'GameShelf';
      }

      showHint(`✓ ${newGames.length} juegos importados (${incoming - newGames.length} ya existían)`);
    } catch {
      showHint('Error: archivo no válido', 'err');
    }
  };
  reader.readAsText(file);
});

// ===== SERVICE WORKER =====
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// ===== INIT =====
window.addEventListener('load', () => {
  // Restore accent color
  applyAccent(currentAccent);

  // Restore app name
  const savedName = localStorage.getItem('gameshelf_appname');
  if (savedName) {
    document.querySelector('.app-name').textContent = savedName;
    document.querySelector('.splash-name').textContent = savedName;
    document.title = savedName;
  }

  // Restore view/sort UI
  document.querySelector(`.view-btn[data-view="${currentView}"]`)?.classList.add('active');
  document.querySelector(`.view-btn:not([data-view="${currentView}"])`)?.classList.remove('active');
  document.querySelector(`.sort-btn[data-sort="${currentSort}"]`)?.classList.add('active');
  document.querySelector(`.sort-btn:not([data-sort="${currentSort}"])`)?.classList.remove('active');
  updateSortBtnLabels();

  render();
  setTimeout(() => document.getElementById('splash').classList.add('out'), 800);
});
