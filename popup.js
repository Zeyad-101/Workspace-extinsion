'use strict';

/* ============================================================
   Workspace Launcher — popup logic
   Storage: chrome.storage.local, single key "workspaces"
   Schema: { id, name, createdAt, updatedAt, tabs: [{ url, title }] }
   ============================================================ */

const STORAGE_KEY = 'workspaces';

// URL prefixes that chrome.tabs.create cannot restore.
const BLOCKED_PREFIXES = [
  'chrome://',
  'chrome-extension://',
  'chrome-search://',
  'chrome-untrusted://',
  'edge://',
  'about:',
  'devtools://',
  'view-source:',
];

// --- DOM refs ---
const $list       = document.getElementById('list');
const $empty      = document.getElementById('empty');
const $error      = document.getElementById('error');
const $saveBtn    = document.getElementById('saveBtn');
const $countLabel = document.getElementById('countLabel');
const $confirm    = document.getElementById('confirmDialog');
const $confirmBody = document.getElementById('confirmBody');

// Save modal refs
const $saveModal      = document.getElementById('saveModal');
const $saveForm       = document.getElementById('saveForm');
const $saveName       = document.getElementById('saveName');
const $excludeToggle  = document.getElementById('excludeToggle');
const $excludeSection = document.getElementById('excludeSection');
const $tabList        = document.getElementById('tabList');
const $saveValidation = document.getElementById('saveValidation');
const $saveOk         = document.getElementById('saveOk');
const $cancelBtn      = document.getElementById('cancelBtn');

// --- Utilities ---
function isRestorable(url) {
  if (!url || typeof url !== 'string') return false;
  return !BLOCKED_PREFIXES.some((p) => url.startsWith(p));
}

function uid() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'ws_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function tabCountLabel(n) {
  return n === 1 ? 'tab' : 'tabs';
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- Storage helpers ---
async function getWorkspaces() {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY);
    const list = result[STORAGE_KEY];
    return Array.isArray(list) ? list : [];
  } catch (err) {
    showError('Could not read saved workspaces. ' + (err && err.message ? err.message : ''));
    return [];
  }
}

async function setWorkspaces(workspaces) {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: workspaces });
    return true;
  } catch (err) {
    showError('Could not save. ' + (err && err.message ? err.message : ''));
    return false;
  }
}

// --- Error/notice UI ---
let errorTimer = null;
function showError(message) {
  $error.textContent = message;
  $error.hidden = false;
  if (errorTimer) clearTimeout(errorTimer);
  errorTimer = setTimeout(() => { $error.hidden = true; }, 5000);
}
function clearError() {
  $error.hidden = true;
  if (errorTimer) { clearTimeout(errorTimer); errorTimer = null; }
}

// --- Rendering ---
function render(workspaces) {
  $list.innerHTML = '';
  clearError();

  if (workspaces.length === 0) {
    $list.hidden = true;
    $empty.hidden = false;
    $countLabel.textContent = '';
    return;
  }
  $list.hidden = false;
  $empty.hidden = true;

  // Pinned first (newest first within each group)
  const sorted = workspaces.slice().sort((a, b) => {
    const ap = a.pinned ? 1 : 0;
    const bp = b.pinned ? 1 : 0;
    if (ap !== bp) return bp - ap;
    return (b.updatedAt || 0) - (a.updatedAt || 0);
  });

  for (const ws of sorted) {
    $list.appendChild(buildRow(ws));
  }

  const total = workspaces.length;
  const pinnedCount = workspaces.filter((w) => w.pinned).length;
  let label = total + ' workspace' + (total === 1 ? '' : 's');
  if (pinnedCount > 0) label += ' · ' + pinnedCount + ' pinned';
  $countLabel.textContent = label;
}

function buildRow(ws) {
  const li = document.createElement('li');
  li.className = 'workspace' + (ws.pinned ? ' is-pinned' : '');
  li.dataset.id = ws.id;

  const meta = document.createElement('div');
  meta.className = 'meta';

  if (ws.pinned) {
    const eyebrow = document.createElement('span');
    eyebrow.className = 'row-eyebrow pinned-eyebrow';
    eyebrow.textContent = 'Pinned';
    meta.append(eyebrow);
  }

  const name = document.createElement('h2');
  name.className = 'name';
  name.textContent = ws.name;

  const count = document.createElement('p');
  count.className = 'count';
  const num = document.createElement('span');
  num.className = 'num';
  num.textContent = String(ws.tabs.length);
  const label = document.createElement('span');
  label.className = 'label';
  label.textContent = tabCountLabel(ws.tabs.length);
  count.append(num, ' ', label);

  meta.append(name, count);

  const actions = document.createElement('div');
  actions.className = 'actions';

  const openBtn = document.createElement('button');
  openBtn.type = 'button';
  openBtn.className = 'btn open-btn';
  openBtn.setAttribute('aria-label', 'Open workspace ' + ws.name);
  openBtn.innerHTML =
    '<span class="open-label">Open</span>' +
    '<svg class="open-arrow" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M3 8h10"></path>' +
      '<path d="M9 4l4 4-4 4"></path>' +
    '</svg>';
  openBtn.addEventListener('click', () => openWorkspace(ws));

  const pinBtn = document.createElement('button');
  pinBtn.type = 'button';
  pinBtn.className = 'icon-btn pin-btn' + (ws.pinned ? ' is-pinned' : '');
  pinBtn.setAttribute('aria-label', (ws.pinned ? 'Unpin workspace ' : 'Pin workspace ') + ws.name);
  pinBtn.setAttribute('aria-pressed', ws.pinned ? 'true' : 'false');
  pinBtn.title = ws.pinned ? 'Unpin' : 'Pin to top';
  pinBtn.innerHTML =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path class="pin-head" d="M9.5 2h-3l-1 4-2 1v1.5h9V7l-2-1-1-4z"></path>' +
      '<path d="M8 8.5v5.5"></path>' +
    '</svg>';
  pinBtn.addEventListener('click', () => togglePin(ws.id));

  const delBtn = document.createElement('button');
  delBtn.type = 'button';
  delBtn.className = 'icon-btn delete-btn';
  delBtn.setAttribute('aria-label', 'Delete workspace ' + ws.name);
  delBtn.title = 'Delete';
  delBtn.innerHTML =
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<path d="M3 4h10"></path>' +
      '<path d="M5.5 4V2.5h5V4"></path>' +
      '<path d="M4.5 4l.6 8.5a1.5 1.5 0 0 0 1.5 1.4h2.8a1.5 1.5 0 0 0 1.5-1.4L11.5 4"></path>' +
      '<path d="M6.5 7v4"></path>' +
      '<path d="M9.5 7v4"></path>' +
    '</svg>';
  delBtn.addEventListener('click', () => confirmDelete(ws));

  actions.append(openBtn, pinBtn, delBtn);
  li.append(meta, actions);
  return li;
}

// --- Save current tabs (via custom modal) ---
// State for the currently open save modal. Reset every time the modal opens.
let saveModalTabs = [];     // [{ url, title, favIconUrl, excluded }]
let saveModalSkipped = 0;   // count of internal pages we filtered out

async function saveCurrentTabs() {
  clearError();
  $saveBtn.disabled = true;
  try {
    await openSaveModal();
  } catch (err) {
    showError('Failed to open save dialog. ' + (err && err.message ? err.message : ''));
  } finally {
    $saveBtn.disabled = false;
  }
}

async function openSaveModal() {
  const tabs = await chrome.tabs.query({ currentWindow: true });

  const restorable = [];
  const seen = new Set();
  let skipped = 0;
  for (const tab of tabs) {
    if (!isRestorable(tab.url)) { skipped++; continue; }
    if (seen.has(tab.url)) continue;
    seen.add(tab.url);
    restorable.push({
      url: tab.url,
      title: tab.title || tab.url,
      favIconUrl: tab.favIconUrl || '',
    });
  }

  if (restorable.length === 0) {
    showError('No restorable tabs in this window (only internal pages were found).');
    return;
  }

  saveModalTabs = restorable.map((t) => ({ ...t, excluded: false }));
  saveModalSkipped = skipped;

  // Reset form state
  const defaultName =
    'Workspace ' +
    new Date().toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  $saveName.value = defaultName;
  $excludeToggle.checked = false;
  $excludeSection.hidden = true;
  $saveValidation.hidden = true;
  renderSaveTabList();
  updateSaveOkState();

  $saveModal.returnValue = '';
  $saveModal.showModal();

  // Focus the name field so the user can immediately overwrite the default.
  // rAF isn't strictly necessary in a popup, but it lets the dialog finish
  // its open transition before we steal focus.
  requestAnimationFrame(() => {
    try { $saveName.focus(); $saveName.select(); } catch (_) { /* noop in tests */ }
  });
}

function renderSaveTabList() {
  $tabList.innerHTML = '';
  for (const t of saveModalTabs) {
    const li = document.createElement('li');
    li.className = 'tab-row' + (t.excluded ? ' is-excluded' : '');

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'tab-cb';
    cb.setAttribute('aria-label', 'Exclude ' + t.title);
    cb.checked = t.excluded;
    cb.addEventListener('change', () => {
      t.excluded = cb.checked;
      li.classList.toggle('is-excluded', t.excluded);
      updateSaveOkState();
    });
    li.appendChild(cb);

    const fav = document.createElement('span');
    fav.className = 'tab-favicon';
    if (t.favIconUrl) {
      const img = document.createElement('img');
      img.src = t.favIconUrl;
      img.alt = '';
      img.addEventListener('error', () => {
        // swap to a neutral fallback if the favicon 404s
        fav.innerHTML = '';
        const fb = document.createElement('span');
        fb.className = 'tab-favicon-fallback';
        fb.setAttribute('aria-hidden', 'true');
        fav.appendChild(fb);
      });
      fav.appendChild(img);
    } else {
      const fb = document.createElement('span');
      fb.className = 'tab-favicon-fallback';
      fb.setAttribute('aria-hidden', 'true');
      fav.appendChild(fb);
    }
    li.appendChild(fav);

    const title = document.createElement('span');
    title.className = 'tab-title';
    title.textContent = t.title;
    title.title = t.title; // tooltip for truncated titles
    li.appendChild(title);

    // Make the whole row clickable to toggle the checkbox.
    li.addEventListener('click', (e) => {
      if (e.target === cb) return; // direct checkbox click already handled
      cb.checked = !cb.checked;
      cb.dispatchEvent(new Event('change', { bubbles: true }));
    });

    $tabList.appendChild(li);
  }
}

function updateSaveOkState() {
  const nameOk = $saveName.value.trim() !== '';
  const excludedCount = saveModalTabs.filter((t) => t.excluded).length;
  const allExcluded =
    saveModalTabs.length > 0 && excludedCount === saveModalTabs.length;
  $saveOk.disabled = !nameOk || allExcluded;
  $saveValidation.hidden = !allExcluded;
}

function closeSaveModal(reason) {
  // 'cancel', 'confirm', or anything else (Escape / backdrop) — close with
  // that returnValue so the close handler can distinguish if needed.
  $saveModal.close(reason || 'cancel');
}

async function submitSaveModal() {
  if ($saveOk.disabled) return; // validation: stay open, do nothing
  const name = $saveName.value.trim();
  if (name === '') return; // belt + suspenders (OK should already be disabled)

  const tabsToSave = saveModalTabs
    .filter((t) => !t.excluded)
    .map((t) => ({ url: t.url, title: t.title }));

  if (tabsToSave.length === 0) return; // all excluded (OK should be disabled)

  const now = Date.now();
  const newWs = {
    id: uid(),
    name,
    createdAt: now,
    updatedAt: now,
    pinned: false,
    tabs: tabsToSave,
  };

  const all = await getWorkspaces();
  all.push(newWs);
  const ok = await setWorkspaces(all);
  if (!ok) {
    // storage error already surfaced via showError; close so the user sees it
    closeSaveModal('error');
    return;
  }

  if (saveModalSkipped > 0) {
    showError(
      'Saved "' + name + '". Skipped ' + saveModalSkipped + ' internal ' +
      tabCountLabel(saveModalSkipped) + ' that can’t be restored.'
    );
  }
  render(all);
  closeSaveModal('confirm');
}

// --- Open workspace ---
async function openWorkspace(ws) {
  clearError();
  if (!ws.tabs || ws.tabs.length === 0) {
    showError('This workspace has no tabs to open.');
    return;
  }
  try {
    for (const tab of ws.tabs) {
      // open each in a new tab; don't steal focus from the user's current view
      await chrome.tabs.create({ url: tab.url, active: false });
    }
    window.close();
  } catch (err) {
    showError('Failed to open tabs. ' + (err && err.message ? err.message : ''));
  }
}

// --- Delete workspace ---
function confirmDelete(ws) {
  $confirmBody.textContent =
    '“' + ws.name + '” with ' + ws.tabs.length + ' ' +
    tabCountLabel(ws.tabs.length) + ' will be removed.';

  // Reset returnValue so we can detect cancel/Escape vs confirm
  $confirm.returnValue = '';
  $confirm.showModal();

  const onClose = () => {
    $confirm.removeEventListener('close', onClose);
    if ($confirm.returnValue !== 'confirm') return;
    deleteWorkspace(ws.id);
  };
  $confirm.addEventListener('close', onClose);
}

async function deleteWorkspace(id) {
  const all = await getWorkspaces();
  const next = all.filter((w) => w.id !== id);
  const ok = await setWorkspaces(next);
  if (!ok) return;
  render(next);
}

// --- Toggle pin on a workspace ---
async function togglePin(id) {
  const all = await getWorkspaces();
  const target = all.find((w) => w.id === id);
  if (!target) return;
  target.pinned = !target.pinned;
  target.updatedAt = Date.now();
  const ok = await setWorkspaces(all);
  if (!ok) return;
  render(all);
}

// --- Init ---
async function init() {
  $saveBtn.addEventListener('click', saveCurrentTabs);

  // Save modal wiring
  $saveName.addEventListener('input', updateSaveOkState);
  $saveName.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (!$saveOk.disabled) $saveOk.click();
    }
  });
  $excludeToggle.addEventListener('change', () => {
    $excludeSection.hidden = !$excludeToggle.checked;
    if (!$excludeSection.hidden) {
      // Focus the first checkbox for keyboard users
      const first = $tabList.querySelector('.tab-cb');
      if (first) first.focus();
    }
  });
  $cancelBtn.addEventListener('click', () => closeSaveModal('cancel'));
  $saveForm.addEventListener('submit', (e) => {
    e.preventDefault();
    submitSaveModal();
  });
  // Backdrop click → cancel. The dialog element itself receives the click
  // when the user clicks outside the form (i.e. on the backdrop area).
  $saveModal.addEventListener('click', (e) => {
    if (e.target === $saveModal) closeSaveModal('cancel');
  });

  const list = await getWorkspaces();
  render(list);
}

document.addEventListener('DOMContentLoaded', init);
