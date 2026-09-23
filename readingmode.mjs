// Reading mode (tasks/p13-reading-mode.md): a draggable divider between the
// graph and the reading panel, a "Hide graph" switch, and a text-size
// control that scales the reading panel only. Shared by the full site
// (site/app.js imports it) and the preview (scripts/build_preview.mjs
// inlines it as window.HCP_READING, like site/graphnav.mjs) -- so this
// module has no imports, and every export is a plain declaration.
//
// Every setting lives in localStorage, and every read and write goes
// through safeStorage: a private window, blocked site data or a sandboxed
// frame can make the accessor itself throw, and the page must work the
// same without it (defaults, nothing remembered).
//
// The CSS side (site/app.css, scripts/preview/style.css):
//   - `.layout`'s `--panel-pct` is the reading panel's share of the width;
//     the stylesheet holds the default split, and this sets it inline only
//     once the reader has moved the divider.
//   - `body[data-graph-hidden]` hides the graph pane and centres the text.
//   - `--reading-scale` on the root is read only by the reading panel's own
//     font size (and the notation popover opened from it); everything in the
//     panel is sized in em/ch from there.

export const SPLIT_MIN = 25;
export const SPLIT_MAX = 85;
export const SPLIT_STEP = 5;
export const TEXT_SCALES = [0.875, 1, 1.125, 1.25, 1.375, 1.5, 1.625, 1.75, 1.875, 2];
export const STORAGE_KEYS = {
  split: 'hcp-reading-split',
  graphHidden: 'hcp-graph-hidden',
  textScale: 'hcp-text-scale',
};
/** The graph/panel layout exists only above the phone breakpoint; below it
 * the Graph/Reading tabs switch panes and none of this applies. */
export const DESKTOP_QUERY = '(min-width: 701px)';

/** The reading panel's share of the width, in percent, clamped to
 * [SPLIT_MIN, SPLIT_MAX] and rounded to 0.1; null for anything that is not
 * a finite number (so a corrupt stored value falls back to the default). */
export function clampSplit(pct) {
  const n = typeof pct === 'string' ? (pct.trim() === '' ? NaN : Number(pct)) : pct;
  if (typeof n !== 'number' || !Number.isFinite(n)) return null;
  return Math.round(Math.min(SPLIT_MAX, Math.max(SPLIT_MIN, n)) * 10) / 10;
}

/** The split for a pointer at `clientX` over a layout box `rect` (the panel
 * is on the right, so it is what lies right of the pointer). */
export function splitFromPointer(clientX, rect) {
  if (!rect || !(rect.width > 0)) return null;
  return clampSplit(((rect.left + rect.width - clientX) / rect.width) * 100);
}

/** The nearest allowed text scale to `value`; 1 for anything unusable. */
export function snapTextScale(value) {
  const n = typeof value === 'string' ? (value.trim() === '' ? NaN : Number(value)) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return 1;
  let best = TEXT_SCALES[0];
  for (const s of TEXT_SCALES) if (Math.abs(s - n) < Math.abs(best - n)) best = s;
  return best;
}

/** One step larger (dir > 0) or smaller (dir < 0), stopping at the ends. */
export function stepTextScale(current, dir) {
  const i = TEXT_SCALES.indexOf(snapTextScale(current));
  const j = Math.min(TEXT_SCALES.length - 1, Math.max(0, i + (dir > 0 ? 1 : -1)));
  return TEXT_SCALES[j];
}

/** get/set/remove over a storage that may be missing or throw on any
 * access. `getStorage` is a function so that even reading
 * `window.localStorage` (which throws in some sandboxes) happens inside the
 * try. */
export function safeStorage(getStorage) {
  const store = () => {
    try { return (typeof getStorage === 'function' ? getStorage() : getStorage) || null; } catch { return null; }
  };
  return {
    get(key) {
      try { const s = store(); return s ? s.getItem(key) : null; } catch { return null; }
    },
    set(key, value) {
      try { const s = store(); if (s) s.setItem(key, String(value)); } catch { /* storage unavailable */ }
    },
    remove(key) {
      try { const s = store(); if (s) s.removeItem(key); } catch { /* storage unavailable */ }
    },
  };
}

/** The three settings as stored (each falls back to its default alone). */
export function readSettings(storage) {
  const hidden = storage.get(STORAGE_KEYS.graphHidden);
  const scale = storage.get(STORAGE_KEYS.textScale);
  return {
    split: clampSplit(storage.get(STORAGE_KEYS.split)),
    graphHidden: hidden === '1',
    textScale: scale === null ? 1 : snapTextScale(scale),
  };
}

/** A key press aimed at something the reader is typing into. */
export function isTypingTarget(el) {
  if (!el || typeof el.closest !== 'function') return false;
  return !!el.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]');
}

function percentLabel(scale) {
  return `${Math.round(scale * 1000) / 10}%`;
}

/**
 * Wire the controls. Everything is looked up in `doc` and skipped when
 * missing (tests mount app.js on minimal fixture pages):
 *   `.layout`, `#panel`, `.pane-divider` (role="separator"),
 *   `[data-reading="toggle-graph"]`, `[data-reading="text-smaller"]`,
 *   `[data-reading="text-reset"]`, `[data-reading="text-larger"]`.
 * `onLayoutChange(reason)` runs after the graph pane's size changes for
 * good ('split' at the end of a drag or key press, 'graph-shown',
 * 'graph-hidden') and after a text-size change ('text-size'); the caller
 * resizes and re-fits the graph there.
 */
export function initReadingMode({
  doc = document, win = window, storage: storageArg, onLayoutChange = () => {},
} = {}) {
  const storage = storageArg || safeStorage(() => win.localStorage);
  const root = doc.documentElement;
  const body = doc.body;
  const layout = doc.querySelector('.layout');
  const panel = doc.getElementById('panel');
  const divider = doc.querySelector('.pane-divider');
  const toggleBtn = doc.querySelector('[data-reading="toggle-graph"]');
  const smallerBtn = doc.querySelector('[data-reading="text-smaller"]');
  const resetBtn = doc.querySelector('[data-reading="text-reset"]');
  const largerBtn = doc.querySelector('[data-reading="text-larger"]');
  const textGroup = doc.querySelector('[data-reading="text-size"]');

  const st = readSettings(storage);
  const isDesktop = () => {
    try { return !win.matchMedia || win.matchMedia(DESKTOP_QUERY).matches; } catch { return true; }
  };
  const notify = (reason) => { try { onLayoutChange(reason); } catch { /* never break the controls */ } };

  // ---- split ---------------------------------------------------------------
  /** The panel's share as laid out now (the stylesheet default when the
   * reader has not chosen one). */
  function currentSplit() {
    if (st.split !== null) return st.split;
    if (layout && panel) {
      const lw = layout.getBoundingClientRect().width;
      const pw = panel.getBoundingClientRect().width;
      if (lw > 0 && pw > 0) return clampSplit((pw / lw) * 100);
    }
    return 40;
  }
  function syncDividerAria() {
    if (!divider) return;
    divider.setAttribute('aria-valuenow', String(Math.round(currentSplit())));
    divider.setAttribute('aria-valuemin', String(SPLIT_MIN));
    divider.setAttribute('aria-valuemax', String(SPLIT_MAX));
  }
  function applySplit() {
    if (layout) {
      if (st.split === null) layout.style.removeProperty('--panel-pct');
      else layout.style.setProperty('--panel-pct', String(st.split));
    }
    syncDividerAria();
  }
  function setSplit(pct, { save = true } = {}) {
    st.split = pct === null ? null : clampSplit(pct);
    applySplit();
    if (!save) return;
    if (st.split === null) storage.remove(STORAGE_KEYS.split);
    else storage.set(STORAGE_KEYS.split, st.split);
  }

  if (divider && layout) {
    let dragging = null;
    divider.addEventListener('pointerdown', (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      e.preventDefault(); // no text selection, no focus-steal flicker
      dragging = e.pointerId;
      try { divider.setPointerCapture(e.pointerId); } catch { /* synthetic events */ }
      body.setAttribute('data-resizing', '');
    });
    divider.addEventListener('pointermove', (e) => {
      if (dragging === null || e.pointerId !== dragging) return;
      const pct = splitFromPointer(e.clientX, layout.getBoundingClientRect());
      if (pct !== null) setSplit(pct, { save: false });
    });
    const endDrag = (e) => {
      if (dragging === null || (e && e.pointerId !== dragging)) return;
      dragging = null;
      try { if (e) divider.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      body.removeAttribute('data-resizing');
      if (st.split !== null) storage.set(STORAGE_KEYS.split, st.split);
      notify('split');
    };
    divider.addEventListener('pointerup', endDrag);
    divider.addEventListener('pointercancel', endDrag);
    divider.addEventListener('lostpointercapture', endDrag);
    divider.addEventListener('keydown', (e) => {
      let next = null;
      // The panel is on the right: moving the divider left widens it.
      if (e.key === 'ArrowLeft') next = currentSplit() + SPLIT_STEP;
      else if (e.key === 'ArrowRight') next = currentSplit() - SPLIT_STEP;
      else if (e.key === 'Home') next = SPLIT_MAX;
      else if (e.key === 'End') next = SPLIT_MIN;
      else if (e.key === 'Enter') { setSplit(null); notify('split'); e.preventDefault(); return; }
      if (next === null) return;
      e.preventDefault();
      setSplit(next);
      notify('split');
    });
    divider.addEventListener('dblclick', () => { setSplit(null); notify('split'); });
    win.addEventListener('resize', syncDividerAria);
  }

  // ---- hide / show the graph -------------------------------------------------
  function applyGraphHidden() {
    if (st.graphHidden) body.setAttribute('data-graph-hidden', '');
    else body.removeAttribute('data-graph-hidden');
    if (toggleBtn) {
      toggleBtn.setAttribute('aria-pressed', st.graphHidden ? 'true' : 'false');
      toggleBtn.textContent = st.graphHidden ? 'Show graph' : 'Hide graph';
      toggleBtn.title = `${st.graphHidden ? 'Show' : 'Hide'} the dependency graph (g)`;
    }
  }
  function setGraphHidden(hidden) {
    st.graphHidden = !!hidden;
    applyGraphHidden();
    if (st.graphHidden) storage.set(STORAGE_KEYS.graphHidden, '1');
    else storage.remove(STORAGE_KEYS.graphHidden);
    if (!st.graphHidden) syncDividerAria();
    notify(st.graphHidden ? 'graph-hidden' : 'graph-shown');
  }
  if (toggleBtn) toggleBtn.addEventListener('click', () => setGraphHidden(!st.graphHidden));
  doc.addEventListener('keydown', (e) => {
    if (e.key !== 'g' || e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
    if (isTypingTarget(e.target) || !isDesktop()) return;
    if (doc.querySelector('dialog[open]')) return;
    e.preventDefault();
    setGraphHidden(!st.graphHidden);
  });

  // ---- text size -------------------------------------------------------------
  function applyTextScale() {
    root.style.setProperty('--reading-scale', String(st.textScale));
    const label = percentLabel(st.textScale);
    if (smallerBtn) smallerBtn.disabled = st.textScale <= TEXT_SCALES[0];
    if (largerBtn) largerBtn.disabled = st.textScale >= TEXT_SCALES[TEXT_SCALES.length - 1];
    if (resetBtn) {
      resetBtn.setAttribute('aria-label', `Text size ${label}; reset to 100%`);
      resetBtn.title = `Text size ${label} (click to reset)`;
    }
    if (textGroup) textGroup.setAttribute('data-scale', label);
  }
  function setTextScale(scale) {
    st.textScale = snapTextScale(scale);
    applyTextScale();
    if (st.textScale === 1) storage.remove(STORAGE_KEYS.textScale);
    else storage.set(STORAGE_KEYS.textScale, st.textScale);
    notify('text-size');
  }
  if (smallerBtn) smallerBtn.addEventListener('click', () => setTextScale(stepTextScale(st.textScale, -1)));
  if (largerBtn) largerBtn.addEventListener('click', () => setTextScale(stepTextScale(st.textScale, 1)));
  if (resetBtn) resetBtn.addEventListener('click', () => setTextScale(1));
  if (textGroup) textGroup.addEventListener('dblclick', (e) => { e.preventDefault(); setTextScale(1); });

  applySplit();
  applyGraphHidden();
  applyTextScale();

  return {
    get state() { return { ...st }; },
    setSplit(pct) { setSplit(pct); notify('split'); },
    setGraphHidden,
    setTextScale,
  };
}
