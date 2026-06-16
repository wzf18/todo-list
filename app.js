const STORAGE_KEY = 'codex_todos_v3';
const BG_KEY = 'codex_todos_bg';
const CIRCUMFERENCE = 2 * Math.PI * 22;

const state = {
  todos: [], filter: 'all', sort: 'priority',
  sortDesc: false, search: '', editTarget: null,
};

let removeTimers = new Map();

function uid() {
  return Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
}
function esc(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}
function prioRank(p) {
  return p === 'high' ? 0 : p === 'med' ? 1 : 2;
}

// ---- storage ----
function load() {
  try { const r = localStorage.getItem(STORAGE_KEY); if (r) state.todos = JSON.parse(r); } catch {}
}
function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state.todos)); }

// ---- background settings ----
let bgSettings = { dataUrl: null, size: 'cover', blur: true, cardAlpha: 0.75 };

function loadBg() {
  try {
    const saved = localStorage.getItem(BG_KEY);
    if (saved) {
      const p = JSON.parse(saved);
      if (p && p.dataUrl) {
        bgSettings.dataUrl = p.dataUrl;
        bgSettings.size = p.size || 'cover';
        bgSettings.blur = p.blur !== false;
        bgSettings.cardAlpha = p.cardAlpha ?? 0.75;
        bgSettings.cardAlpha = p.cardAlpha ?? 0.75;
        applyBg();
      }
    }
  } catch {}
}

function saveBgState() {
  localStorage.setItem(BG_KEY, JSON.stringify(bgSettings));
}

function applyBg() {
  const overlay = document.getElementById('bgOverlay');
  if (bgSettings.dataUrl) {
    document.body.style.backgroundImage = 'url(' + bgSettings.dataUrl + ')';
    document.body.style.backgroundAttachment = 'fixed';
    // size mode
    switch (bgSettings.size) {
      case 'cover':
        document.body.style.backgroundSize = 'cover';
        document.body.style.backgroundRepeat = 'no-repeat';
        document.body.style.backgroundPosition = 'center';
        break;
      case 'contain':
        document.body.style.backgroundSize = 'contain';
        document.body.style.backgroundRepeat = 'no-repeat';
        document.body.style.backgroundPosition = 'center';
        break;
      case 'stretch':
        document.body.style.backgroundSize = '100% 100%';
        document.body.style.backgroundRepeat = 'no-repeat';
        document.body.style.backgroundPosition = 'center';
        break;
      case 'repeat':
        document.body.style.backgroundSize = 'auto';
        document.body.style.backgroundRepeat = 'repeat';
        document.body.style.backgroundPosition = '0 0';
        break;
    }
    document.body.classList.add('has-bg');
    // blur
    if (bgSettings.blur) {
      overlay.style.backdropFilter = 'blur(3px)';
      overlay.style.webkitBackdropFilter = 'blur(3px)';
      overlay.style.background = 'rgba(242,242,247,.72)';

    } else {
      overlay.style.backdropFilter = 'none';
      overlay.style.webkitBackdropFilter = 'none';
      overlay.style.background = 'transparent';
    }
      // UI transparency
      const ca = bgSettings.cardAlpha ?? 0.75;
      document.documentElement.style.setProperty('--glass-alpha', ca);
      document.body.classList.toggle('glass-solid', ca >= 1);

  } else {
    document.body.style.backgroundImage = '';
    document.body.classList.remove('has-bg');
    overlay.style.backdropFilter = 'none';
    overlay.style.webkitBackdropFilter = 'none';
    overlay.style.background = 'var(--ios-bg)';
    document.documentElement.style.removeProperty('--glass-alpha');
    document.body.classList.remove('glass-solid');
  }
}

function saveBg(dataUrl) {
  bgSettings.dataUrl = dataUrl || null;
  saveBgState();
  applyBg();
}

function openBgSheet() {
  document.getElementById('bgSheet').style.display = '';
  // sync size buttons
  document.querySelectorAll('.bg-size-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.size === bgSettings.size);
  });
  document.getElementById('bgBlurToggle').checked = bgSettings.blur;
  // sync alpha slider
  const sl = document.getElementById('bgAlphaSlider');
  const sv = document.getElementById('bgAlphaValue');
  if (sl) sl.value = bgSettings.cardAlpha ?? 0.75;
  if (sv) sv.textContent = Math.round((bgSettings.cardAlpha ?? 0.75) * 100) + '%';
  // preview
  if (bgSettings.dataUrl) {
    document.getElementById('bgPreviewWrap').style.display = '';
    document.getElementById('bgPreview').src = bgSettings.dataUrl;
  } else {
    document.getElementById('bgPreviewWrap').style.display = 'none';
  }
  document.getElementById('bgRemoveBtn').style.display = bgSettings.dataUrl ? '' : 'none';
}

function closeBgSheet() {
  document.getElementById('bgSheet').style.display = 'none';
}

// ---- stats ----
function updateStats() {
  const total = state.todos.length;
  const done = state.todos.filter(t => t.done).length;
  const active = total - done;
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const offset = CIRCUMFERENCE - (pct / 100) * CIRCUMFERENCE;
  document.getElementById('activeCount').textContent = active;
  document.getElementById('doneCount').textContent = done;
  document.getElementById('stats').textContent = total === 0 ? '暂无任务' : `共 ${total} 项`;
  document.getElementById('progressArc').setAttribute('stroke-dashoffset', offset);
  document.getElementById('progressPct').textContent = pct + '%';
  document.getElementById('progressRing').title = total === 0 ? '暂无任务' : `${done}/${total} 已完成 (${pct}%)`;
  document.getElementById('footer').style.display = total === 0 ? 'none' : '';
}

// ---- full render ----
function render() {
  const list = document.getElementById('list');
  const filtered = getFiltered();
  if (filtered.length === 0) {
    const msgs = {
      all: ['📋', '空空如也', '在顶部输入框添加第一个任务吧'],
      active: ['✨', '没有待办任务', '所有任务都已完成，好样的！'],
      done: ['✓', '还没有已完成的任务', '完成一个任务试试看'],
    };
    const m = state.search.trim()
      ? ['🔍', '没有匹配结果', '试试换个关键词搜索']
      : (msgs[state.filter] || msgs.all);
    list.innerHTML = `<li class="empty-state"><div class="icon">${m[0]}</div><strong>${m[1]}</strong><p>${m[2]}</p></li>`;
  } else {
    list.innerHTML = filtered.map(t => {
      const p = t.priority || 'med';
      const d = new Date(t.createdAt);
      const ds = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
      return `<li class="todo-item" data-id="${t.id}">
  <button class="cb ${t.done ? 'checked' : ''}" data-action="toggle" aria-label="${t.done ? '标记未完成' : '标记完成'}"></button>
  <span class="prio-dot ${p}" data-action="cycle-prio" title="点击切换优先级" role="button" tabindex="0"></span>
  <div class="label-wrap"><div class="label ${t.done ? 'done' : ''}" data-action="toggle">${esc(t.text)}</div><div class="meta">${ds} · ${p === 'high' ? '高' : p === 'med' ? '中' : '低'}优先级</div></div>
  <span class="row-actions"><button class="icon-btn info" data-action="edit" aria-label="编辑" title="编辑">✎</button><button class="icon-btn danger" data-action="delete" aria-label="删除" title="删除">✕</button></span>
</li>`;
    }).join('');
  }
  updateStats();
  document.querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('active', b.dataset.filter === state.filter));
  const sl = { priority: '优先级', date: '时间', alpha: '名称' };
  document.getElementById('sortBtn').innerHTML = `${sl[state.sort] || '排序'} <span class="arrow ${state.sortDesc ? 'desc' : ''}">▼</span>`;
}

function getFiltered() {
  let list = state.todos;
  if (state.filter === 'active') list = list.filter(t => !t.done);
  else if (state.filter === 'done') list = list.filter(t => t.done);
  if (state.search.trim()) { const q = state.search.trim().toLowerCase(); list = list.filter(t => t.text.toLowerCase().includes(q)); }
  const d = state.sortDesc ? -1 : 1;
  return [...list].sort((a, b) => {
    if (state.sort === 'priority') return (prioRank(a.priority) - prioRank(b.priority)) * d;
    if (state.sort === 'date') return (a.createdAt - b.createdAt) * d;
    if (state.sort === 'alpha') return a.text.localeCompare(b.text) * d;
    return 0;
  });
}

// ---- CRUD ----
function addTodo(text, priority) {
  const t = text.trim(); if (!t) return;
  state.todos.unshift({ id: uid(), text: t, done: false, priority: priority || 'med', createdAt: Date.now() });
  save();
  if (state.filter === 'done') state.filter = 'all';
  render();
}

function toggleTodo(id) {
  const t = state.todos.find(x => x.id === id); if (!t) return;
  t.done = !t.done; save();
  const item = document.querySelector(`.todo-item[data-id="${id}"]`);
  if (item) {
    const cb = item.querySelector('.cb'); const label = item.querySelector('.label');
    cb.classList.toggle('checked'); label.classList.toggle('done');
    cb.style.animation = 'none'; requestAnimationFrame(() => { cb.style.animation = ''; });
    const meta = item.querySelector('.meta');
    if (meta) { const d = new Date(t.createdAt); meta.textContent = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} · ${t.priority === 'high' ? '高' : t.priority === 'med' ? '中' : '低'}优先级`; }
  }
  updateStats();
}

function deleteTodo(id) {
  const item = document.querySelector(`.todo-item[data-id="${id}"]`);
  if (item) {
    item.classList.add('removing');
    const timer = setTimeout(() => {
      state.todos = state.todos.filter(x => x.id !== id); save();
      item.remove();
      if (document.querySelectorAll('.todo-item').length === 0) render(); else updateStats();
      removeTimers.delete(id);
    }, 220);
    removeTimers.set(id, timer);
  } else { state.todos = state.todos.filter(x => x.id !== id); save(); if (state.todos.length === 0) render(); else updateStats(); }
}

function clearDone() {
  const items = document.querySelectorAll('.todo-item .cb.checked');
  if (items.length === 0) return;
  items.forEach(cb => { const item = cb.closest('.todo-item'); if (item) item.classList.add('removing'); });
  setTimeout(() => {
    state.todos = state.todos.filter(t => !t.done); save();
    document.querySelectorAll('.todo-item.removing').forEach(el => el.remove());
    if (document.querySelectorAll('.todo-item').length === 0) render(); else updateStats();
  }, 220 + (items.length - 1) * 20);
}

function updateTodo(id, patch) {
  const t = state.todos.find(x => x.id === id); if (!t) return;
  Object.assign(t, patch); save();
  const item = document.querySelector(`.todo-item[data-id="${id}"]`);
  if (item) {
    const label = item.querySelector('.label'); const dot = item.querySelector('.prio-dot'); const meta = item.querySelector('.meta');
    if (patch.text !== undefined) label.textContent = patch.text;
    if (patch.priority !== undefined) {
      dot.className = 'prio-dot ' + patch.priority;
      if (meta) { const d = new Date(t.createdAt); meta.textContent = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} · ${patch.priority === 'high' ? '高' : patch.priority === 'med' ? '中' : '低'}优先级`; }
    }
  }
  updateStats();
}

function cyclePriority(id) {
  const t = state.todos.find(x => x.id === id); if (!t) return;
  const order = ['high', 'med', 'low'];
  t.priority = order[(order.indexOf(t.priority) + 1) % 3]; save();
  const item = document.querySelector(`.todo-item[data-id="${id}"]`);
  if (item) {
    item.querySelector('.prio-dot').className = 'prio-dot ' + t.priority;
    const meta = item.querySelector('.meta');
    if (meta) { const d = new Date(t.createdAt); meta.textContent = `${d.getMonth()+1}/${d.getDate()} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')} · ${t.priority === 'high' ? '高' : t.priority === 'med' ? '中' : '低'}优先级`; }
  }
  updateStats();
}

// ---- modal ----
function openEditModal(todo) {
  state.editTarget = todo;
  const overlay = document.createElement('div'); overlay.className = 'modal-overlay'; overlay.id = 'editModal';
  overlay.innerHTML = `<div class="modal-sheet"><div class="modal-title">编辑任务</div><div class="modal-field"><label>任务内容</label><input type="text" id="modalText" value="${esc(todo.text)}"></div><div class="modal-field"><label>优先级</label><div class="modal-prios" id="modalPrios"><button class="modal-prio-btn ${todo.priority === 'high' ? 'selected' : ''}" data-prio="high"><span class="dot"></span>高</button><button class="modal-prio-btn ${todo.priority === 'med' ? 'selected' : ''}" data-prio="med"><span class="dot"></span>中</button><button class="modal-prio-btn ${todo.priority === 'low' ? 'selected' : ''}" data-prio="low"><span class="dot"></span>低</button></div></div><div class="modal-actions"><button class="mbtn cancel" id="modalCancel">取消</button><button class="mbtn primary" id="modalSave">保存</button></div></div>`;
  document.body.appendChild(overlay);
  const input = document.getElementById('modalText'); input.focus(); input.select();
  document.getElementById('modalPrios').addEventListener('click', e => { const b = e.target.closest('.modal-prio-btn'); if (!b) return; document.querySelectorAll('.modal-prio-btn').forEach(x => x.classList.remove('selected')); b.classList.add('selected'); });
  function close() { const m = document.getElementById('editModal'); if (m) m.remove(); state.editTarget = null; }
  document.getElementById('modalCancel').addEventListener('click', close);
  document.getElementById('modalSave').addEventListener('click', () => { const text = document.getElementById('modalText').value.trim(); if (!text) return; const sel = document.querySelector('.modal-prio-btn.selected'); updateTodo(todo.id, { text, priority: sel ? sel.dataset.prio : todo.priority }); close(); });
  overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
  input.addEventListener('keydown', e => { if (e.key === 'Enter') document.getElementById('modalSave').click(); if (e.key === 'Escape') close(); });
}

// ---- events ----
function initEvents() {
  document.getElementById('form').addEventListener('submit', e => {
    e.preventDefault();
    const input = document.getElementById('taskInput'); if (!input.value.trim()) return;
    const sel = document.querySelector('.prio-dot-btn.selected');
    addTodo(input.value, sel ? sel.dataset.prio : 'med');
    input.value = ''; input.focus();
  });

  document.querySelectorAll('.prio-dot-btn').forEach(btn => {
    btn.addEventListener('click', () => { document.querySelectorAll('.prio-dot-btn').forEach(b => b.classList.remove('selected')); btn.classList.add('selected'); });
  });

  document.getElementById('list').addEventListener('click', e => {
    const ab = e.target.closest('[data-action]'); if (!ab) return;
    const item = ab.closest('.todo-item'); if (!item || item.classList.contains('removing')) return;
    const id = item.dataset.id;
    switch (ab.dataset.action) {
      case 'toggle': toggleTodo(id); break;
      case 'delete': deleteTodo(id); break;
      case 'cycle-prio': cyclePriority(id); break;
      case 'edit': { const t = state.todos.find(x => x.id === id); if (t) openEditModal(t); break; }
    }
  });

  document.getElementById('segFilters').addEventListener('click', e => {
    const b = e.target.closest('.seg-btn'); if (!b) return;
    state.filter = b.dataset.filter; render();
  });

  document.getElementById('sortBtn').addEventListener('click', () => {
    const modes = ['priority', 'date', 'alpha'];
    state.sort = modes[(modes.indexOf(state.sort) + 1) % 3]; state.sortDesc = false; render();
  });
  document.getElementById('sortBtn').addEventListener('contextmenu', e => { e.preventDefault(); state.sortDesc = !state.sortDesc; render(); });

  document.getElementById('clearDone').addEventListener('click', clearDone);

  let searchTimer;
  document.getElementById('searchInput').addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.search = document.getElementById('searchInput').value; render(); }, 200);
  });

  // bg: gear
  document.getElementById('gearBtn').addEventListener('click', openBgSheet);

  // bg: file
  document.getElementById('bgFileInput').addEventListener('change', e => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => { saveBg(ev.target.result); closeBgSheet(); };
    reader.readAsDataURL(file); e.target.value = '';
  });

  // bg: sheet buttons
  document.getElementById('bgChooseBtn').addEventListener('click', () => { document.getElementById('bgFileInput').click(); });
  document.getElementById('bgRemoveBtn').addEventListener('click', () => { saveBg(null); closeBgSheet(); });
  document.getElementById('bgCancelBtn').addEventListener('click', closeBgSheet);
  document.getElementById('bgSheet').addEventListener('click', e => { if (e.target === e.currentTarget) closeBgSheet(); });

  // bg: size mode
  document.getElementById('bgSizeGroup').addEventListener('click', e => {
    const btn = e.target.closest('.bg-size-btn'); if (!btn) return;
    bgSettings.size = btn.dataset.size;
    document.querySelectorAll('.bg-size-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    if (bgSettings.dataUrl) { saveBgState(); applyBg(); }
  });

  // bg: blur toggle
  document.getElementById('bgBlurToggle').addEventListener('change', e => {
    bgSettings.blur = e.target.checked;
    if (bgSettings.dataUrl) { saveBgState(); applyBg(); }
  });

  // bg: alpha slider
  const alphaSlider = document.getElementById('bgAlphaSlider');
  if (alphaSlider) {
    alphaSlider.addEventListener('input', e => {
      const v = parseFloat(e.target.value);
      bgSettings.cardAlpha = v;
      document.getElementById('bgAlphaValue').textContent = Math.round(v * 100) + '%';
      if (bgSettings.dataUrl) { saveBgState(); applyBg(); }
    });
  }

  // escape
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      const s = document.getElementById('bgSheet');
      if (s.style.display !== 'none') { closeBgSheet(); return; }
      document.activeElement?.blur();
    }
  });
}

load();
loadBg();
initEvents();
render();

