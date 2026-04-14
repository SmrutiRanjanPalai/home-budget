// ============================================
// HOME BUDGET TRACKER — App Logic
// Version: 1.0
// ============================================

'use strict';

/* ---- State ---- */
let isSubmitting = false;
let selectedUser = '';
const STORAGE_KEY_URL  = 'budget_api_url';
const STORAGE_KEY_USER = 'budget_last_user';

/* ---- DOM refs (cached after DOMContentLoaded) ---- */
let dom = {};

// ============================================
// INIT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  dom = {
    form:          document.getElementById('expenseForm'),
    dateInput:     document.getElementById('date'),
    categoryInput: document.getElementById('category'),
    amountInput:   document.getElementById('amount'),
    remarkInput:   document.getElementById('remark'),
    charCounter:   document.getElementById('charCounter'),
    submitBtn:     document.getElementById('submitBtn'),
    submitLabel:   document.getElementById('submitLabel'),
    apiInput:      document.getElementById('apiUrl'),
    settingsPanel: document.getElementById('settingsPanel'),
    settingsBtn:   document.getElementById('settingsBtn'),
    setupBanner:   document.getElementById('setupBanner'),
    amountPreview: document.getElementById('amountPreview'),
    previewUser:   document.getElementById('previewUser'),
    previewAmount: document.getElementById('previewAmount'),
    offlineBar:    document.getElementById('offlineBar'),
    toast:         document.getElementById('toast'),
    toastIcon:     document.getElementById('toastIcon'),
    toastTitle:    document.getElementById('toastTitle'),
    toastSub:      document.getElementById('toastSub'),
  };

  initDefaults();
  bindEvents();
  registerServiceWorker();
  checkOnlineStatus();
});

// ============================================
// INITIALISATION
// ============================================
function initDefaults() {
  // Default date = today
  dom.dateInput.value = getTodayISO();

  // Restore saved API URL
  const savedUrl = localStorage.getItem(STORAGE_KEY_URL) || '';
  dom.apiInput.value = savedUrl;

  // Show setup banner if no URL configured
  if (!savedUrl) {
    dom.setupBanner.classList.remove('hidden');
  }

  // Restore last selected user (nice UX touch)
  const lastUser = localStorage.getItem(STORAGE_KEY_USER);
  if (lastUser) selectUser(lastUser, false);
}

function bindEvents() {
  dom.form.addEventListener('submit', handleSubmit);
  dom.remarkInput.addEventListener('input', onRemarkInput);
  dom.amountInput.addEventListener('input', onAmountInput);
  dom.amountInput.addEventListener('keypress', filterAmountKey);

  // Online/offline events
  window.addEventListener('online',  () => updateOnlineBar(true));
  window.addEventListener('offline', () => updateOnlineBar(false));
}

// ============================================
// SERVICE WORKER
// ============================================
function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js')
      .then(() => console.log('[App] Service Worker registered'))
      .catch((e) => console.warn('[App] SW registration failed:', e));
  }
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
    showToast('error', '⚠️', 'URL Required', 'Please paste your Apps Script Web App URL');
    return;
  }
  if (!url.startsWith('https://script.google.com/')) {
    showToast('error', '⚠️', 'Invalid URL', 'URL must start with https://script.google.com/');
    return;
  }
  localStorage.setItem(STORAGE_KEY_URL, url);
  dom.setupBanner.classList.add('hidden');
  toggleSettings();
  showToast('success', '✅', 'Settings Saved', 'API URL saved successfully');
}

async function testConnection() {
  const url = dom.apiInput.value.trim();
  if (!url) {
    showToast('error', '⚠️', 'No URL', 'Enter a URL first');
    return;
  }
  const btn = document.getElementById('testBtn');
  btn.textContent = 'Testing…';
  btn.disabled = true;
  try {
    const res = await fetch(url, { method: 'GET' });
    const data = await res.json();
    if (data.status) {
      showToast('success', '✅', 'Connected!', 'API is reachable and running');
    } else {
      showToast('error', '⚠️', 'Unexpected Response', 'Got a response but format was unexpected');
    }
  } catch (e) {
    if (!navigator.onLine) {
      showToast('error', '📵', 'No Internet', 'Check your network connection');
    } else {
      showToast('error', '⚠️', 'Connection Failed', 'Could not reach the API URL');
    }
  } finally {
    btn.textContent = 'Test';
    btn.disabled = false;
  }
}

function openSetup() {
  dom.setupBanner.classList.add('hidden');
  toggleSettings();
}

// ============================================
// USER SELECTION
// ============================================
function selectUser(user, savePreference = true) {
  selectedUser = user;

  document.querySelectorAll('.user-btn').forEach(btn => {
    btn.classList.remove('smruti-active', 'sajhni-active', 'active');
  });

  const btn = document.querySelector(`[data-user="${user}"]`);
  if (btn) {
    if (user === 'Smruti') btn.classList.add('smruti-active', 'active');
    if (user === 'Sajhni') btn.classList.add('sajhni-active', 'active');
  }

  clearFieldError('userError');

  if (savePreference) localStorage.setItem(STORAGE_KEY_USER, user);

  updateAmountPreview();
}

// ============================================
// INPUT HANDLERS
// ============================================
function onRemarkInput() {
  const len = dom.remarkInput.value.length;
  dom.charCounter.textContent = `${len}/100`;
  dom.charCounter.className = 'char-counter' +
    (len >= 100 ? ' at-limit' : len >= 80 ? ' near-limit' : '');
  if (len > 100) {
    dom.remarkInput.value = dom.remarkInput.value.slice(0, 100);
    dom.charCounter.textContent = '100/100';
  }
}

function filterAmountKey(e) {
  // Allow digits, one dot, backspace, delete
  const allowed = /[0-9.]/;
  if (!allowed.test(e.key) && e.key.length === 1) e.preventDefault();
}

function onAmountInput() {
  let val = dom.amountInput.value;

  // Strip non-numeric except dot
  val = val.replace(/[^0-9.]/g, '');

  // Only one decimal point
  const parts = val.split('.');
  if (parts.length > 2) val = parts[0] + '.' + parts.slice(1).join('');

  // Max 2 decimal places
  if (parts[1] && parts[1].length > 2) {
    val = parts[0] + '.' + parts[1].slice(0, 2);
  }

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
// VALIDATION
// ============================================
function validate() {
  let valid = true;

  // Date
  if (!dom.dateInput.value) {
    showFieldError('dateError', 'Date is required');
    dom.dateInput.classList.add('is-invalid');
    valid = false;
  } else {
    clearFieldError('dateError');
    dom.dateInput.classList.remove('is-invalid');
  }

  // Category
  if (!dom.categoryInput.value) {
    showFieldError('categoryError', 'Please select a category');
    dom.categoryInput.classList.add('is-invalid');
    valid = false;
  } else {
    clearFieldError('categoryError');
    dom.categoryInput.classList.remove('is-invalid');
  }

  // User
  if (!selectedUser) {
    showFieldError('userError', 'Please select who is paying');
    valid = false;
  } else {
    clearFieldError('userError');
  }

  // Amount
  const amount = parseFloat(dom.amountInput.value);
  if (!dom.amountInput.value || isNaN(amount) || amount <= 0) {
    showFieldError('amountError', 'Enter a valid amount greater than 0');
    dom.amountInput.classList.add('is-invalid');
    valid = false;
  } else {
    clearFieldError('amountError');
    dom.amountInput.classList.remove('is-invalid');
  }

  return valid;
}

function showFieldError(id, msg) {
  const el = document.getElementById(id);
  if (el) {
    el.textContent = '⚠ ' + msg;
    el.classList.add('visible');
  }
}

function clearFieldError(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('visible');
}

// ============================================
// FORM SUBMISSION
// ============================================
async function handleSubmit(e) {
  e.preventDefault();

  if (isSubmitting) return;

  // API URL check
  const apiUrl = localStorage.getItem(STORAGE_KEY_URL);
  if (!apiUrl) {
    showToast('error', '⚙️', 'Setup Required', 'Tap Settings (⚙) and add your API URL first');
    toggleSettings();
    return;
  }

  // Validate
  if (!validate()) return;

  // Gather data
  const payload = {
    date:     formatDateForAPI(dom.dateInput.value),   // MM/DD/YYYY
    category: dom.categoryInput.value,
    remark:   dom.remarkInput.value.trim().slice(0, 100),
    user:     selectedUser,
    amount:   parseFloat(parseFloat(dom.amountInput.value).toFixed(2))
  };

  // Lock submission
  isSubmitting = true;
  setSubmitLoading(true);

  try {
    const result = await postExpense(apiUrl, payload);

    if (result.success) {
      showToast(
        'success',
        '✅',
        `Saved! ₹${payload.amount.toFixed(2)} for ${payload.user}`,
        `${payload.category}${payload.remark ? ' · ' + payload.remark : ''}`
      );
      resetForm();
    } else {
      throw new Error(result.message || 'Server returned an error');
    }

  } catch (err) {
    if (!navigator.onLine) {
      showToast('error', '📵', 'No Internet', 'Check your connection and try again');
    } else if (err.name === 'AbortError') {
      showToast('error', '⏱', 'Timed Out', 'Request took too long. Please retry.');
    } else {
      showToast('error', '⚠️', 'Save Failed', err.message || 'Unknown error. Check console.');
    }
  } finally {
    isSubmitting = false;
    setSubmitLoading(false);
  }
}

// ============================================
// API CALL
// ============================================
async function postExpense(apiUrl, payload) {
  const controller = new AbortController();
  const timeoutId  = setTimeout(() => controller.abort(), 15000); // 15s timeout

  try {
    const response = await fetch(apiUrl, {
      method:   'POST',
      redirect: 'follow',
      signal:   controller.signal,
      // text/plain bypasses CORS preflight — required for Google Apps Script
      headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
      body:     JSON.stringify(payload)
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const text = await response.text();

    // GAS may return HTML in edge cases — handle gracefully
    try {
      return JSON.parse(text);
    } catch {
      // If we got a 200 but non-JSON, treat as success (GAS redirect quirk)
      if (response.status === 200) return { success: true };
      throw new Error('Unexpected response from server');
    }

  } finally {
    clearTimeout(timeoutId);
  }
}

// ============================================
// FORM RESET
// ============================================
function resetForm() {
  dom.categoryInput.value = '';
  dom.amountInput.value   = '';
  dom.remarkInput.value   = '';
  dom.charCounter.textContent = '0/100';
  dom.charCounter.className   = 'char-counter';
  dom.amountPreview.classList.remove('visible');

  // Keep today's date
  dom.dateInput.value = getTodayISO();

  // Keep user selection (for fast consecutive entries)
  // Clear validation states
  dom.form.querySelectorAll('.is-invalid').forEach(el => el.classList.remove('is-invalid'));
  dom.form.querySelectorAll('.field-msg.visible').forEach(el => el.classList.remove('visible'));
}

// ============================================
// UI HELPERS
// ============================================
function setSubmitLoading(loading) {
  dom.submitBtn.disabled = loading;
  if (loading) {
    dom.submitLabel.innerHTML = '<span class="spinner"></span> Saving…';
  } else {
    dom.submitLabel.innerHTML = '<span>💾</span> Save Expense';
  }
}

let toastTimer = null;

function showToast(type, icon, title, sub) {
  clearTimeout(toastTimer);

  dom.toast.className = `toast toast-${type}`;
  dom.toastIcon.textContent  = icon;
  dom.toastTitle.textContent = title;
  dom.toastSub.textContent   = sub || '';

  // Force reflow for re-animation
  void dom.toast.offsetHeight;
  dom.toast.classList.add('show');

  const duration = type === 'error' ? 5500 : 4000;
  toastTimer = setTimeout(() => dom.toast.classList.remove('show'), duration);
}

function updateOnlineBar(online) {
  dom.offlineBar.classList.toggle('visible', !online);
}

function checkOnlineStatus() {
  updateOnlineBar(navigator.onLine);
}

// ============================================
// DATE UTILITIES
// ============================================
function getTodayISO() {
  const now = new Date();
  const y   = now.getFullYear();
  const m   = String(now.getMonth() + 1).padStart(2, '0');
  const d   = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateForAPI(isoDate) {
  // YYYY-MM-DD → MM/DD/YYYY (as per scope)
  const [y, m, d] = isoDate.split('-');
  return `${m}/${d}/${y}`;
}
