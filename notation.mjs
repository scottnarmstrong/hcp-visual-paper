// Pure, DOM-free notation-popover logic (tasks/p1b-site.md deliverable 4).
// Kept separate from app.js so it is unit-testable from Node without a
// browser: test/notation-popover.test.mjs exercises it directly with a
// dummy fixture entry, since the real data.json's `notation` map is empty
// in Phase 1 (the notation layer itself is Phase 3, PLAN.md sec.8).
//
// Rendered statement/proof HTML wraps a notation occurrence as
// `\htmlClass{nt-<key>}{...}` (KaTeX's \htmlClass -> a <span class="nt-<key> ...">
// in the rendered math). This module never touches the DOM: it only knows
// how to go from a class list to a notation key, and from a key to the
// card content to display.

/** Given a DOM element's className string (or an array of classes),
 * return the notation key it names, or null if it names none. A KaTeX
 * `\htmlClass{nt-<key>}{...}` element may carry other KaTeX classes
 * alongside `nt-<key>`. */
export function notationKeyFromClassName(className) {
  const classes = Array.isArray(className) ? className : String(className || '').split(/\s+/);
  for (const c of classes) {
    if (c.startsWith('nt-') && c.length > 3) return c.slice(3);
  }
  return null;
}

/** Look up a notation key in the data.json `notation` map. Returns the
 * entry (see renderNotationCard's doc for its shape) or null when the key
 * has no entry -- a popover trigger with no matching data is a content bug
 * elsewhere, not something this function papers over. */
export function getNotationEntry(notationMap, key) {
  if (!notationMap || !key) return null;
  return notationMap[key] || null;
}

/**
 * Render a notation entry into the popover card's inner HTML. Pure
 * string-building: the caller places this into a DOM node.
 *
 * `entry` (scripts/lib/assembleGraph.mjs's buildNotationCards):
 *   `{ key, status, macro, labelHtml?,
 *      nodeId?, nodeTitleHtml?, nodeStatementHtml?, nodeSummaryHtml?,
 *      definitionHtml?, glossHtml? }`
 * EITHER `nodeId` is set (preferred: the linked node's own ledger-supported
 * summary and its verbatim statement, plus a "Go to definition" link) OR
 * `definitionHtml`/`glossHtml` are (the defining span verbatim, plus
 * audited gloss claims) -- never both.
 */
export function renderNotationCard(key, entry) {
  if (!entry) {
    return `<div class="notation-card notation-card--missing">No notation entry for <code>${escapeHtml(key)}</code> yet.</div>`;
  }
  const statusBadge = entry.status && entry.status !== 'published' && entry.status !== 'standard'
    ? `<span class="badge badge--draft">${escapeHtml(entry.status)}</span>` : '';
  const label = entry.labelHtml
    ? `<div class="notation-card__label">${entry.labelHtml}</div>` : '';

  let body;
  if (entry.nodeId) {
    const summary = Array.isArray(entry.nodeSummaryHtml) && entry.nodeSummaryHtml.length > 0
      ? `<div class="notation-card__summary">${entry.nodeSummaryHtml.map((c) => `<p>${c.html}</p>`).join('')}</div>`
      : '';
    const statement = entry.nodeStatementHtml
      ? `<div class="notation-card__def">${entry.nodeStatementHtml}</div>` : '';
    body = `
      ${summary}
      ${statement}
      <a class="notation-card__goto" href="#/${encodeURIComponent(entry.nodeId)}/L3">Go to definition</a>`;
  } else {
    const gloss = Array.isArray(entry.glossHtml) && entry.glossHtml.length > 0
      ? `<div class="notation-card__gloss">${entry.glossHtml.map((g) => `<p>${g.html}</p>`).join('')}</div>`
      : '';
    body = `
      <div class="notation-card__def">${entry.definitionHtml || ''}</div>
      ${gloss}`;
  }

  return `
    <div class="notation-card">
      <div class="notation-card__head"><code>${escapeHtml(entry.macro || key)}</code>${statusBadge}</div>
      ${label}
      ${body}
    </div>`;
}

function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
