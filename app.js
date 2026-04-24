'use strict';

// ===== STATE =====
let games = JSON.parse(localStorage.getItem('gameshelf_v2') || '[]');
let currentView = localStorage.getItem('gameshelf_view') || 'grid';
let currentSort = localStorage.getItem('gameshelf_sort') || 'recent';
let sortDir = localStorage.getItem('gameshelf_dir') || 'desc'; // 'asc' | 'desc'
let imgTab = 'url';
let pendingImg = null;
let detailId = null;

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
    list.sort((a, b) => b.id - a.id);
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
  document.getElementById('tab-url').style.display = tab === 'url' ? '' : 'none';
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
  const date = new Date(g.id).toLocaleDateString('es-MX', { day:'numeric', month:'long', year:'numeric' });
  document.getElementById('detail-date').textContent = `Agregado el ${date}`;

  document.getElementById('detailOverlay').classList.add('open');
}
function closeDetail() {
  document.getElementById('detailOverlay').classList.remove('open');
  detailId = null;
}

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
