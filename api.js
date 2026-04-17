// ============================================
// HOME BUDGET TRACKER V2 — API Module
// All fetch calls centralised here.
// ============================================
'use strict';

const api = (() => {
  const STORAGE_KEY_URL = 'budget_api_url';

  // ---- Helpers ----
  function getApiUrl() {
    return localStorage.getItem(STORAGE_KEY_URL) || '';
  }

  function generateId() {
    // e.g. "lf2k4x-a3r7z"  — timestamp36 + random5
    return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 7);
  }

  // ---- Core fetch ----
  async function call(payload) {
    const url = getApiUrl();
    if (!url) {
      const err = new Error('API not configured. Open Settings and add your Google Apps Script URL.');
      err.code = 'API_NOT_CONFIGURED';
      throw err;
    }
    if (!navigator.onLine) {
      const err = new Error('No internet connection.');
      err.code = 'OFFLINE';
      throw err;
    }

    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), 15000); // 15 s

    try {
      const response = await fetch(url, {
        method:   'POST',
        redirect: 'follow',
        signal:   controller.signal,
        // text/plain avoids CORS preflight — required for Google Apps Script
        headers:  { 'Content-Type': 'text/plain;charset=utf-8' },
        body:     JSON.stringify(payload)
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const text = await response.text();

      try {
        const json = JSON.parse(text);
        // GAS returned a structured error
        if (json.success === false) {
          throw new Error(json.message || 'Server returned an error');
        }
        return json;
      } catch (parseErr) {
        // GAS redirect quirk: got HTTP 200 but non-JSON body → treat as success
        if (response.status === 200) return { success: true };
        throw parseErr;
      }

    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ---- Public API ----
  return {
    generateId,

    /** Add a shared/common expense entry */
    addEntry(payload) {
      return call({ action: 'addEntry', id: generateId(), ...payload });
    },

    /** Add a personal expense entry */
    addPersonal(payload) {
      return call({ action: 'addPersonal', id: generateId(), ...payload });
    },

    /**
     * Fetch entries with optional date-range filter.
     * @param {'common'|'personal'} type
     * @param {string} dateFrom  MM/DD/YYYY or ''
     * @param {string} dateTo    MM/DD/YYYY or ''
     */
    getEntries(type, dateFrom, dateTo) {
      return call({
        action:   'getEntries',
        type:     type || 'common',
        dateFrom: dateFrom || '',
        dateTo:   dateTo   || ''
      });
    },

    /**
     * Update an existing entry by ID.
     * @param {string} id
     * @param {object} payload  { date, category, amount, remark, user }
     * @param {'common'|'personal'} type
     */
    updateEntry(id, payload, type) {
      return call({ action: 'updateEntry', id, type, ...payload });
    },

    /**
     * Hard-delete an entry by ID.
     * @param {string} id
     * @param {'common'|'personal'} type
     */
    deleteEntry(id, type) {
      return call({ action: 'deleteEntry', id, type });
    }
  };
})();
