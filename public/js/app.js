const API = '';
let SECRET = '';
let currentQuizId = null;
let pendingCSVFile = null;
let _allQuizzes = [];
let _dashboardFilter = 'all';

// Debounce yordamchi - input event'larni siqib chiqaradi
function debounce(fn, wait = 200) {
  let t;
  return function(...args) {
    clearTimeout(t);
    t = setTimeout(() => fn.apply(this, args), wait);
  };
}

// ── THEME ────────────────────────────────────────────────────────────────────
(function initTheme() {
  const saved = localStorage.getItem('admin_theme');
  const prefersLight = window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches;
  const theme = saved || (prefersLight ? 'light' : 'dark');
  applyTheme(theme);
})();

function applyTheme(theme) {
  if (theme === 'light') {
    document.documentElement.setAttribute('data-theme', 'light');
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
  localStorage.setItem('admin_theme', theme);
  const icon = document.getElementById('tt-icon');
  const label = document.getElementById('tt-label');
  if (icon && label) {
    if (theme === 'light') { icon.textContent = '☀️'; label.textContent = 'Kunduzgi rejim'; }
    else { icon.textContent = '🌙'; label.textContent = 'Tungi rejim'; }
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  applyTheme(current === 'light' ? 'dark' : 'light');
}

// ── AUTH ──────────────────────────────────────────────────────────────────────
function login() {
  const val = document.getElementById('secret-input').value.trim();
  if (!val) { document.getElementById('login-error').textContent = 'Kalitni kiriting!'; return; }
  SECRET = val;
  localStorage.setItem('adminSecret', val);
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('app').classList.remove('hidden');
  loadDashboard();
}

function logout() {
  SECRET = '';
  localStorage.removeItem('adminSecret');
  document.getElementById('app').classList.add('hidden');
  document.getElementById('login-screen').classList.remove('hidden');
  document.getElementById('secret-input').value = '';
}

document.getElementById('secret-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') login();
});

// Global ESC handler: ochiq modalni yopadi
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  const modal = document.getElementById('modal');
  if (modal && !modal.classList.contains('hidden')) {
    closeModal();
  }
});

// Modal tashqarisiga bosish — yopiladi (faqat dangerous bo'lmagan modallar uchun)
document.addEventListener('click', e => {
  const modal = document.getElementById('modal');
  if (!modal || modal.classList.contains('hidden')) return;
  if (e.target === modal) {
    // Tashqi fonga bosildi, agar danger bo'lmasa yopamiz
    const content = modal.querySelector('.modal-content');
    if (!content?.classList.contains('danger')) closeModal();
  }
});

(function autoLogin() {
  const saved = localStorage.getItem('adminSecret');
  if (saved) {
    SECRET = saved;
    document.getElementById('login-screen').classList.add('hidden');
    document.getElementById('app').classList.remove('hidden');
    loadDashboard();
  }
})();

// ── NAV ───────────────────────────────────────────────────────────────────────
function showPage(name) {
  // Boshqa sahifaga o'tilganda jonli yangilanishni to'xtatamiz (interval to'planmasin)
  if (window._liveTimer) { clearInterval(window._liveTimer); window._liveTimer = null; }

  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));
  document.getElementById(`page-${name}`).classList.remove('hidden');
  document.getElementById(`nav-${name}`).classList.add('active');

  if (name === 'dashboard') loadDashboard();
  if (name === 'stats') loadStatsQuizList();
  if (name === 'blok') loadBlokSources();
  if (name === 'leaderboard') loadLeaderboard();
  if (name === 'live') startLive();
  // Sidebar'dan "Test yaratish" bosilganda — toza forma
  if (name === 'create-quiz' && !window._openingExisting) newQuizForm();
}

// ── API HELPER ────────────────────────────────────────────────────────────────
async function req(method, path, body) {
  const opts = {
    method,
    headers: { 'Content-Type': 'application/json', 'x-admin-secret': SECRET },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(API + path, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Server xatoligi');
  return data;
}

async function upload(path, formData) {
  const res = await fetch(API + path, {
    method: 'POST',
    headers: { 'x-admin-secret': SECRET },
    body: formData,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'Server xatoligi');
  return data;
}

// ── TOAST ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'success') {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = `toast ${type}`;
  t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3000);
}

// ── MODAL ─────────────────────────────────────────────────────────────────────
function confirm(icon, title, body, onConfirm) {
  document.getElementById('modal-icon').textContent = icon;
  document.getElementById('modal-title').textContent = title;
  document.getElementById('modal-body').innerHTML = `<p>${esc(body)}</p>`;
  document.getElementById('modal-confirm').onclick = () => { closeModal(); onConfirm(); };
  document.getElementById('modal').classList.remove('hidden');
}
function closeModal() {
  const modal = document.getElementById('modal');
  modal.classList.add('hidden');
  const content = modal.querySelector('.modal-content');
  content.classList.remove('danger');
  const confirmBtn = document.getElementById('modal-confirm');
  confirmBtn.className = 'btn-primary';
  confirmBtn.classList.remove('hidden');
  confirmBtn.disabled = false;
  confirmBtn.textContent = 'Ha';
}

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  try {
    const quizzes = await req('GET', '/api/quizzes');
    _allQuizzes = quizzes;
    filterDashboardQuizzes();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function setDashboardFilter(filter) {
  _dashboardFilter = filter;
  document.querySelectorAll('#page-dashboard .filter-chip[data-filter]').forEach(el => {
    el.classList.toggle('active', el.dataset.filter === filter);
  });
  filterDashboardQuizzes();
}

function filterDashboardQuizzes() {
  const el = document.getElementById('quiz-list');
  const search = (document.getElementById('quiz-search')?.value || '').toLowerCase().trim();
  const sort = document.getElementById('quiz-sort')?.value || 'new';

  let list = _allQuizzes.slice();

  if (_dashboardFilter === 'active') list = list.filter(q => q.isActive);
  else if (_dashboardFilter === 'inactive') list = list.filter(q => !q.isActive);

  if (search) {
    list = list.filter(q =>
      q.title.toLowerCase().includes(search) ||
      (q.description || '').toLowerCase().includes(search)
    );
  }

  if (sort === 'old') list.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  else if (sort === 'new') list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  else if (sort === 'title') list.sort((a, b) => a.title.localeCompare(b.title, 'uz'));
  else if (sort === 'most') list.sort((a, b) => (b._count?.questions || 0) - (a._count?.questions || 0));

  const cntLabel = document.getElementById('quiz-count-label');
  if (cntLabel) cntLabel.textContent = `${list.length} / ${_allQuizzes.length} ta test`;

  if (!_allQuizzes.length) {
    el.innerHTML = `<div class="empty-state"><div class="icon">📭</div><p>Hali testlar yo'q. Yangi test yarating!</p></div>`;
    return;
  }
  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><p>Filterga mos test topilmadi</p></div>`;
    return;
  }

  el.innerHTML = list.map(q => `
    <div class="quiz-card" id="quiz-card-${q.id}">
      <div class="qc-head">
        <h3>${esc(q.title)}</h3>
        <span class="badge ${q.isActive ? 'badge-active' : 'badge-inactive'}">${q.isActive ? 'Faol' : 'Nofaol'}</span>
      </div>
      <div class="meta">
        <span>📝 ${q._count.questions} savol</span>
        <span>⏱ ${q.timeLimit}s</span>
        <span>📅 ${new Date(q.createdAt).toLocaleDateString('uz')}</span>
        ${q._count.sessions ? `<span>🎮 ${q._count.sessions} sessiya</span>` : ''}
      </div>
      <div class="actions">
        <button onclick="openQuizEditor(${q.id})" class="btn-primary btn-sm">✏️ Savollar</button>
        <button onclick="showSendToGroupById(${q.id})" class="btn-secondary btn-sm">📤 Guruhga</button>
        <button onclick="toggleQuiz(${q.id}, ${q.isActive})" class="toggle-btn ${q.isActive ? 'toggle-active' : 'toggle-inactive'}">${q.isActive ? '🟢 Faol' : '🔴 Nofaol'}</button>
        <button onclick="deleteQuizById(${q.id})" class="btn-danger btn-sm" title="O'chirish">🗑️</button>
      </div>
    </div>
  `).join('');
}

// ID orqali lookup qilib chaqirish (apostrof va boshqa belgilarni xavfsiz qiladi)
function deleteQuizById(id) {
  const q = _allQuizzes.find(x => x.id === id);
  if (!q) { toast('Test topilmadi', 'error'); return; }
  deleteQuizConfirm(q.id, q.title, q._count?.questions || 0, q._count?.sessions || 0);
}

function showSendToGroupById(id) {
  const q = _allQuizzes.find(x => x.id === id);
  if (!q) { toast('Test topilmadi', 'error'); return; }
  showSendToGroup(q.id, q.title);
}

async function toggleQuiz(id, current) {
  try {
    await req('PUT', `/api/quizzes/${id}`, { isActive: !current });
    toast(current ? 'Test o\'chirildi' : 'Test yoqildi', 'success');
    loadDashboard();
  } catch (e) { toast(e.message, 'error'); }
}

function deleteQuiz(id, title) {
  // Legacy entry-point — endi deleteQuizConfirm chaqirilishi kerak,
  // lekin eski chaqiriqlar uchun ham ishlaydi.
  deleteQuizConfirm(id, title, 0, 0);
}

function deleteQuizConfirm(id, title, questionCount, sessionCount) {
  const modal = document.getElementById('modal');
  const content = modal.querySelector('.modal-content');
  content.classList.add('danger');
  const CONFIRM_WORD = 'OCHIR';

  document.getElementById('modal-icon').textContent = '🗑️';
  document.getElementById('modal-title').textContent = "Testni o'chirish";
  document.getElementById('modal-body').innerHTML = `
    <p style="margin-bottom:10px"><b>"${esc(title)}"</b> testini butunlay o'chirmoqchimisiz?</p>
    <div class="modal-stats">
      <div class="modal-stat"><div class="ms-val">${questionCount}</div><div class="ms-lbl">Savol</div></div>
      <div class="modal-stat"><div class="ms-val">${sessionCount}</div><div class="ms-lbl">Sessiya</div></div>
      <div class="modal-stat"><div class="ms-val">∞</div><div class="ms-lbl">Javoblar</div></div>
    </div>
    <div class="modal-warning">
      ⚠️ <b>Diqqat!</b> Bu amalni qaytarib bo'lmaydi. Test bilan birga barcha savollar,
      sessiyalar va o'yinchilarning javoblari o'chiriladi.
    </div>
    <p style="margin-bottom:6px;font-size:13px;color:var(--text-muted);text-align:left">
      Tasdiqlash uchun <b style="color:var(--danger)">${CONFIRM_WORD}</b> deb yozing:
    </p>
    <input type="text" id="delete-confirm-input" class="modal-input" autocomplete="off"
      style="width:100%;margin-bottom:0" placeholder="${CONFIRM_WORD} deb yozing..." />
  `;

  const confirmBtn = document.getElementById('modal-confirm');
  confirmBtn.textContent = "Ha, o'chirish";
  confirmBtn.className = 'btn-danger-strong';
  confirmBtn.disabled = true;

  const input = document.getElementById('delete-confirm-input');
  const matches = () => input.value.trim().toUpperCase() === CONFIRM_WORD;
  input.oninput = () => { confirmBtn.disabled = !matches(); };
  input.onkeydown = (e) => {
    if (e.key === 'Enter' && matches()) confirmBtn.click();
  };

  confirmBtn.onclick = async () => {
    if (!matches()) return;
    confirmBtn.disabled = true;
    confirmBtn.textContent = "O'chirilmoqda...";
    try {
      await req('DELETE', `/api/quizzes/${id}`);
      closeModal();
      toast(`"${title}" testi o'chirildi`, 'success');
      loadDashboard();
    } catch (e) {
      toast(e.message, 'error');
      confirmBtn.disabled = false;
      confirmBtn.textContent = "Ha, o'chirish";
    }
  };

  modal.classList.remove('hidden');
  setTimeout(() => input.focus(), 100);
}

// ── CREATE / EDIT QUIZ ────────────────────────────────────────────────────────
function newQuizForm() {
  currentQuizId = null;
  document.getElementById('quiz-title').value = '';
  document.getElementById('quiz-desc').value = '';
  document.getElementById('quiz-time').value = 30;
  document.getElementById('quiz-shuffle-q').value = 'true';
  document.getElementById('quiz-shuffle-a').value = 'true';
  document.getElementById('create-quiz-title').textContent = '➕ Yangi Test Yaratish';
  document.getElementById('btn-save-quiz').textContent = '✅ Test yaratish';
  document.getElementById('btn-new-quiz').classList.add('hidden');
  document.getElementById('questions-section').classList.add('hidden');
  document.getElementById('questions-preview').innerHTML = '';
}

async function saveQuiz() {
  const title = document.getElementById('quiz-title').value.trim();
  const desc = document.getElementById('quiz-desc').value.trim();
  const timeLimit = parseInt(document.getElementById('quiz-time').value);
  const shuffleQ = document.getElementById('quiz-shuffle-q').value === 'true';
  const shuffleA = document.getElementById('quiz-shuffle-a').value === 'true';

  if (!title) { toast('Test nomini kiriting!', 'error'); return; }
  if (!timeLimit || timeLimit < 5) { toast('Vaqt limiti kamida 5 soniya bo\'lishi kerak', 'error'); return; }

  try {
    if (currentQuizId) {
      // YANGILASH — mavjud testni o'zgartirish
      const quiz = await req('PUT', `/api/quizzes/${currentQuizId}`, {
        title, description: desc, timeLimit, shuffleQ, shuffleA,
      });
      toast(`"${quiz.title}" yangilandi!`, 'success');
      loadQuestionsPreview(currentQuizId);
    } else {
      // YANGI YARATISH
      const quiz = await req('POST', '/api/quizzes', { title, description: desc, timeLimit, shuffleQ, shuffleA });
      currentQuizId = quiz.id;
      document.getElementById('create-quiz-title').textContent = `✏️ Tahrirlash: ${esc(quiz.title)}`;
      document.getElementById('btn-save-quiz').textContent = '💾 O\'zgarishlarni saqlash';
      document.getElementById('btn-new-quiz').classList.remove('hidden');
      document.getElementById('questions-section').classList.remove('hidden');
      document.getElementById('questions-preview').innerHTML = '';
      toast(`"${quiz.title}" yaratildi!`, 'success');
      loadQuestionsPreview(quiz.id);
    }
  } catch (e) { toast(e.message, 'error'); }
}

// Eski nomli funksiya - external chaqirishlar uchun saqlanadi
async function createQuiz() { return saveQuiz(); }

async function openQuizEditor(quizId) {
  window._openingExisting = true;
  showPage('create-quiz');
  window._openingExisting = false;
  try {
    const quiz = await req('GET', `/api/quizzes/${quizId}`);
    currentQuizId = quizId;
    document.getElementById('quiz-title').value = quiz.title;
    document.getElementById('quiz-desc').value = quiz.description || '';
    document.getElementById('quiz-time').value = quiz.timeLimit;
    document.getElementById('quiz-shuffle-q').value = String(quiz.shuffleQ);
    document.getElementById('quiz-shuffle-a').value = String(quiz.shuffleA);
    document.getElementById('create-quiz-title').textContent = `✏️ Tahrirlash: ${esc(quiz.title)}`;
    document.getElementById('btn-save-quiz').textContent = '💾 O\'zgarishlarni saqlash';
    document.getElementById('btn-new-quiz').classList.remove('hidden');
    document.getElementById('questions-section').classList.remove('hidden');
    loadQuestionsPreview(quizId);
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function addQuestion() {
  if (!currentQuizId) { toast('Avval test yarating!', 'error'); return; }

  const text = document.getElementById('q-text').value.trim();
  const a = document.getElementById('q-a').value.trim();
  const b = document.getElementById('q-b').value.trim();
  const c = document.getElementById('q-c').value.trim();
  const d = document.getElementById('q-d').value.trim();
  const correct = parseInt(document.getElementById('q-correct').value);
  const explain = document.getElementById('q-explain').value.trim();

  if (!text || !a || !b || !c || !d) { toast('Barcha maydonlarni to\'ldiring!', 'error'); return; }

  try {
    await req('POST', `/api/quizzes/${currentQuizId}/questions`, {
      text, options: [a, b, c, d], correct, explain: explain || null,
    });
    toast('Savol qo\'shildi!', 'success');
    ['q-text', 'q-a', 'q-b', 'q-c', 'q-d', 'q-explain'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('q-correct').value = '0';
    loadQuestionsPreview(currentQuizId);
  } catch (e) { toast(e.message, 'error'); }
}

async function loadQuestionsPreview(quizId) {
  const questions = await req('GET', `/api/quizzes/${quizId}/questions`);
  const el = document.getElementById('questions-preview');
  if (!questions.length) { el.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">Hali savollar yo\'q</p>'; return; }

  const labels = ['A', 'B', 'C', 'D'];
  el.innerHTML = questions.map((q, i) => {
    const opts = q.options;
    return `
      <div class="question-item">
        <div class="q-info">
          <h4>${i + 1}. ${esc(q.text)}</h4>
          <div class="opts">
            ${opts.map((o, idx) => `<span ${idx === q.correct ? 'class="correct-opt"' : ''}>${labels[idx]}: ${esc(o)}</span> `).join('')}
          </div>
          ${q.explain ? `<div style="font-size:12px;color:var(--primary);margin-top:4px">💡 ${esc(q.explain)}</div>` : ''}
        </div>
        <button onclick="deleteQuestion(${q.id}, ${quizId})" class="btn-danger" style="font-size:12px;padding:5px 10px;flex-shrink:0">🗑️</button>
      </div>
    `;
  }).join('');
}

async function deleteQuestion(id, quizId) {
  try {
    await req('DELETE', `/api/questions/${id}`);
    toast('Savol o\'chirildi', 'success');
    loadQuestionsPreview(quizId);
  } catch (e) { toast(e.message, 'error'); }
}

// ── CSV IMPORT ────────────────────────────────────────────────────────────────
let _importPreview = null; // server'dan qaytgan preview ma'lumotlari

async function previewCSV() {
  const file = document.getElementById('csv-file').files[0];
  if (!file) return;
  pendingCSVFile = file;

  const fd = new FormData();
  fd.append('file', file);

  try {
    const data = await upload('/api/import/preview', fd);
    _importPreview = data;
    renderPreview(data);

    // CSV'dagi birinchi quiz_title ni default sifatida taklif qilamiz
    const titleInput = document.getElementById('import-title');
    if (!titleInput.value.trim()) {
      titleInput.value = data[0]?.title || '';
    }

    // Mavjud test bormi tekshirish
    updateExistingWarning();
    titleInput.oninput = updateExistingWarning;

    document.getElementById('preview-section').classList.remove('hidden');
    titleInput.focus();
    titleInput.select();
  } catch (e) { toast(e.message, 'error'); }
}

function updateExistingWarning() {
  const titleInput = document.getElementById('import-title');
  const warn = document.getElementById('import-existing-warn');
  const warnText = document.getElementById('import-existing-warn-text');
  const title = titleInput.value.trim();
  if (!title) { warn.classList.add('hidden'); return; }

  // _allQuizzes (dashboard cache) yoki preview'dan mavjudlik
  const existing = _allQuizzes.find(q => q.title.toLowerCase() === title.toLowerCase())
    || _importPreview?.find(g => g.existing && g.existing.title.toLowerCase() === title.toLowerCase())?.existing;

  if (existing) {
    const qCount = existing._count?.questions ?? existing.questionCount ?? '?';
    warnText.innerHTML = `⚠️ <b>"${esc(title)}"</b> nomli test allaqachon mavjud (${qCount} savol). Import qilganingizda variantni tanlashingiz kerak.`;
    warn.classList.remove('hidden');
  } else {
    warn.classList.add('hidden');
  }
}

function renderPreview(groups) {
  const el = document.getElementById('preview-content');
  el.innerHTML = groups.map(g => `
    <p class="preview-quiz-title">📚 ${esc(g.title)} — ${g.questionCount} savol${g.existing ? ' <span class="badge badge-inactive" style="margin-left:6px">⚠️ Mavjud</span>' : ''}</p>
    <table class="preview-table">
      <thead><tr><th>#</th><th>Savol</th><th>A</th><th>B</th><th>C</th><th>D</th><th>To'g'ri</th></tr></thead>
      <tbody>
        ${g.questions.map((q, i) => {
          const opts = [q.option_a, q.option_b, q.option_c, q.option_d];
          const correctIdx = { A:0, B:1, C:2, D:3 }[q.correct?.toUpperCase()] ?? -1;
          return `<tr>
            <td>${i + 1}</td>
            <td>${esc(q.question)}</td>
            ${opts.map((o, idx) => `<td ${idx === correctIdx ? 'style="color:var(--success);font-weight:700"' : ''}>${esc(o)}</td>`).join('')}
            <td style="font-weight:700;color:var(--success)">${q.correct?.toUpperCase()}</td>
          </tr>`;
        }).join('')}
        ${g.questionCount > 3 ? `<tr><td colspan="7" style="text-align:center;color:var(--text-muted);font-style:italic">... va yana ${g.questionCount - 3} ta savol</td></tr>` : ''}
      </tbody>
    </table>
  `).join('');
}

async function doImportCSV() {
  if (!pendingCSVFile) return;
  const title = document.getElementById('import-title').value.trim();
  const timeLimit = parseInt(document.getElementById('import-time').value);
  const shuffleQ = document.getElementById('import-shuffle-q').value;
  const shuffleA = document.getElementById('import-shuffle-a').value;

  if (!title) { toast('Test to\'plami nomini kiriting!', 'error'); return; }
  if (!timeLimit || timeLimit < 5) { toast('Vaqt limiti kamida 5 soniya bo\'lishi kerak', 'error'); return; }

  // Avval mavjudligini dashboard cache'dan tekshiramiz
  await refreshAllQuizzes();
  const existing = _allQuizzes.find(q => q.title.toLowerCase() === title.toLowerCase());

  if (existing) {
    showImportConflictModal(existing, { title, timeLimit, shuffleQ, shuffleA });
  } else {
    await runImport({ title, timeLimit, shuffleQ, shuffleA, mode: 'auto' });
  }
}

async function refreshAllQuizzes() {
  try {
    _allQuizzes = await req('GET', '/api/quizzes');
  } catch (e) { /* ignore */ }
}

function showImportConflictModal(existing, opts) {
  const modal = document.getElementById('modal');
  document.getElementById('modal-icon').textContent = '⚠️';
  document.getElementById('modal-title').textContent = 'Bunday test mavjud';
  document.getElementById('modal-body').innerHTML = `
    <p style="margin-bottom:14px;text-align:left">
      <b>"${esc(opts.title)}"</b> nomli test allaqachon mavjud
      (<b>${existing._count?.questions || 0}</b> savol bilan).
      Nima qilamiz?
    </p>
    <div class="import-choices">
      <button class="import-choice" data-mode="append">
        <div class="ic-icon">➕</div>
        <div class="ic-body">
          <div class="ic-title">Mavjudga qo'shish</div>
          <div class="ic-desc">Yangi savollar eski to'plamga qo'shiladi</div>
        </div>
      </button>
      <button class="import-choice" data-mode="replace">
        <div class="ic-icon">🔄</div>
        <div class="ic-body">
          <div class="ic-title">Eskilarini almashtirish</div>
          <div class="ic-desc">Eski savollar o'chirilib, yangilari yoziladi</div>
        </div>
      </button>
      <button class="import-choice" data-mode="rename">
        <div class="ic-icon">✏️</div>
        <div class="ic-body">
          <div class="ic-title">Boshqa nom bilan saqlash</div>
          <div class="ic-desc">Alohida yangi to'plam yaratiladi</div>
        </div>
      </button>
    </div>
    <div id="rename-block" class="hidden" style="margin-top:12px;text-align:left">
      <p style="margin-bottom:6px;font-size:13px;color:var(--text-muted)">Yangi nomi:</p>
      <input type="text" id="import-new-title" class="modal-input" style="width:100%"
        placeholder="Yangi test nomi..." value="${esc(opts.title)} (2)" />
    </div>
  `;

  // Modal tugmalarini yashirish - choice'lar o'zi action vazifasini bajaradi
  const confirmBtn = document.getElementById('modal-confirm');
  confirmBtn.classList.add('hidden');

  modal.querySelectorAll('.import-choice').forEach(btn => {
    btn.onclick = async () => {
      const mode = btn.dataset.mode;
      if (mode === 'rename') {
        document.getElementById('rename-block').classList.remove('hidden');
        confirmBtn.classList.remove('hidden');
        confirmBtn.textContent = '✅ Yangi nom bilan import';
        confirmBtn.className = 'btn-primary';
        confirmBtn.onclick = async () => {
          const newTitle = document.getElementById('import-new-title').value.trim();
          if (!newTitle) { toast('Yangi nomni kiriting!', 'error'); return; }
          closeModal();
          await runImport({ ...opts, mode: 'rename', newTitle });
        };
        document.getElementById('import-new-title').focus();
        document.getElementById('import-new-title').select();
        return;
      }
      closeModal();
      await runImport({ ...opts, mode });
    };
  });

  modal.classList.remove('hidden');
}

async function runImport(opts) {
  if (!pendingCSVFile) return;
  const fd = new FormData();
  fd.append('file', pendingCSVFile);
  fd.append('customTitle', opts.title);
  fd.append('timeLimit', String(opts.timeLimit));
  fd.append('shuffleQ', opts.shuffleQ);
  fd.append('shuffleA', opts.shuffleA);
  fd.append('mode', opts.mode || 'auto');
  if (opts.newTitle) fd.append('newTitle', opts.newTitle);

  try {
    const results = await upload('/api/import/csv', fd);
    const total = results.reduce((sum, r) => sum + r.imported, 0);
    const names = results.map(r => `"${r.title}"`).join(', ');
    toast(`✅ ${names} ga ${total} ta savol import qilindi`, 'success');
    clearPreview();
    loadDashboard();
  } catch (e) { toast(e.message, 'error'); }
}

// Backward compatibility
async function importCSV() { return doImportCSV(); }

function clearPreview() {
  pendingCSVFile = null;
  _importPreview = null;
  document.getElementById('csv-file').value = '';
  document.getElementById('preview-section').classList.add('hidden');
  document.getElementById('preview-content').innerHTML = '';
  document.getElementById('import-title').value = '';
  document.getElementById('import-existing-warn').classList.add('hidden');
}

// Drag & drop
const uploadArea = document.getElementById('upload-area');
uploadArea.addEventListener('dragover', e => { e.preventDefault(); uploadArea.style.borderColor = 'var(--primary)'; });
uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = ''; });
uploadArea.addEventListener('drop', e => {
  e.preventDefault();
  uploadArea.style.borderColor = '';
  const file = e.dataTransfer.files[0];
  if (file && file.name.endsWith('.csv')) {
    const dt = new DataTransfer();
    dt.items.add(file);
    document.getElementById('csv-file').files = dt.files;
    previewCSV();
  } else { toast('Faqat .csv fayl!', 'error'); }
});

// ── STATS ─────────────────────────────────────────────────────────────────────
async function loadStatsQuizList() {
  const quizzes = await req('GET', '/api/quizzes');
  const sel = document.getElementById('stats-quiz-id');
  sel.innerHTML = '<option value="">— Tanlang —</option>' +
    quizzes.map(q => `<option value="${q.id}">${esc(q.title)}</option>`).join('');
}

let _statsQuizId = null;
async function loadStats() {
  const id = document.getElementById('stats-quiz-id').value;
  const csvBtn = document.getElementById('btn-results-csv');
  if (!id) {
    document.getElementById('stats-content').innerHTML = '';
    if (csvBtn) csvBtn.classList.add('hidden');
    return;
  }
  _statsQuizId = id;
  if (csvBtn) csvBtn.classList.remove('hidden');

  const stats = await req('GET', `/api/quizzes/${id}/stats`);
  const el = document.getElementById('stats-content');

  if (!stats.length) {
    el.innerHTML = '<p style="text-align:center;color:var(--text-muted);padding:32px">Bu test uchun hali natijalar yo\'q</p>';
    return;
  }

  const totalQuestions = stats[0].totalQuestions || 0;

  // ── Umumiy xulosa + barcha sessiyalar bo'ylab birlashgan reyting ──
  // Har bir foydalanuvchining (username bo'yicha) ENG YAXSHI natijasini olamiz.
  const best = {}; // username -> {correct, total, sessions}
  let totalParticipations = 0;
  let perfectCount = 0;
  let sumPct = 0;
  let pctCount = 0;

  stats.forEach(s => {
    s.participants.forEach(p => {
      totalParticipations++;
      const pct = s.totalQuestions ? p.correct / s.totalQuestions : 0;
      sumPct += pct; pctCount++;
      if (pct === 1) perfectCount++;
      const cur = best[p.username];
      if (!cur || p.correct > cur.correct) {
        best[p.username] = { username: p.username, correct: p.correct, total: s.totalQuestions };
      }
    });
  });

  const board = Object.values(best).sort((a, b) => b.correct - a.correct);
  const avgPct = pctCount ? Math.round((sumPct / pctCount) * 100) : 0;
  const bestPct = board.length && board[0].total ? Math.round((board[0].correct / board[0].total) * 100) : 0;
  const finished = stats.filter(s => !s.isActive).length;

  const medals = ['🥇', '🥈', '🥉'];

  const summary = `
    <div class="stats-summary">
      <div class="stat-card"><div class="sc-val">${stats.length}</div><div class="sc-lbl">Sessiya</div></div>
      <div class="stat-card"><div class="sc-val">${board.length}</div><div class="sc-lbl">Ishtirokchi</div></div>
      <div class="stat-card"><div class="sc-val">${totalParticipations}</div><div class="sc-lbl">Urinish</div></div>
      <div class="stat-card"><div class="sc-val">${bestPct}%</div><div class="sc-lbl">Eng yuqori</div></div>
      <div class="stat-card"><div class="sc-val">${avgPct}%</div><div class="sc-lbl">O'rtacha</div></div>
      <div class="stat-card"><div class="sc-val">${perfectCount}</div><div class="sc-lbl">💎 Mukammal</div></div>
    </div>`;

  const overallBoard = `
    <div class="stats-session">
      <h4>🏆 Umumiy reyting <span style="font-weight:400;color:var(--text-muted)">(har kishining eng yaxshi natijasi · ${totalQuestions} savoldan)</span></h4>
      <ul class="leaderboard">
        ${board.slice(0, 50).map((p, i) => `
          <li>
            <span class="rank">${medals[i] || (i + 1) + '.'}</span>
            <span class="name">@${esc(p.username)}</span>
            <span class="score">${p.correct}/${p.total || totalQuestions} (${p.total ? Math.round(p.correct/p.total*100) : 0}%)</span>
          </li>
        `).join('')}
      </ul>
      ${board.length > 50 ? `<p style="color:var(--text-muted);text-align:center;margin-top:8px">... va yana ${board.length - 50} ishtirokchi</p>` : ''}
    </div>`;

  // ── Har bir sessiya bo'yicha batafsil (yig'iladigan) ──
  const sessionsHtml = stats.map((s, si) => `
    <details class="stats-session" ${si === 0 ? 'open' : ''}>
      <summary>
        📅 ${new Date(s.createdAt).toLocaleString('uz')}
        <span class="badge ${s.isActive ? 'badge-active' : 'badge-inactive'}" style="margin-left:8px">${s.isActive ? 'Davom etmoqda' : 'Tugallangan'}</span>
        <span style="color:var(--text-muted);font-weight:400;margin-left:8px">👥 ${s.participants.length}</span>
      </summary>
      ${s.participants.length ? `
        <ul class="leaderboard">
          ${s.participants.map((p, i) => `
            <li>
              <span class="rank">${medals[i] || (i + 1) + '.'}</span>
              <span class="name">@${esc(p.username)}</span>
              <span class="score">${p.correct}/${s.totalQuestions} (${Math.round(p.correct/s.totalQuestions*100)}%)</span>
            </li>
          `).join('')}
        </ul>
      ` : '<p style="color:var(--text-muted)">Ishtirokchilar yo\'q</p>'}
    </details>
  `).join('');

  el.innerHTML = summary + overallBoard +
    `<div id="question-stats"></div>` +
    `<h3 style="margin:20px 0 8px">📋 Sessiyalar tarixi (${stats.length})</h3>` + sessionsHtml;

  loadQuestionStats(id);
}

// Har bir savol bo'yicha qiyinchilik (qaysi savolga ko'p xato qilingan)
async function loadQuestionStats(id) {
  const el = document.getElementById('question-stats');
  if (!el) return;
  try {
    const qs = await req('GET', `/api/quizzes/${id}/question-stats`);
    const answered = qs.filter(q => q.total > 0);
    if (!answered.length) { el.innerHTML = ''; return; }
    // Eng qiyinlari (past foiz) yuqorida
    const sorted = answered.slice().sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));
    el.innerHTML = `
      <h3 style="margin:20px 0 8px">🧠 Savollar qiyinligi <span style="font-weight:400;color:var(--text-muted)">(eng qiyini yuqorida)</span></h3>
      <div class="card">
        ${sorted.map(q => {
          const pct = q.pct ?? 0;
          const cls = pct >= 70 ? 'qd-ok' : pct >= 40 ? 'qd-mid' : 'qd-hard';
          return `
            <div class="qdiff-row">
              <div class="qdiff-text">${q.order}. ${esc(q.text)}</div>
              <div class="qdiff-bar"><div class="qdiff-fill ${cls}" style="width:${pct}%"></div></div>
              <div class="qdiff-pct">${pct}% <span>(${q.correct}/${q.total})</span></div>
            </div>`;
        }).join('')}
      </div>`;
  } catch (e) { el.innerHTML = ''; }
}

function downloadResultsCsv() {
  if (!_statsQuizId) return;
  window.open(`/api/quizzes/${_statsQuizId}/results-csv`, '_blank');
}

async function loadLeaderboard() {
  const el = document.getElementById('leaderboard-content');
  if (!el) return;
  el.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">Yuklanmoqda...</p>';
  try {
    const board = await req('GET', '/api/leaderboard');
    if (!board.length) {
      el.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px">Hali natijalar yo\'q</p>';
      return;
    }
    const medals = ['🥇', '🥈', '🥉'];
    el.innerHTML = `
      <ul class="leaderboard">
        ${board.map((u, i) => `
          <li>
            <span class="rank">${medals[i] || (i + 1) + '.'}</span>
            <span class="name">@${esc(u.username)}</span>
            <span class="score">${u.correct} ✅ · ${u.pct}% · ${u.sessions} test</span>
          </li>
        `).join('')}
      </ul>`;
  } catch (e) { toast(e.message, 'error'); }
}

// ── JONLI SESSIYALAR ────────────────────────────────────────────────────────
function startLive() {
  loadLiveSessions();
  window._liveTimer = setInterval(loadLiveSessions, 4000);
}

async function loadLiveSessions() {
  const el = document.getElementById('live-list');
  if (!el) return;
  try {
    const sessions = await req('GET', '/api/sessions/live');
    renderLiveSessions(sessions);
  } catch (e) {
    el.innerHTML = `<p style="color:var(--danger,#e53);text-align:center;padding:20px">${esc(e.message)}</p>`;
  }
}

function renderLiveSessions(sessions) {
  const el = document.getElementById('live-list');
  const label = document.getElementById('live-count-label');
  const upd = document.getElementById('live-updated');
  if (label) label.textContent = sessions.length ? `${sessions.length} ta faol` : '';
  if (upd) upd.textContent = 'Yangilandi: ' + new Date().toLocaleTimeString('uz');
  if (!el) return;
  if (!sessions.length) {
    el.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:40px">🟢 Hozir faol sessiya yo\'q</p>';
    return;
  }
  const kindBadge = { bot: '👤 Shaxsiy', group: '👥 Guruh', web: '🌐 Web' };
  el.innerHTML = sessions.map(s => {
    const pct = s.total ? Math.round((s.current / s.total) * 100) : 0;
    return `
    <div class="quiz-card live-card">
      <div class="live-head">
        <span class="live-kind">${kindBadge[s.kind] || esc(s.kind)}</span>
        ${s.isBlok ? '<span class="live-kind blok">🧩 Blok</span>' : ''}
      </div>
      <h3 class="live-title">${esc(s.quizTitle)}</h3>
      <div class="live-progress">
        <div class="live-bar"><div class="live-bar-fill" style="width:${pct}%"></div></div>
        <span class="live-prog-text">Savol ${s.current ?? '?'} / ${s.total ?? '?'}</span>
      </div>
      <div class="live-meta">
        <span>👥 ${s.participants} ishtirokchi</span>
        <span>✍️ ${s.totalAnswers} javob</span>
        <span>⏱ ${liveElapsed(s.startTime)}</span>
      </div>
    </div>`;
  }).join('');
}

function liveElapsed(startTime) {
  const sec = Math.max(0, Math.floor((Date.now() - new Date(startTime).getTime()) / 1000));
  const m = Math.floor(sec / 60), s = sec % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

// ── BLOK TEST (fan bo'yicha) ────────────────────────────────────────────────
let _blokSubjects = [];     // /api/subjects dan: [{key,label,quizIds,total,parts}]
let _blokSel = {};          // key -> tanlangan savollar soni
let _blokPage = 0;
const BLOK_PAGE = 8;        // sahifadagi fanlar soni

async function loadBlokSources() {
  try {
    _blokSubjects = await req('GET', '/api/subjects');
    _blokPage = 0;
    renderBlokSources();
    loadPresets();
  } catch (e) { toast(e.message, 'error'); }
}

function blokFilteredSubjects() {
  const search = (document.getElementById('blok-search')?.value || '').toLowerCase().trim();
  let list = _blokSubjects.filter(s => s.total > 0);
  if (search) list = list.filter(s => s.label.toLowerCase().includes(search));
  return list;
}

function onBlokSearch() { _blokPage = 0; renderBlokSources(); }

function renderBlokSources() {
  const el = document.getElementById('blok-source-list');
  if (!el) return;

  const list = blokFilteredSubjects();
  if (!list.length) {
    el.innerHTML = `<div class="empty-state"><div class="icon">🔍</div><p>Fan topilmadi</p></div>`;
    document.getElementById('blok-pagination').innerHTML = '';
    updateBlokSummary();
    return;
  }

  const pages = Math.max(1, Math.ceil(list.length / BLOK_PAGE));
  if (_blokPage >= pages) _blokPage = pages - 1;
  const start = _blokPage * BLOK_PAGE;
  const slice = list.slice(start, start + BLOK_PAGE);

  el.innerHTML = slice.map(s => {
    const gi = _blokSubjects.indexOf(s); // barqaror global indeks (key/apostrof muammosidan qochish)
    const on = _blokSel[s.key] != null;
    const cnt = on ? _blokSel[s.key] : Math.min(20, s.total);
    const idsCsv = s.quizIds.join(',');
    return `
      <div class="blok-row ${on ? 'on' : ''}">
        <div class="blok-row-head">
          <label class="blok-check">
            <input type="checkbox" ${on ? 'checked' : ''} onchange="toggleBlokSubject(${gi})" />
            <span class="blok-row-title">${esc(s.label)}</span>
            <span class="blok-row-total">${s.total} savol · ${s.parts} bo'lak</span>
          </label>
          <button type="button" class="blok-all-btn" title="Shu fan savollarini CSV yuklab olish"
            onclick="downloadSubjectCsv('${idsCsv}')">⬇️ CSV</button>
        </div>
        <div class="blok-slider-wrap ${on ? '' : 'hidden'}">
          <input type="range" class="blok-slider" min="1" max="${s.total}" value="${cnt}"
            oninput="setBlokSubjectCount(${gi}, this.value, this)" />
          <input type="number" class="blok-count-input" min="1" max="${s.total}" value="${cnt}"
            oninput="setBlokSubjectCount(${gi}, this.value, this)" />
          <button type="button" class="blok-all-btn" onclick="setBlokSubjectCount(${gi}, ${s.total}); renderBlokSources()">Hammasi</button>
        </div>
      </div>
    `;
  }).join('');

  // Pagination (1 2 3)
  const pg = document.getElementById('blok-pagination');
  if (pages > 1) {
    let html = '';
    for (let p = 0; p < pages; p++) {
      html += `<button class="blok-page-btn ${p === _blokPage ? 'active' : ''}" onclick="gotoBlokPage(${p})">${p + 1}</button>`;
    }
    pg.innerHTML = html;
  } else {
    pg.innerHTML = '';
  }

  updateBlokSummary();
}

function gotoBlokPage(p) { _blokPage = p; renderBlokSources(); }

function toggleBlokSubject(gi) {
  const s = _blokSubjects[gi];
  if (!s) return;
  if (_blokSel[s.key] != null) delete _blokSel[s.key];
  else _blokSel[s.key] = Math.min(20, s.total);
  renderBlokSources();
}

// el berilsa (slider yoki number input), butun row qayta chizilmay,
// faqat juftlik (slider <-> number) sinxronlanadi — slayder silliq ishlashi uchun.
function setBlokSubjectCount(gi, val, el) {
  const s = _blokSubjects[gi];
  if (!s) return;
  let n = parseInt(val);
  if (isNaN(n)) n = 1;
  n = Math.max(1, Math.min(n, s.total));
  _blokSel[s.key] = n;
  if (el) {
    const row = el.closest('.blok-row');
    if (row) {
      const slider = row.querySelector('.blok-slider');
      const num = row.querySelector('.blok-count-input');
      if (slider && slider !== el) slider.value = n;
      if (num && num !== el) num.value = n;
    }
  }
  updateBlokSummary();
}

function updateBlokSummary() {
  const el = document.getElementById('blok-summary');
  if (!el) return;
  const keys = Object.keys(_blokSel);
  const totalQ = keys.reduce((s, k) => s + (parseInt(_blokSel[k]) || 0), 0);
  if (!keys.length) {
    el.innerHTML = `<div class="blok-sum-empty">Hali fan tanlanmadi</div>`;
    return;
  }
  el.innerHTML = `
    <div class="blok-sum-box">
      <div><b>${keys.length}</b> ta fan tanlandi</div>
      <div>Jami: <b>${totalQ}</b> ta savol blok testga kiradi</div>
    </div>`;
}

function downloadSubjectCsv(idsCsv) {
  if (!idsCsv) { toast('Test topilmadi', 'error'); return; }
  window.open(`/api/export/csv?quizIds=${encodeURIComponent(idsCsv)}`, '_blank');
}

// Tanlangan fanlardan manba ro'yxati tuzadi
function blokSelectedSources() {
  return Object.keys(_blokSel).map(key => {
    const subj = _blokSubjects.find(s => s.key === key);
    if (!subj) return null;
    return { label: subj.label, quizIds: subj.quizIds, count: parseInt(_blokSel[key]) || 0 };
  }).filter(s => s && s.count > 0);
}

async function createBlokTest() {
  const title = document.getElementById('blok-title').value.trim();
  const timeLimit = parseInt(document.getElementById('blok-time').value);
  const shuffleQ = document.getElementById('blok-shuffle-q').value === 'true';
  const shuffleA = document.getElementById('blok-shuffle-a').value === 'true';

  if (!title) { toast('Blok test nomini kiriting!', 'error'); return; }
  if (!timeLimit || timeLimit < 5) { toast('Vaqt limiti kamida 5 soniya', 'error'); return; }

  const sources = blokSelectedSources().map(s => ({ quizIds: s.quizIds, count: s.count }));
  if (!sources.length) { toast('Kamida bitta fandan savol tanlang!', 'error'); return; }

  const btn = document.getElementById('btn-create-blok');
  btn.disabled = true;
  btn.textContent = 'Yaratilmoqda...';
  try {
    const quiz = await req('POST', '/api/quizzes/blok', { title, timeLimit, shuffleQ, shuffleA, sources });
    toast(`✅ "${quiz.title}" yaratildi (${quiz.questions?.length || 0} savol)`, 'success');
    _blokSel = {};
    document.getElementById('blok-title').value = '';
    document.getElementById('blok-search').value = '';
    showPage('dashboard');
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '✅ Blok test yaratish';
  }
}

async function savePreset() {
  const name = document.getElementById('blok-title').value.trim();
  const timeLimit = parseInt(document.getElementById('blok-time').value);
  const shuffleQ = document.getElementById('blok-shuffle-q').value === 'true';
  const shuffleA = document.getElementById('blok-shuffle-a').value === 'true';

  if (!name) { toast('Preset nomini kiriting (yuqoridagi nom maydoni)!', 'error'); return; }
  if (!timeLimit || timeLimit < 5) { toast('Vaqt limiti kamida 5 soniya', 'error'); return; }

  const items = blokSelectedSources();
  if (!items.length) { toast('Kamida bitta fandan savol tanlang!', 'error'); return; }

  const btn = document.getElementById('btn-save-preset');
  btn.disabled = true;
  btn.textContent = 'Saqlanmoqda...';
  try {
    await req('POST', '/api/presets', { name, timeLimit, shuffleQ, shuffleA, items });
    toast(`💾 "${name}" preset saqlandi — botda /avtoblok orqali ishlatiladi`, 'success');
    loadPresets();
  } catch (e) {
    toast(e.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = '💾 Avto blok preset saqlash';
  }
}

let _presets = [];
async function loadPresets() {
  const el = document.getElementById('preset-list');
  if (!el) return;
  try {
    _presets = await req('GET', '/api/presets');
    if (!_presets.length) {
      el.innerHTML = `<p style="color:var(--text-muted);text-align:center;padding:16px">Hali preset yo'q</p>`;
      return;
    }
    el.innerHTML = _presets.map(p => {
      const items = p.items || [];
      const totalQ = items.reduce((s, it) => s + (it.count || 0), 0);
      const fanlar = items.map(it => `${esc(it.label)} (${it.count})`).join(', ');
      return `
        <div class="preset-row">
          <div class="preset-info">
            <div class="preset-name">🤖 ${esc(p.name)}</div>
            <div class="preset-meta">${totalQ} savol · ⏱ ${p.timeLimit}s · ${items.length} fan</div>
            <div class="preset-fanlar">${fanlar}</div>
          </div>
          <button class="btn-danger btn-sm" onclick="deletePreset(${p.id})" title="O'chirish">🗑️</button>
        </div>`;
    }).join('');
  } catch (e) { toast(e.message, 'error'); }
}

function deletePreset(id) {
  const p = _presets.find(x => x.id === id);
  const name = p ? p.name : 'Preset';
  confirm('🗑️', "Presetni o'chirish", `"${name}" presetini o'chirmoqchimisiz?`, async () => {
    try {
      await req('DELETE', `/api/presets/${id}`);
      toast('Preset o\'chirildi', 'success');
      loadPresets();
    } catch (e) { toast(e.message, 'error'); }
  });
}

// ── SEND TO GROUP ─────────────────────────────────────────────────────────────
let _sendQuizId = null;
function showSendToGroup(quizId, title) {
  _sendQuizId = quizId;
  document.getElementById('modal-icon').textContent = '📤';
  document.getElementById('modal-title').textContent = `Guruhga yuborish`;
  document.getElementById('modal-body').innerHTML = `
    <p style="margin-bottom:12px">"${esc(title)}" testini Telegram guruhga yuborish</p>
    <input type="text" id="group-chat-id" class="modal-input" placeholder="-100123456789 (guruh Chat ID)" style="width:100%;padding:10px;border:2px solid #e2e8f0;border-radius:8px;font-size:14px;margin-bottom:8px"/>
    <p style="font-size:12px;color:#64748b">💡 Chat ID ni bilish: guruhga @userinfobot ni qo'shing va /start yuboring</p>
  `;
  document.getElementById('modal-confirm').onclick = doSendToGroup;
  document.getElementById('modal').classList.remove('hidden');
  setTimeout(() => document.getElementById('group-chat-id')?.focus(), 100);
}

async function doSendToGroup() {
  const chatId = document.getElementById('group-chat-id')?.value?.trim();
  if (!chatId) { toast('Chat ID kiriting!', 'error'); return; }
  closeModal();
  try {
    await req('POST', '/api/bot/send-to-group', { chatId, quizId: _sendQuizId });
    toast('✅ Guruhga xabar yuborildi!', 'success');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ── UTILS ─────────────────────────────────────────────────────────────────────
function esc(str) {
  if (!str) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
