// ============================================
// HOME BUDGET TRACKER V2 — App Logic
// ============================================
'use strict';

// ============================================
// STATE
// ============================================
let isSubmitting      = false;
let selectedUser      = '';          // Add-form user
let editingUserSel    = '';          // Edit-modal user
let personalUserSel   = 'Smruti';   // Personal-modal user

let currentTab        = 'add';
let currentHistMode   = 'common';

let dashRange         = 'month';
let histRange         = 'month';

let allEntries        = [];   // raw fetched entries (history)
let filteredEntries   = [];   // after search/category filter

let editingId         = null;
let editingType       = null;

let dashCharts        = {};
let personalCatChart  = null;

let dashLoaded        = false;   // debounce re-fetch
let histLoaded        = false;

// Common categories
const COMMON_CATS = ['Utility','Groceries','Petrol','Outing','Food-Order','Trip','Other'];
// Personal categories (fixed per scope)
const PERSONAL_CATS = ['Food','E-commerce','Others'];

const CATEGORY_EMOJI = {
  Utility: '🔌', Groceries: '🛒', Petrol: '⛽', Outing: '🍽',
  'Food-Order': '🛵', Trip: '✈️', Other: '📌',
  Food: '🍔', 'E-commerce': '🛍', Others: '📌'
};

const STORAGE_KEY_URL  = 'budget_api_url';
const STORAGE_KEY_USER = 'budget_last_user';

let dom = {};

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  dom = {
    form:           document.getElementById('expenseForm'),
    dateInput:      document.getElementById('date'),
    categoryInput:  document.getElementById('category'),
    amountInput:    document.getElementById('amount'),
    remarkInput:    document.getElementById('remark'),
    charCounter:    document.getElementById('charCounter'),
    submitBtn:      document.getElementById('submitBtn'),
    submitLabel:    document.getElementById('submitLabel'),
    submitFooter:   document.getElementById('submitFooter'),
    apiInput:       document.getElementById('apiUrl'),
    settingsPanel:  document.getElementById('settingsPanel'),
    settingsBtn:    document.getElementById('settingsBtn'),
    setupBanner:    document.getElementById('setupBanner'),
    amountPreview:  document.getElementById('amountPreview'),
    previewUser:    document.getElementById('previewUser'),
    previewAmount:  document.getElementById('previewAmount'),
    offlineBar:     document.getElementById('offlineBar'),
    toast:          document.getElementById('toast'),
    toastIcon:      document.getElementById('toastIcon'),
    toastTitle:     document.getElementById('toastTitle'),
    toastSub:       document.getElementById('toastSub'),
    pageTitle:      document.getElementById('pageTitle'),
  };

  initDefault();
  bindEvents();
  registerServiceWorker();
  updateOnlineBar(navigator.onLine);
  initChartDefaults();
});

// ============================================
// INITIALISATION
// ============================================
function initDefault() {
  dom.dateInput.value = getTodayISO();

  const savedUrl = localStorage.getItem(STORAGE_KEY_URL) || '';
  dom.apiInput.value = savedUrl;
  if (!savedUrl) dom.setupBanner.classList.remove('hidden');

  const lastUser = localStorage.getItem(STORAGE_KEY_USER);
  if (lastUser) selectUser(lastUser, false);
}

function bindEvents() {
  dom.form.addEventListener('submit', handleSubmit);
  dom.remarkInput.addEventListener('input', onRemarkInput);
  dom.amountInput.addEventListener('input', onAmountInput);
  dom.amountInput.addEventListener('keypress', filterAmountKey);
  window.addEventListener('online',  () => updateOnlineBar(true));
  window.addEventListener('offline', () => updateOnlineBar(false));
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('[App] SW registered'))
      .catch(e  => console.warn('[App] SW failed:', e));
  }
}

function initChartDefaults() {
  if (typeof Chart === 'undefined') return;
  Chart.defaults.color       = '#94A3B8';
  Chart.defaults.borderColor = 'rgba(255,255,255,0.06)';
  Chart.defaults.font.family = "'Inter', sans-serif";
  Chart.defaults.font.size   = 12;
}

// ============================================
// TAB NAVIGATION
// ============================================
const PAGE_TITLES = { add: 'Add Expense', dashboard: 'Dashboard', history: 'History' };

function switchTab(tab) {
  if (currentTab === tab) return;
  currentTab = tab;

  // Show/hide pages
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  document.getElementById('page-' + tab).classList.remove('hidden');

  // Update bottom nav active state
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('nav-' + tab).classList.add('active');

  // Show submit footer only on Add tab
  dom.submitFooter.classList.toggle('hidden', tab !== 'add');

  // Update header title
  if (dom.pageTitle) dom.pageTitle.textContent = PAGE_TITLES[tab] || '';

  // Close settings panel if open
  dom.settingsPanel.classList.remove('open');
  dom.settingsBtn.classList.remove('active');

  // Lazy-load data
  if (tab === 'dashboard') loadDashboard();
  if (tab === 'history')   loadHistory();
}

// ============================================
// SETTINGS PANEL
// ============================================
function toggleSettings() {
  const isOpen = dom.settingsPanel.classList.toggle('open');
  dom.settingsBtn.classList.toggle('active', isOpen);
  if (isOpen) dom.apiInput.focus();
}

function saveSettings() {
  const url = dom.apiInput.value.trim();
  if (!url) {
    showToast('error', '⚠️', 'URL Required', 'Paste your Apps Script Web App URL');
    return;
  }
  if (!url.startsWith('https://script.google.com/')) {
    showToast('error', '⚠️', 'Invalid URL', 'Must start with https://script.google.com/');
    return;
  }
  localStorage.setItem(STORAGE_KEY_URL, url);
  dom.setupBanner.classList.add('hidden');
  dom.settingsPanel.classList.remove('open');
  dom.settingsBtn.classList.remove('active');
  showToast('success', '✅', 'Settings Saved', 'API URL saved. You can now add entries.');
  // Reset loaded flags so data re-fetches
  dashLoaded = false;
  histLoaded = false;
}

async function testConnection() {
  const url = dom.apiInput.value.trim();
  if (!url) { showToast('error', '⚠️', 'No URL', 'Enter a URL first'); return; }
  const btn = document.getElementById('testBtn');
  btn.textContent = 'Testing…'; btn.disabled = true;
  try {
    const res = await fetch(url, { method: 'GET' });
    const data = await res.json();
    if (data.status) {
      showToast('success', '✅', 'Connected!', `API v${data.version || '?'} is running`);
    } else {
      showToast('error', '⚠️', 'Unexpected', 'Response format unexpected');
    }
  } catch {
    showToast('error', navigator.onLine ? '⚠️' : '📵', navigator.onLine ? 'Connection Failed' : 'No Internet', 'Could not reach the API');
  } finally {
    btn.textContent = '🔗 Test'; btn.disabled = false;
  }
}

function openSetup() {
  dom.setupBanner.classList.add('hidden');
  toggleSettings();
}

// ============================================
// ADD FORM — USER SELECTION
// ============================================
function selectUser(user, save = true) {
  selectedUser = user;
  document.querySelectorAll('#page-add .user-btn').forEach(b => b.classList.remove('smruti-active','sajhni-active','active'));
  const btn = document.querySelector(`#page-add [data-user="${user}"]`);
  if (btn) btn.classList.add(user === 'Smruti' ? 'smruti-active' : 'sajhni-active', 'active');
  clearFieldError('userError');
  if (save) localStorage.setItem(STORAGE_KEY_USER, user);
  updateAmountPreview();
}

// ============================================
// ADD FORM — INPUTS
// ============================================
function onRemarkInput() {
  const len = dom.remarkInput.value.length;
  dom.charCounter.textContent = `${len}/100`;
  dom.charCounter.className = 'char-counter' + (len >= 100 ? ' at-limit' : len >= 80 ? ' near-limit' : '');
}

function filterAmountKey(e) {
  if (/[0-9.]/.test(e.key) || e.key.length > 1) return;
  e.preventDefault();
}

function onAmountInput() {
  let val = dom.amountInput.value.replace(/[^0-9.]/g, '');
  const parts = val.split('.');
  if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');
  if (parts[1] && parts[1].length > 2) val = parts[0] + '.' + parts[1].slice(0, 2);
  dom.amountInput.value = val;
  clearFieldError('amountError');
  updateAmountPreview();
}

function updateAmountPreview() {
  const amount = parseFloat(dom.amountInput.value);
  if (amount > 0 && selectedUser) {
    dom.previewUser.textContent = selectedUser;
    dom.previewAmount.textContent = '₹' + amount.toFixed(2);
    dom.amountPreview.classList.add('visible');
  } else {
    dom.amountPreview.classList.remove('visible');
  }
}

// ============================================
// ADD FORM — VALIDATION
// ============================================
function validate() {
  let ok = true;
  const set = (id, el, msg) => { if (!msg) { clearFieldError(id); el && el.classList.remove('is-invalid'); } else { showFieldError(id, msg); el && el.classList.add('is-invalid'); ok = false; } };

  set('dateError',     dom.dateInput,     !dom.dateInput.value ? 'Date is required' : null);
  set('categoryError', dom.categoryInput, !dom.categoryInput.value ? 'Please select a category' : null);
  set('userError',     null,              !selectedUser ? 'Please select who paid' : null);
  const amt = parseFloat(dom.amountInput.value);
  set('amountError', dom.amountInput, (!dom.amountInput.value || isNaN(amt) || amt <= 0) ? 'Enter a valid amount > 0' : null);
  return ok;
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) { el.textContent = '⚠ ' + msg; el.classList.add('visible'); }
}
function clearFieldError(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('visible');
}

// ============================================
// ADD FORM — SUBMIT
// ============================================
async function handleSubmit(e) {
  e.preventDefault();
  if (isSubmitting) return;

  const apiUrl = localStorage.getItem(STORAGE_KEY_URL);
  if (!apiUrl) {
    showToast('error', '⚙️', 'Setup Required', 'Tap ⚙ and add your Google Apps Script URL');
    toggleSettings();
    return;
  }
  if (!validate()) return;

  const payload = {
    date:     formatDateForAPI(dom.dateInput.value),
    category: dom.categoryInput.value,
    remark:   dom.remarkInput.value.trim().slice(0, 100),
    user:     selectedUser,
    amount:   parseFloat(parseFloat(dom.amountInput.value).toFixed(2))
  };

  isSubmitting = true;
  setSubmitLoading(true);
  try {
    const result = await api.addEntry(payload);
    if (!result.success) throw new Error(result.message);
    showToast('success', '✅', `Saved! ₹${payload.amount.toFixed(2)} for ${payload.user}`, `${payload.category}${payload.remark ? ' · ' + payload.remark : ''}`);
    resetForm();
    // Invalidate dashboard/history cache
    dashLoaded = false;
    histLoaded = false;
  } catch (err) {
    handleApiError(err);
  } finally {
    isSubmitting = false;
    setSubmitLoading(false);
  }
}

function resetForm() {
  dom.categoryInput.value = '';
  dom.amountInput.value   = '';
  dom.remarkInput.value   = '';
  dom.charCounter.textContent = '0/100';
  dom.charCounter.className   = 'char-counter';
  dom.amountPreview.classList.remove('visible');
  dom.dateInput.value = getTodayISO();
  dom.form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
  dom.form.querySelectorAll('.field-msg.visible').forEach(el => el.classList.remove('visible'));
}

function setSubmitLoading(on) {
  dom.submitBtn.disabled = on;
  dom.submitLabel.innerHTML = on
    ? '<span class="spinner"></span> Saving…'
    : '<span>💾</span> Save Expense';
}

// ============================================
// DASHBOARD — DATE RANGE
// ============================================
function setDashRange(range) {
  dashRange = range;
  document.querySelectorAll('#page-dashboard .filter-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.range === range);
  });
  document.getElementById('dashCustomRow').classList.toggle('hidden', range !== 'custom');
  if (range !== 'custom') { dashLoaded = false; loadDashboard(); }
}

function applyDashCustom() {
  const from = document.getElementById('dashFrom').value;
  const to   = document.getElementById('dashTo').value;
  if (!from || !to) { showToast('error', '⚠️', 'Invalid Range', 'Pick both From and To dates'); return; }
  if (from > to)    { showToast('error', '⚠️', 'Invalid Range', 'From date must be before To date'); return; }
  dashLoaded = false;
  loadDashboard();
}

// ============================================
// DASHBOARD — LOAD & RENDER
// ============================================
async function loadDashboard() {
  if (dashLoaded) return;
  if (!localStorage.getItem(STORAGE_KEY_URL)) {
    document.getElementById('dashNoApi').classList.remove('hidden');
    document.getElementById('dashContent').style.display = 'none';
    return;
  }
  document.getElementById('dashNoApi').classList.add('hidden');
  document.getElementById('dashContent').style.display = '';
  showDashLoading(true);

  try {
    const { from, to } = computeDateRange(dashRange, 'dashFrom', 'dashTo');
    const result = await api.getEntries('common', from, to);
    if (!result.success) throw new Error(result.message);
    renderSummaryCards(result.entries || []);
    renderDashCharts(result.entries || []);
    dashLoaded = true;
  } catch (err) {
    handleApiError(err);
  } finally {
    showDashLoading(false);
  }
}

function showDashLoading(on) {
  document.getElementById('dashLoading').classList.toggle('hidden', !on);
  document.getElementById('dashContent').style.visibility = on ? 'hidden' : 'visible';
}

function renderSummaryCards(entries) {
  let total = 0, smruti = 0, sajhni = 0;
  entries.forEach(e => {
    const s = parseFloat(e.smrutiAmount) || 0;
    const j = parseFloat(e.sajhniAmount) || 0;
    smruti += s; sajhni += j; total += s + j;
  });
  document.getElementById('totalSpend').textContent  = formatCurrency(total);
  document.getElementById('smrutiTotal').textContent = formatCurrency(smruti);
  document.getElementById('sajhniTotal').textContent = formatCurrency(sajhni);
  document.getElementById('txnCount').textContent    = entries.length;
}

function renderDashCharts(entries) {
  // Destroy old
  if (dashCharts.cat)   { dashCharts.cat.destroy();   dashCharts.cat   = null; }
  if (dashCharts.trend) { dashCharts.trend.destroy();  dashCharts.trend = null; }

  // Category doughnut
  const catMap = {};
  entries.forEach(e => {
    const cat   = e.category || 'Other';
    const total = (parseFloat(e.smrutiAmount) || 0) + (parseFloat(e.sajhniAmount) || 0);
    catMap[cat] = (catMap[cat] || 0) + total;
  });
  const catLabels = Object.keys(catMap);
  const catValues = catLabels.map(k => catMap[k]);
  const catEmpty  = catLabels.length === 0;

  document.getElementById('catChartEmpty').classList.toggle('hidden', !catEmpty);
  document.querySelector('#categoryChartCard .chart-wrap').style.display = catEmpty ? 'none' : '';

  if (!catEmpty) {
    dashCharts.cat = new Chart(document.getElementById('categoryChart'), {
      type: 'doughnut',
      data: {
        labels: catLabels,
        datasets: [{
          data: catValues,
          backgroundColor: ['#10B981','#818CF8','#F472B6','#FBBF24','#60A5FA','#34D399','#94A3B8','#F87171'],
          borderWidth: 2,
          borderColor: '#0A0F1E'
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: true, cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { padding: 12, boxWidth: 12, color: '#94A3B8' } },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.label}: ₹${ctx.parsed.toFixed(2)}`
            }
          }
        }
      }
    });
  }

  // Spending trend (line chart — per day total)
  const dateMap = {};
  entries.forEach(e => {
    if (!e.date) return;
    const d = e.date;
    dateMap[d] = (dateMap[d] || 0) + (parseFloat(e.smrutiAmount)||0) + (parseFloat(e.sajhniAmount)||0);
  });
  const sortedDates  = Object.keys(dateMap).sort((a,b) => parseApiDate(a) - parseApiDate(b));
  const trendEmpty   = sortedDates.length === 0;

  document.getElementById('trendChartEmpty').classList.toggle('hidden', !trendEmpty);
  document.querySelector('#trendChartCard .chart-wrap').style.display = trendEmpty ? 'none' : '';

  if (!trendEmpty) {
    dashCharts.trend = new Chart(document.getElementById('trendChart'), {
      type: 'line',
      data: {
        labels: sortedDates.map(d => d), // MM/DD/YYYY labels
        datasets: [{
          label: 'Spend',
          data: sortedDates.map(d => dateMap[d]),
          borderColor: '#10B981',
          backgroundColor: (ctx) => {
            const gradient = ctx.chart.ctx.createLinearGradient(0, 0, 0, 200);
            gradient.addColorStop(0, 'rgba(16,185,129,0.3)');
            gradient.addColorStop(1, 'rgba(16,185,129,0.0)');
            return gradient;
          },
          fill: true, tension: 0.45,
          pointBackgroundColor: '#10B981', pointRadius: 4, pointHoverRadius: 6, borderWidth: 2.5
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: true,
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ₹${ctx.parsed.y.toFixed(2)}` } }
        },
        scales: {
          x: { ticks: { color: '#64748B', maxTicksLimit: 6, maxRotation: 0 }, grid: { display: false } },
          y: { ticks: { color: '#64748B', callback: v => '₹' + v }, grid: { color: 'rgba(255,255,255,0.05)' } }
        }
      }
    });
  }
}

// ============================================
// HISTORY — MODE & RANGE
// ============================================
function setHistoryMode(mode) {
  if (currentHistMode === mode) return;
  currentHistMode = mode;
  document.getElementById('modeCommonBtn').classList.toggle('active', mode === 'common');
  document.getElementById('modePersonalBtn').classList.toggle('active', mode === 'personal');
  document.getElementById('personalDash').classList.toggle('hidden', mode !== 'personal');
  histLoaded = false;
  loadHistory();
}

function setHistoryRange(range) {
  histRange = range;
  document.querySelectorAll('#page-history .filter-bar .filter-pill').forEach(p => {
    p.classList.toggle('active', p.dataset.range === range);
  });
  document.getElementById('histCustomRow').classList.toggle('hidden', range !== 'custom');
  if (range !== 'custom') { histLoaded = false; loadHistory(); }
}

function applyHistCustom() {
  const from = document.getElementById('histFrom').value;
  const to   = document.getElementById('histTo').value;
  if (!from || !to) { showToast('error', '⚠️', 'Invalid Range', 'Pick both From and To dates'); return; }
  if (from > to)    { showToast('error', '⚠️', 'Invalid Range', 'From date must be before To date'); return; }
  histLoaded = false;
  loadHistory();
}

// ============================================
// HISTORY — LOAD & RENDER
// ============================================
async function loadHistory() {
  if (histLoaded) return;
  if (!localStorage.getItem(STORAGE_KEY_URL)) {
    showHistEmpty('Setup Required', 'Open ⚙ Settings and add your API URL first');
    return;
  }
  showHistLoading(true);
  try {
    const { from, to } = computeDateRange(histRange, 'histFrom', 'histTo');
    const result = await api.getEntries(currentHistMode, from, to);
    if (!result.success) throw new Error(result.message);
    allEntries      = result.entries || [];
    filteredEntries = [...allEntries];

    if (currentHistMode === 'personal') renderPersonalSummary(allEntries);

    populateCategoryFilter();
    renderHistoryList();
    histLoaded = true;
  } catch (err) {
    showHistLoading(false);
    handleApiError(err);
  }
}

function showHistLoading(on) {
  document.getElementById('histLoading').classList.toggle('hidden', !on);
  document.getElementById('entryList').style.display  = on ? 'none' : '';
  document.getElementById('histEmpty').classList.add('hidden');
}

function showHistEmpty(title, sub) {
  showHistLoading(false);
  document.getElementById('histEmpty').classList.remove('hidden');
  document.getElementById('histEmptySub').textContent = sub || '';
}

function populateCategoryFilter() {
  const sel = document.getElementById('catFilter');
  const cats = [...new Set(allEntries.map(e => e.category).filter(Boolean))].sort();
  sel.innerHTML = '<option value="">All categories</option>' +
    cats.map(c => `<option value="${c}">${c}</option>`).join('');
}

function filterList() {
  const search = (document.getElementById('searchInput').value || '').toLowerCase();
  const cat    = (document.getElementById('catFilter').value || '');
  filteredEntries = allEntries.filter(e => {
    const matchSearch = !search || (e.remark||'').toLowerCase().includes(search) || (e.category||'').toLowerCase().includes(search);
    const matchCat    = !cat    || e.category === cat;
    return matchSearch && matchCat;
  });
  renderHistoryList();
}

function renderHistoryList() {
  showHistLoading(false);
  const list = document.getElementById('entryList');

  if (filteredEntries.length === 0) {
    list.innerHTML = '';
    document.getElementById('histEmpty').classList.remove('hidden');
    document.getElementById('histEmptySub').textContent = allEntries.length > 0
      ? 'No entries match your search or filter'
      : 'No entries found for this period';
    return;
  }
  document.getElementById('histEmpty').classList.add('hidden');

  list.innerHTML = filteredEntries.map((entry, idx) => {
    const isPersonal = currentHistMode === 'personal';
    const hasId      = !!entry.id;
    const emoji      = CATEGORY_EMOJI[entry.category] || '📌';

    let amount, userLabel;
    if (isPersonal) {
      amount    = parseFloat(entry.amount) || 0;
      userLabel = entry.user || '';
    } else {
      amount    = parseFloat(entry.total) || (parseFloat(entry.smrutiAmount)||0) + (parseFloat(entry.sajhniAmount)||0);
      const hasSmruti = parseFloat(entry.smrutiAmount) > 0;
      userLabel = hasSmruti ? 'Smruti' : 'Sajhni';
    }

    const userClass = userLabel === 'Smruti' ? 'u-smruti' : 'u-sajhni';
    const meta      = [entry.date, entry.remark].filter(Boolean).join(' · ');
    const clickable = hasId ? `onclick="openEditModal('${entry.id}','${currentHistMode}')"` : '';

    return `
      <div class="entry-item${hasId ? '' : ' no-edit'}" ${clickable} role="listitem" style="animation-delay:${idx * 0.04}s">
        <div class="entry-cat-icon">${emoji}</div>
        <div class="entry-info">
          <div class="entry-category">${escapeHtml(entry.category)}</div>
          <div class="entry-meta">${escapeHtml(meta)}</div>
        </div>
        <div class="entry-right">
          <div class="entry-total">₹${amount.toFixed(2)}</div>
          <div class="entry-user ${userClass}">${escapeHtml(userLabel)}</div>
        </div>
        ${hasId ? '<div class="entry-chevron">›</div>' : ''}
      </div>`;
  }).join('');
}

// ============================================
// PERSONAL — MINI DASHBOARD
// ============================================
function renderPersonalSummary(entries) {
  let smrutil = 0, sajhnil = 0;
  entries.forEach(e => {
    const amt = parseFloat(e.amount) || 0;
    if (e.user === 'Smruti') smrutil += amt;
    else if (e.user === 'Sajhni') sajhnil += amt;
  });
  document.getElementById('perSmrutiTotal').textContent = formatCurrency(smrutil);
  document.getElementById('perSajhniTotal').textContent = formatCurrency(sajhnil);

  // Category chart for personal
  if (personalCatChart) { personalCatChart.destroy(); personalCatChart = null; }
  const catMap = {};
  entries.forEach(e => { catMap[e.category] = (catMap[e.category] || 0) + (parseFloat(e.amount) || 0); });
  const catLabels = Object.keys(catMap);
  const isEmpty   = catLabels.length === 0;

  document.getElementById('perCatEmpty').classList.toggle('hidden', !isEmpty);
  if (!isEmpty) {
    personalCatChart = new Chart(document.getElementById('personalCatChart'), {
      type: 'doughnut',
      data: {
        labels: catLabels,
        datasets: [{ data: catLabels.map(k => catMap[k]), backgroundColor: ['#818CF8','#F472B6','#60A5FA'], borderWidth: 2, borderColor: '#0A0F1E' }]
      },
      options: {
        responsive: true, maintainAspectRatio: true, cutout: '65%',
        plugins: {
          legend: { position: 'bottom', labels: { padding: 10, boxWidth: 12 } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ₹${ctx.parsed.toFixed(2)}` } }
        }
      }
    });
  }
}

// ============================================
// PERSONAL — MODAL
// ============================================
function openPersonalModal() {
  document.getElementById('personalAddModal').classList.remove('hidden');
  document.getElementById('perDate').value     = getTodayISO();
  document.getElementById('perCategory').value = '';
  document.getElementById('perAmount').value   = '';
  document.getElementById('perRemark').value   = '';
  selectPersonalUser('Smruti');
  clearFieldError('perUserError');
  clearFieldError('perCatError');
  clearFieldError('perAmtError');
}

function closePersonalModal() {
  document.getElementById('personalAddModal').classList.add('hidden');
}

function selectPersonalUser(user) {
  personalUserSel = user;
  document.querySelectorAll('[data-personal-user]').forEach(b => b.classList.remove('smruti-active','sajhni-active','active'));
  const btn = document.querySelector(`[data-personal-user="${user}"]`);
  if (btn) btn.classList.add(user === 'Smruti' ? 'smruti-active' : 'sajhni-active', 'active');
  clearFieldError('perUserError');
}

async function submitPersonal() {
  if (isSubmitting) return;

  const date     = document.getElementById('perDate').value;
  const category = document.getElementById('perCategory').value;
  const amtVal   = document.getElementById('perAmount').value;
  const remark   = document.getElementById('perRemark').value.trim();
  const amount   = parseFloat(amtVal);

  let ok = true;
  if (!personalUserSel) { showFieldError('perUserError', 'Please select who paid'); ok = false; }
  if (!category)        { showFieldError('perCatError',  'Please select a category'); ok = false; }
  if (!amtVal || isNaN(amount) || amount <= 0) { showFieldError('perAmtError', 'Enter a valid amount > 0'); ok = false; }
  if (!ok) return;

  if (!navigator.onLine) { showToast('error', '📵', 'Offline', 'Cannot save while offline'); return; }

  const btn = document.getElementById('submitPersonalBtn');
  btn.disabled = true; btn.textContent = 'Saving…'; isSubmitting = true;
  try {
    const result = await api.addPersonal({
      date: formatDateForAPI(date), category,
      amount: parseFloat(amount.toFixed(2)),
      remark: remark.slice(0, 100), user: personalUserSel
    });
    if (!result.success) throw new Error(result.message);
    showToast('success', '✅', `Personal expense saved for ${personalUserSel}!`, `${category}${remark ? ' · ' + remark : ''}`);
    closePersonalModal();
    histLoaded = false;
    if (currentHistMode === 'personal') loadHistory();
  } catch (err) {
    handleApiError(err);
  } finally {
    isSubmitting = false;
    btn.disabled = false; btn.innerHTML = '💾 Save Personal Expense';
  }
}

// ============================================
// EDIT MODAL
// ============================================
function openEditModal(id, type) {
  const entry = allEntries.find(e => e.id === id);
  if (!entry) return;

  editingId   = id;
  editingType = type;

  document.getElementById('editId').value   = id;
  document.getElementById('editType').value = type;
  document.getElementById('editDate').value = apiDateToISO(entry.date);
  document.getElementById('editRemark').value = entry.remark || '';

  // Populate correct category dropdown
  populateEditCategories(type === 'personal' ? PERSONAL_CATS : COMMON_CATS, entry.category);

  // Amount + user
  let amt, user;
  if (type === 'personal') {
    amt = parseFloat(entry.amount) || 0;
    user = entry.user || 'Smruti';
  } else {
    amt  = parseFloat(entry.total) || 0;
    const hasSmruti = parseFloat(entry.smrutiAmount) > 0;
    user = hasSmruti ? 'Smruti' : 'Sajhni';
  }
  document.getElementById('editAmount').value = amt > 0 ? amt : '';
  selectEditUser(user);

  document.getElementById('editModal').classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('editModal').classList.add('hidden');
  editingId = null; editingType = null;
}

function populateEditCategories(cats, selected) {
  const sel = document.getElementById('editCategory');
  sel.innerHTML = '<option value="" disabled>Select category…</option>' +
    cats.map(c => `<option value="${c}"${c === selected ? ' selected' : ''}>${c}</option>`).join('');
}

function selectEditUser(user) {
  editingUserSel = user;
  document.querySelectorAll('[data-edit-user]').forEach(b => b.classList.remove('smruti-active','sajhni-active','active'));
  const btn = document.querySelector(`[data-edit-user="${user}"]`);
  if (btn) btn.classList.add(user === 'Smruti' ? 'smruti-active' : 'sajhni-active', 'active');
}

async function saveEdit() {
  if (isSubmitting || !editingId) return;
  if (!navigator.onLine) { showToast('error', '📵', 'Offline', 'Cannot edit while offline'); return; }

  const date     = document.getElementById('editDate').value;
  const category = document.getElementById('editCategory').value;
  const amtVal   = document.getElementById('editAmount').value;
  const remark   = document.getElementById('editRemark').value.trim();
  const amount   = parseFloat(amtVal);

  if (!date || !category || !editingUserSel || !amtVal || isNaN(amount) || amount <= 0) {
    showToast('error', '⚠️', 'Validation Error', 'Please fill all required fields');
    return;
  }

  const btn = document.getElementById('editSaveBtn');
  btn.disabled = true; btn.textContent = 'Saving…'; isSubmitting = true;
  try {
    const result = await api.updateEntry(editingId, {
      date:     formatDateForAPI(date),
      category,
      amount:   parseFloat(amount.toFixed(2)),
      remark:   remark.slice(0, 100),
      user:     editingUserSel
    }, editingType);
    if (!result.success) throw new Error(result.message);
    showToast('success', '✅', 'Updated!', 'Entry updated in Google Sheets');
    closeEditModal();
    histLoaded = false;
    dashLoaded = false;
    loadHistory();
  } catch (err) {
    handleApiError(err);
  } finally {
    isSubmitting = false;
    btn.disabled = false; btn.innerHTML = '💾 Save Changes';
  }
}

// ============================================
// DELETE
// ============================================
function openDeleteConfirm() {
  document.getElementById('deleteModal').classList.remove('hidden');
}

function closeDeleteModal() {
  document.getElementById('deleteModal').classList.add('hidden');
}

async function confirmDelete() {
  if (!editingId) return;
  if (!navigator.onLine) { showToast('error', '📵', 'Offline', 'Cannot delete while offline'); closeDeleteModal(); return; }

  const btn = document.getElementById('confirmDeleteBtn');
  btn.disabled = true; btn.textContent = 'Deleting…';
  try {
    const result = await api.deleteEntry(editingId, editingType);
    if (!result.success) throw new Error(result.message);
    showToast('success', '🗑', 'Deleted', 'Entry removed from Google Sheets');
    closeDeleteModal();
    closeEditModal();
    histLoaded = false;
    dashLoaded = false;
    loadHistory();
  } catch (err) {
    handleApiError(err);
  } finally {
    btn.disabled = false; btn.textContent = 'Delete';
  }
}

// ============================================
// MODAL — OVERLAY CLICK TO CLOSE
// ============================================
function handleOverlayClick(e, modalId) {
  if (e.target.id === modalId) {
    if (modalId === 'editModal')        closeEditModal();
    if (modalId === 'deleteModal')      closeDeleteModal();
    if (modalId === 'personalAddModal') closePersonalModal();
  }
}

// ============================================
// TOAST & ERROR
// ============================================
let toastTimer = null;
function showToast(type, icon, title, sub) {
  clearTimeout(toastTimer);
  dom.toast.className = `toast toast-${type}`;
  dom.toastIcon.textContent  = icon;
  dom.toastTitle.textContent = title;
  dom.toastSub.textContent   = sub || '';
  void dom.toast.offsetHeight; // re-trigger animation
  dom.toast.classList.add('show');
  toastTimer = setTimeout(() => dom.toast.classList.remove('show'), type === 'error' ? 5500 : 4000);
}

function handleApiError(err) {
  if (!navigator.onLine || err.code === 'OFFLINE') {
    showToast('error', '📵', 'No Internet', 'Check your connection and try again');
  } else if (err.name === 'AbortError') {
    showToast('error', '⏱', 'Timed Out', 'Request took too long. Please retry.');
  } else if (err.code === 'API_NOT_CONFIGURED') {
    showToast('error', '⚙️', 'Setup Required', 'Tap ⚙ Settings and add your API URL');
  } else {
    showToast('error', '⚠️', 'Error', err.message || 'Something went wrong');
  }
}

function updateOnlineBar(online) {
  dom.offlineBar && dom.offlineBar.classList.toggle('visible', !online);
}

// ============================================
// UTILITY FUNCTIONS
// ============================================
function getTodayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${pad(n.getMonth()+1)}-${pad(n.getDate())}`;
}

function pad(n) { return String(n).padStart(2,'0'); }

function formatDateForAPI(iso) {
  const [y, m, d] = iso.split('-');
  return `${m}/${d}/${y}`;
}

function apiDateToISO(apiDate) {
  if (!apiDate) return getTodayISO();
  const parts = apiDate.toString().split('/');
  if (parts.length !== 3) return getTodayISO();
  return `${parts[2]}-${pad(parts[0])}-${pad(parts[1])}`;
}

function parseApiDate(dateStr) {
  if (!dateStr) return 0;
  const p = dateStr.split('/');
  if (p.length !== 3) return 0;
  return new Date(parseInt(p[2]), parseInt(p[0])-1, parseInt(p[1])).getTime();
}

function isoToDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m-1, d);
}

function dateToISO(date) {
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}

function computeDateRange(range, fromId, toId) {
  if (range === 'all') return { from: '', to: '' };
  if (range === 'custom') {
    const f = document.getElementById(fromId)?.value || '';
    const t = document.getElementById(toId)?.value   || '';
    if (f && t) return { from: formatDateForAPI(f), to: formatDateForAPI(t) };
  }
  const today = new Date();
  let from;
  if (range === '7days') {
    from = new Date(today.getTime() - 6 * 86400000);
  } else {
    from = new Date(today.getFullYear(), today.getMonth(), 1); // first of month
  }
  return { from: formatDateForAPI(dateToISO(from)), to: formatDateForAPI(dateToISO(today)) };
}

function formatCurrency(n) {
  return '₹' + (parseFloat(n) || 0).toFixed(2);
}

function escapeHtml(str) {
  return (str || '').toString()
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}
