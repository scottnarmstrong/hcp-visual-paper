// Polynomial Entry -- visual paper app shell (tasks/p1b-site.md deliverable
// 4). Loads dist/data.json (pre-rendered by scripts/build.mjs -- every
// statement, proof and title is already HTML; nothing here re-renders
// math), draws the Cytoscape dependency graph, and drives the reading
// panel, search, theme, deep links and dev view.

import { notationKeyFromClassName, getNotationEntry, renderNotationCard } from './notation.mjs';
import { createGraphController } from './graphnav.mjs';
import { initReadingMode } from './readingmode.mjs';

// vendor/cytoscape-dagre.min.js is loaded as a classic <script> tag before
// this module and attaches a plain global; cytoscape only gains the `dagre`
// layout once it is registered via `.use(...)`. The graph's views, layout
// and zoom live in ./graphnav.mjs (tasks/p8-graph-navigation.md), shared
// with the compact preview.
if (window.cytoscape && window.cytoscapeDagre) window.cytoscape.use(window.cytoscapeDagre);

const state = {
  data: null,
  graph: null, // site/graphnav.mjs controller; null when the graph is unavailable
  devMode: new URLSearchParams(location.search).has('dev'),
};

// ---------------------------------------------------------------------------
// Theme
// ---------------------------------------------------------------------------
function initTheme() {
  const stored = safeLocalStorageGet('hcp-theme');
  if (stored === 'light' || stored === 'dark') document.documentElement.setAttribute('data-theme', stored);
  document.getElementById('theme-toggle').addEventListener('click', () => {
    const current = document.documentElement.getAttribute('data-theme')
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    const next = current === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    safeLocalStorageSet('hcp-theme', next);
    withGraph((g) => g.refreshStyle());
  });
  const mq = matchMedia('(prefers-color-scheme: dark)');
  const onSystemTheme = () => withGraph((g) => g.refreshStyle());
  if (mq.addEventListener) mq.addEventListener('change', onSystemTheme);
}
function safeLocalStorageGet(k) { try { return localStorage.getItem(k); } catch { return null; } }
function safeLocalStorageSet(k, v) { try { localStorage.setItem(k, v); } catch { /* ignore */ } }

// ---------------------------------------------------------------------------
// Mobile pane tabs
// ---------------------------------------------------------------------------
function initTabs() {
  const buttons = document.querySelectorAll('.tabbar__btn');
  buttons.forEach((b) => b.addEventListener('click', () => {
    buttons.forEach((x) => x.classList.remove('is-active'));
    b.classList.add('is-active');
    document.body.setAttribute('data-pane', b.dataset.pane);
  }));
  document.body.setAttribute('data-pane', 'graph');
}
function showPanelTab() {
  document.body.setAttribute('data-pane', 'panel');
  document.querySelectorAll('.tabbar__btn').forEach((b) => {
    b.classList.toggle('is-active', b.dataset.pane === 'panel');
  });
}

// ---------------------------------------------------------------------------
// Reading mode (tasks/p13-reading-mode.md, site/readingmode.mjs): the
// divider, "Hide graph" and the text size. Whenever the graph pane settles
// at a new size -- the divider let go, or the graph shown again -- the
// canvas is resized and re-fitted; while hidden, routes still update the
// panel and the graph (at zero size) keeps a pending fit for when it is
// back. The D3 figures in the panel follow their own mounts' size (each
// either scales with its viewBox or re-lays out from svgkit's watchResize).
// ---------------------------------------------------------------------------
function initReading() {
  try {
    initReadingMode({
      onLayoutChange: (reason) => {
        if (!['split', 'graph-shown', 'graph-expanded', 'graph-restored'].includes(reason)) return;
        requestAnimationFrame(() => withGraph((g) => g.resize({ refit: true })));
      },
    });
  } catch (err) {
    console.warn(`Reading-mode controls unavailable: ${err && err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Text helpers
// ---------------------------------------------------------------------------
function htmlToText(html) {
  const el = document.createElement('div');
  el.innerHTML = html || '';
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}
/** Like htmlToText, but math reads once: KaTeX's MathML text is kept and
 * its duplicate HTML rendering and TeX annotation are dropped (graph
 * labels and the phone outline). */
function plainText(html) {
  const el = document.createElement('div');
  el.innerHTML = html || '';
  el.querySelectorAll('.katex-html, annotation').forEach((x) => x.remove());
  return (el.textContent || '').replace(/\s+/g, ' ').trim();
}
function escapeHtml(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ---------------------------------------------------------------------------
// Site metadata (tasks/p11-launch.md sec.1): content/site.yaml, shipped as
// extra fields on data.meta (scripts/build.mjs) -- paper title, authors,
// arXiv id (null until the paper is posted), year, public URL, Lean repo.
// These constants are only the LAST-RESORT fallback for a data.meta with a
// field missing (an old cached data.json, or a test fixture) -- never a
// second source of truth to keep in sync by hand.
// ---------------------------------------------------------------------------
const DEFAULT_PAPER_TITLE = 'Homogenization at a polynomial scale in high contrast';
const DEFAULT_AUTHORS = ['Scott Armstrong', 'Tuomo Kuusi', 'Amélie Loher'];

function authorsLine(authors) {
  return (authors && authors.length) ? authors.join(', ') : DEFAULT_AUTHORS.join(', ');
}
function arxivUrl(id) {
  return `https://arxiv.org/abs/${encodeURIComponent(id)}`;
}

/** Top bar: the paper's title (replacing site/index.html's static text once
 * data.json has loaded), and a small "arXiv:<id>" link -- shown only once
 * `meta.arxivId` is set (tasks/p11-launch.md sec.2). `#topbar-arxiv-link`
 * does not exist in every test fixture's minimal DOM, so both lookups are
 * guarded exactly like initBrandHome's `.topbar__brand` below. */
function applySiteMeta(data) {
  const meta = (data && data.meta) || {};
  const h1 = document.querySelector('.topbar__title');
  if (h1 && meta.paperTitle) h1.textContent = meta.paperTitle;
  const arxivLink = document.getElementById('topbar-arxiv-link');
  if (!arxivLink) return;
  if (meta.arxivId) {
    arxivLink.href = arxivUrl(meta.arxivId);
    arxivLink.textContent = `arXiv:${meta.arxivId}`;
    arxivLink.hidden = false;
  } else {
    arxivLink.hidden = true;
  }
}

// ---------------------------------------------------------------------------
// Welcome panel (tasks/p5-polish-5.md): shown whenever there is no route
// (`#/...`) -- on first load with no hash, and again whenever the route is
// cleared, including by clicking the site title (see initBrandHome below).
// Its heading, byline and three paragraphs are fixed, reviewed copy, not
// derived from content/** -- so, unlike every other panel in this file,
// nothing here goes through the audit pipeline. The two buttons are ordinary
// links built from the already-loaded data (never hard-coded ids): Theorem
// A's own id (data.meta.theoremAId) and whichever L0 section node's number
// is "§6" -- the button is simply omitted if no such node exists. The arXiv
// line and "How to cite" line (tasks/p11-launch.md sec.2) show only once
// meta.arxivId is set; the footer (sec.3, full site only -- the preview
// build never calls welcomeFooterHtml) never carries a licence grant for
// the paper content itself.
// ---------------------------------------------------------------------------
function findTopLevelSectionByNumber(data, number) {
  const target = `§${number}`;
  return Object.values(data.nodes).find(
    (n) => n.level === 'L0' && n.kind === 'section' && htmlToText(n.numberHtml) === target,
  ) || null;
}

function welcomeFooterHtml(meta) {
  const year = meta.year || 2026;
  const leanRepo = meta.leanRepo;
  const leanLine = leanRepo
    ? `<p>Lean formalization: <a href="${escapeHtml(leanRepo)}">${escapeHtml(leanRepo.replace(/^https?:\/\//, ''))}</a>.</p>`
    : '';
  return `
      <footer class="welcome-panel__footer">
        <p>&copy; ${year} ${escapeHtml(authorsLine(meta.authors))}.</p>
        ${leanLine}
        <p>Third-party software: KaTeX (MIT), D3 (ISC), Cytoscape.js and cytoscape-dagre (MIT), dagre (MIT), IBM Plex (SIL OFL 1.1). <a href="THIRD_PARTY_LICENSES.txt">Full licence texts</a>.</p>
      </footer>`;
}

/** "How to read the graph" (tasks/p18-legend.md): every box and arrow style the
 * graph draws, a mini swatch reusing the graph legend's own CSS classes (so this
 * and the legend can never drift apart), plus one plain sentence each on Main
 * results vs. Full graph, the two layouts (map and columns), opening a section,
 * clicking a result, and Back/Forward. Fixed, reviewed copy -- see the header
 * comment above welcomePanelHtml. */
function howToReadGraphHtml() {
  return `
    <div class="welcome-panel__how-to-read" id="how-to-read-graph">
      <h3 class="section-label">How to read the graph</h3>
      <ul class="how-to-read__list">
        <li><i class="legend-swatch legend-swatch--theorem" aria-hidden="true"></i>Theorem: filled.</li>
        <li><i class="legend-swatch legend-swatch--major" aria-hidden="true"></i>Major result: thick border.</li>
        <li><i class="legend-swatch legend-swatch--result" aria-hidden="true"></i>Supporting result: pale tint.</li>
        <li><i class="legend-swatch legend-swatch--definition" aria-hidden="true"></i>Definition: small, grey.</li>
        <li><i class="legend-swatch legend-swatch--section" aria-hidden="true"></i>Section: grey box.</li>
        <li><i class="legend-swatch legend-swatch--subsection" aria-hidden="true"></i>Subsection: white, dashed border.</li>
        <li><i class="legend-swatch legend-swatch--ext" aria-hidden="true"></i>External input: dotted border, italic.</li>
        <li><i class="legend-swatch legend-swatch--akhc" aria-hidden="true"></i>[AK25] item: quoted from the earlier paper.</li>
        <li><i class="legend-swatch legend-swatch--background" aria-hidden="true"></i>Background node: a fact the paper takes from [AK25] without stating it.</li>
        <li><i class="legend-swatch legend-swatch--lean" aria-hidden="true"></i>Lean check: covered by the formalization.</li>
        <li><i class="legend-arrow" aria-hidden="true"></i>Thick arrow: a major result used directly to prove another.</li>
        <li><i class="legend-arrow legend-arrow--dashed" aria-hidden="true"></i>Dashed arrow: uses a definition.</li>
        <li><i class="legend-arrow legend-arrow--dotted" aria-hidden="true"></i>Dotted arrow: cites [AK25].</li>
        <li><i class="legend-arrow legend-arrow--mutual" aria-hidden="true"></i>Two-headed arrow: each result uses the other.</li>
        <li><i class="legend-outline" aria-hidden="true"></i>Outline: the selected or focused result.</li>
      </ul>
      <p>Main results (the default) shows only the major results and the direct uses between them; Full graph shows every result, definition and link.</p>
      <p>The map shows sections and results as boxes joined by arrows; clicking a result switches to a columns view instead, with what it uses in the left columns and what uses it in the right ones.</p>
      <p>Click a section to open it and see what is inside; click it again to close it.</p>
      <p>Click a result to read it in this panel: its statement, what it uses, what uses it, and, where the paper gives one, its proof.</p>
      <p>Back and Forward step through the graph views already opened, like a browser's own.</p>
    </div>`;
}

function welcomePanelHtml(data) {
  const meta = (data && data.meta) || {};
  const paperTitle = meta.paperTitle || DEFAULT_PAPER_TITLE;
  const authors = authorsLine(meta.authors);
  const theoremAId = meta.theoremAId;
  const section6 = data ? findTopLevelSectionByNumber(data, 6) : null;
  const theoremAButton = theoremAId
    ? `<a class="welcome-panel__button" href="#/${encodeURIComponent(theoremAId)}/L3">Start with Theorem A</a>` : '';
  const section6Button = section6
    ? `<a class="welcome-panel__button welcome-panel__button--ghost" href="#/${encodeURIComponent(section6.id)}/L3">Theorems B–D</a>` : '';
  const arxivPara = meta.arxivId
    ? `<p class="welcome-panel__arxiv">Paper: <a href="${arxivUrl(meta.arxivId)}">arXiv:${escapeHtml(meta.arxivId)}</a></p>` : '';
  const citeLine = meta.arxivId
    ? `<p class="welcome-panel__cite">How to cite: ${escapeHtml(authors)}. ${escapeHtml(paperTitle)}. <a href="${arxivUrl(meta.arxivId)}">arXiv:${escapeHtml(meta.arxivId)}</a>, ${meta.year || ''}.</p>`
    : '';
  return `
    <div class="welcome-panel">
      <h2 class="node-head__title">${escapeHtml(paperTitle)}</h2>
      <p class="welcome-panel__byline">${escapeHtml(authors)}</p>
      ${arxivPara}
      <div class="prose">
        <p>An interactive companion to the paper. The graph shows how the proofs are put together: the paper's sections, their subsections, and the individual lemmas, propositions, definitions and labelled estimates, with an arrow from each result to the results whose proofs use it. Click a section to open it, and click a result to read it here.</p>
        <p>Each result has a short summary, the exact statement from the paper, what it uses and what uses it, and, where the paper gives one, its proof: a proof idea, then numbered steps, each with a one-line summary and the paper's own text. Click a highlighted symbol in any formula to see its definition.</p>
        <p>Everything shown is the paper's own text, text quoted from the earlier paper [AK25] that it cites, or a summary. The only mathematics that appears in neither paper is in nodes marked <em>Background</em>, which state facts the paper takes from [AK25]. Each summary or background sentence was checked, against the passages it cites, by an independent AI auditor that did not write it. A green ✓ on a box in the graph, and a <strong>Lean ✓</strong> badge above its statement, mark a result or definition covered by the Lean formalization; the badge links to it.</p>
      </div>
      ${howToReadGraphHtml()}
      ${citeLine}
      <div class="welcome-panel__actions">${theoremAButton}${section6Button}</div>
      ${welcomeFooterHtml(meta)}
    </div>`;
}

function renderWelcome() {
  document.getElementById('panel-content').innerHTML = welcomePanelHtml(state.data);
}

/** The site title/brand in the top bar (a <button>, not a link -- it does
 * not navigate to a URL, it clears the current one) always returns to the
 * welcome panel: clear the route if one is set (the resulting hashchange
 * re-renders it), or render it directly if the route was already empty
 * (no hashchange event would fire). */
function initBrandHome() {
  const brand = document.querySelector('.topbar__brand');
  if (!brand) return;
  brand.addEventListener('click', () => {
    if (location.hash && location.hash !== '#') location.hash = '';
    else applyRoute(null);
    showPanelTab();
  });
}

/** The graph toolbar's "?" button (tasks/p18-legend.md): opens the welcome panel
 * (like the site title) and scrolls straight to "How to read the graph" -- called
 * synchronously (not left to the async hashchange event) so the scroll target
 * exists by the time it runs. */
function initGraphHelp() {
  document.querySelectorAll('[data-graph-action="help"]').forEach((b) => b.addEventListener('click', () => {
    if (location.hash && location.hash !== '#') location.hash = '';
    applyRoute(null);
    showPanelTab();
    const target = document.getElementById('how-to-read-graph');
    if (target) target.scrollIntoView({ block: 'start' });
  }));
}

// ---------------------------------------------------------------------------
// Graph (tasks/p8-graph-navigation.md): site/graphnav.mjs owns the views --
// the whole map, an opened section with its outside links, and a result's
// own neighbourhood -- plus layout and zoom. A graph failure (e.g. cytoscape
// missing) never takes the reading panel down with it.
// ---------------------------------------------------------------------------
function cssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || '#888';
}

function graphLabelOf(id) {
  const n = state.data.nodes[id] || state.data.externalNodes[id];
  if (!n) return { number: id, title: '' };
  return { number: plainText(n.numberHtml), title: plainText(n.titleHtml) };
}

function graphFailed(err) {
  console.warn(`Dependency graph unavailable: ${err && err.message}`);
  state.graph = null;
}

function initGraph(data) {
  try {
    state.graph = createGraphController({
      cytoscape: window.cytoscape,
      container: document.getElementById('cy'),
      pane: document.getElementById('graph-pane'),
      data,
      labelOf: graphLabelOf,
      cssVar,
      navigate: (id) => { navigate(id, 'L3'); showPanelTab(); },
      onWholeMap: navigateWholeMap,
    });
  } catch (err) {
    graphFailed(err);
  }
}

/** Every call into the graph goes through here, so a failure disables the
 * graph (once, with a warning) instead of breaking the page. */
function withGraph(fn) {
  if (!state.graph) return;
  try {
    fn(state.graph);
  } catch (err) {
    graphFailed(err);
  }
}

function showInGraph(id) {
  withGraph((g) => g.show(id));
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------
/** `#/<id>/<level>` (a node route); `#/map` or `#/map/<id>` (the whole map,
 * keeping the reading panel on `<id>` if given -- "Whole map" is a history
 * step of its own, see navigateWholeMap below); or no hash at all (the
 * welcome panel, `null`). */
function parseHash() {
  const map = /^#\/map(?:\/([^/]+))?$/.exec(location.hash);
  if (map) return { map: true, id: map[1] ? decodeURIComponent(map[1]) : null };
  const m = /^#\/([^/]+)(?:\/([A-Za-z0-9]+))?$/.exec(location.hash);
  if (!m) return null;
  return { id: decodeURIComponent(m[1]), level: m[2] || 'L3' };
}
function navigate(id, level) {
  const target = `#/${encodeURIComponent(id)}/${level}`;
  if (location.hash === target) applyRoute({ id, level });
  else location.hash = target;
}
/** "Whole map" button: pushes `#/map`, or `#/map/<id>` when a node is
 * currently open, so the browser's Back returns to the view before the map
 * was opened and Forward returns to the map -- previously this button
 * changed only the graph, with no hash and no history entry at all. */
function navigateWholeMap() {
  const current = parseHash();
  const id = current ? current.id : null;
  const target = id ? `#/map/${encodeURIComponent(id)}` : '#/map';
  if (location.hash === target) applyRoute(parseHash());
  else location.hash = target;
}
function applyRoute(route) {
  if (!route) {
    renderWelcome();
    showInGraph(null);
    return;
  }
  if (route.map) {
    withGraph((g) => g.wholeMap(route.id || null));
    if (!route.id) { renderWelcome(); return; }
    const { data } = state;
    const node = data.nodes[route.id] || data.externalNodes[route.id];
    if (node) renderPanel(node, 'L3'); else renderMissing(route.id);
    return;
  }
  const { data } = state;
  const node = data.nodes[route.id] || data.externalNodes[route.id];
  if (!node) {
    renderMissing(route.id);
    return;
  }
  renderPanel(node, route.level);
  showInGraph(route.id);
}

// ---------------------------------------------------------------------------
// Panel rendering
// ---------------------------------------------------------------------------
function kindBadge(node) {
  const label = node.kind === 'theorem' ? 'theorem' : node.kind;
  return `<span class="badge badge--kind">${escapeHtml(label)}</span>`;
}
function draftBadge(node) {
  if (!node.draft) return '';
  return `<span class="badge badge--draft">${escapeHtml(node.status || 'draft')}</span>`;
}
function leanBadge(node) {
  if (!node.lean) return '';
  const href = `https://github.com/${node.lean.repo}/blob/${node.lean.commit}/${node.lean.file}`;
  return `<a class="badge badge--lean" href="${href}" target="_blank" rel="noopener">Lean &#10003; ${escapeHtml(node.lean.decl)}</a>`;
}
function auditBadge(node) {
  if (!state.devMode) return '';
  if (!node.audit) return '<span class="badge badge--audit-none">no audit</span>';
  const cls = node.audit.status === 'audited' ? 'badge--lean' : 'badge--draft';
  return `<span class="badge ${cls}">${escapeHtml(node.audit.status)} &middot; ${node.audit.claims} claims &middot; ${node.audit.auditors} mice${node.audit.waived ? ` &middot; ${node.audit.waived} waived` : ''}</span>`;
}

function usesList(title, ids, data, fromId) {
  if (!ids || ids.length === 0) return '';
  const overrides = (fromId && data.usesNote && data.usesNote[fromId]) || {};
  const items = ids.map((id) => {
    const n = data.nodes[id] || data.externalNodes[id];
    // PLAN.md sec.2 task 2: a `uses` target that was really an equation
    // label shows its own .aux number ("(2.12) in §2.1"), never the raw
    // label -- the override always wins when present.
    const label = overrides[id] || (n ? (htmlToText(n.numberHtml) || id) : id);
    const t = n ? htmlToText(n.titleHtml) : '';
    return `<a href="#/${encodeURIComponent(id)}/L3"><span class="uses-list__num">${escapeHtml(label)}</span>${escapeHtml(t)}</a>`;
  }).join('');
  return `<div class="section-label">${title}</div><nav class="uses-list">${items}</nav>`;
}

function renderStepsHtml(steps) {
  return steps.map((s, i) => `
    <div class="step" data-open="${i === 0}">
      <div class="step__head" data-step-toggle>
        <span class="step__num">Step ${i + 1}</span>
        <span>${s.titleHtml}</span>
      </div>
      ${s.summaryHtml.map((c) => `<div class="step__summary">${c.html}</div>`).join('')}
      <div class="step__body prose">${s.textHtml}</div>
    </div>`).join('');
}

// ---------------------------------------------------------------------------
// Figures (tasks/p3t-tooling.md sec.3): a figure is placed on every panel
// named in its own `attach_to` (data/build time -- scripts/lib/
// assembleGraph.mjs's buildFiguresByAttachment sets `node.figures`). A
// `renderer: 'tikz'` figure is a build-time static SVG (figures/<id>.svg,
// produced by scripts/build_tikz_figures.mjs); a `renderer: 'd3'` figure is
// an interactive module (site/figures/<id>.js, exporting
// `render(el, {theme, params})`) mounted client-side by mountFigures below.
// ---------------------------------------------------------------------------
// tasks/p9a-figure-popout.md: the same expand-to-corners glyph as the
// graph toolbar's own "fit" button.
const FIGURE_ENLARGE_BTN_HTML = `<button type="button" class="icon-button figure-enlarge-btn" aria-label="Enlarge this figure" title="Enlarge">
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true"><path d="M2 6V2h4M10 2h4v4M14 10v4h-4M6 14H2v-4" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>
      </button>`;

function figureCardHtml(fig) {
  const kindTag = fig.kind ? `<span class="badge badge--kind">${escapeHtml(fig.kind)}</span>` : '';
  const toyTag = fig.toyRun ? '<span class="badge badge--draft">toy run</span>' : '';
  const reviewTag = fig.status && fig.status !== 'approved'
    ? '<span class="badge badge--draft">awaiting author review</span>' : '';
  const caption = Array.isArray(fig.captionHtml) && fig.captionHtml.length
    ? fig.captionHtml.map((c) => c.html).join(' ') : '';
  const params = fig.parameters
    ? `<details class="figure-params"><summary>Parameters</summary><pre>${escapeHtml(JSON.stringify(fig.parameters, null, 2))}</pre></details>` : '';
  const mount = fig.renderer === 'd3'
    ? `<div class="figure-mount" data-figure-id="${escapeHtml(fig.id)}"></div>`
    : `<img class="figure-static" src="figures/${encodeURIComponent(fig.id)}.svg" alt="" loading="lazy">`;
  return `
    <figure class="figure-card" id="figure-${escapeHtml(fig.id)}">
      <div class="figure-card__head">${kindTag}${toyTag}${reviewTag}${FIGURE_ENLARGE_BTN_HTML}</div>
      ${mount}
      <figcaption>${fig.titleHtml ? `<strong>${fig.titleHtml}.</strong> ` : ''}${caption}</figcaption>
      ${params}
    </figure>`;
}

function figuresSectionHtml(node, data) {
  const ids = Array.isArray(node.figures) ? node.figures : [];
  const figs = ids.map((id) => data.figures && data.figures[id]).filter(Boolean);
  if (figs.length === 0) return '';
  return `<div class="section-label">Figures</div><div class="figures">${figs.map(figureCardHtml).join('')}</div>`;
}

/** Mount every D3 figure in `root` (a freshly-rendered panel): dynamic
 * `import()` of its own site/figures/<id>.js module (relative to this
 * page, never a CDN -- PLAN.md sec.5/tasks/p3t-tooling.md sec.3), calling
 * its exported `render(el, {theme, params})`. A figure with no such module
 * yet (content/figures/*.yaml specs exist ahead of their build) shows a
 * placeholder instead of a dead mount point. */
function mountFigures(root, data) {
  root.querySelectorAll('.figure-mount[data-figure-id]').forEach(async (el) => {
    const id = el.dataset.figureId;
    const fig = data.figures && data.figures[id];
    const theme = document.documentElement.getAttribute('data-theme')
      || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    try {
      const mod = await import(`./figures/${id}.js`);
      mod.render(el, { theme, params: (fig && fig.parameters) || {} });
    } catch (err) {
      el.innerHTML = '<p class="prose figure-mount__missing">(figure not yet built)</p>';
    }
  });
}

// ---------------------------------------------------------------------------
// Figure pop-out (tasks/p9a-figure-popout.md): "Enlarge" (or clicking the
// figure itself, outside its own controls) MOVES a figure card's live DOM --
// its `.figure-mount`/`.figure-static`/`.figure-img-frame` plus the
// `<figcaption>` right after it -- into #figure-modal, a `<dialog>` sized to
// fill most of the window, and moves the same two nodes back on close.
// Nothing is re-rendered: slider positions, listeners, and any
// resize-driven layout (fig.counting-scales' own ResizeObserver on its
// mount) carry over unchanged in both directions, and a fixed-viewBox SVG
// (`width="100%"`) simply scales to the dialog's larger box. `<dialog>`'s
// own showModal()/close() give focus-trap-while-open, Esc-to-close, and (in
// every real browser) focus-return-to-opener for free; both are called
// defensively since jsdom implements neither (test/figure-popout.test.mjs
// exercises the move logic directly instead).
// ---------------------------------------------------------------------------
const figurePopoutState = {
  mount: null, caption: null, placeholder: null, opener: null,
};

function figurePopoutMountEl(card) {
  return card.querySelector('.figure-mount, .figure-static, .figure-img-frame');
}

/** The single cleanup path for every way the dialog can close (its own
 * close button, a backdrop click, or -- in a real browser -- Esc/the
 * native `cancel` default action): moves the mount and caption back to
 * exactly where they came from and returns focus to whatever opened it. */
function closeFigurePopoutNow() {
  const {
    mount, caption, placeholder, opener,
  } = figurePopoutState;
  if (!mount) return;
  placeholder.replaceWith(...(caption ? [mount, caption] : [mount]));
  figurePopoutState.mount = null;
  figurePopoutState.caption = null;
  figurePopoutState.placeholder = null;
  figurePopoutState.opener = null;
  document.getElementById('figure-modal').removeAttribute('open');
  if (opener) opener.focus();
}

function requestCloseFigurePopout() {
  const dialog = document.getElementById('figure-modal');
  if (typeof dialog.close === 'function') dialog.close(); // fires 'close' -> closeFigurePopoutNow
  else closeFigurePopoutNow(); // jsdom: no close() to fire it for us
}

function openFigurePopout(card, opener) {
  const mount = figurePopoutMountEl(card);
  if (!mount) return;
  if (figurePopoutState.mount) closeFigurePopoutNow(); // only one figure open at a time
  const next = mount.nextElementSibling;
  const caption = next && next.tagName === 'FIGCAPTION' ? next : null;

  const id = card.id.startsWith('figure-') ? card.id.slice('figure-'.length) : '';
  const fig = state.data.figures && state.data.figures[id];
  document.getElementById('figure-modal-title').textContent = fig ? plainText(fig.titleHtml) : '';

  const placeholder = document.createComment('figure-popout-slot');
  mount.before(placeholder);
  const target = document.getElementById('figure-modal-figure');
  target.appendChild(mount);
  if (caption) target.appendChild(caption);

  figurePopoutState.mount = mount;
  figurePopoutState.caption = caption;
  figurePopoutState.placeholder = placeholder;
  figurePopoutState.opener = opener || null;

  const dialog = document.getElementById('figure-modal');
  if (typeof dialog.showModal === 'function') dialog.showModal();
  else dialog.setAttribute('open', ''); // jsdom: no showModal -- reflect `open` so the DOM move is still checkable
}

/** Interactive controls a click on the figure itself must NOT pop out --
 * sliders, buttons, selects, checkboxes, `details`, or any other
 * interactive element a figure module builds into its own mount. */
const FIGURE_INTERACTIVE_SELECTOR = 'input, button, select, textarea, a, details, summary, [contenteditable], [role="button"], [tabindex]';

function initFigurePopouts() {
  const dialog = document.getElementById('figure-modal');
  const panel = document.getElementById('panel-content');
  if (!dialog || !panel) return;
  panel.addEventListener('click', (e) => {
    const enlargeBtn = e.target.closest('.figure-enlarge-btn');
    if (enlargeBtn) {
      const card = enlargeBtn.closest('.figure-card');
      if (card) openFigurePopout(card, enlargeBtn);
      return;
    }
    const hit = e.target.closest('.figure-mount, .figure-static, .figure-img-frame');
    if (!hit) return;
    // Scoped to `hit` itself: an ANCESTOR further up the page can carry a
    // stray `tabindex`/similar for unrelated reasons (e.g. #panel's own
    // scroll-to-top tabindex="-1") without being one of the figure's own
    // controls -- closest() alone would wrongly walk past the figure to find it.
    const interactive = e.target.closest(FIGURE_INTERACTIVE_SELECTOR);
    if (interactive && hit.contains(interactive)) return;
    const card = hit.closest('.figure-card');
    if (card) openFigurePopout(card, card.querySelector('.figure-enlarge-btn'));
  });
  dialog.querySelector('.figure-modal__close').addEventListener('click', requestCloseFigurePopout);
  // The UA-drawn ::backdrop is not a real element to target -- a click
  // there bubbles as a click on the dialog itself (spec behavior).
  dialog.addEventListener('click', (e) => { if (e.target === dialog) requestCloseFigurePopout(); });
  dialog.addEventListener('close', closeFigurePopoutNow);
}

function renderStructuralNode(node) {
  const { data } = state;
  const children = Object.values(data.nodes).filter((n) => n.parent === node.id);
  const rows = children.map((c) => `<a href="#/${encodeURIComponent(c.id)}/L3"><span class="uses-list__num">${escapeHtml(htmlToText(c.numberHtml))}</span>${escapeHtml(htmlToText(c.titleHtml))}</a>`).join('');
  // The section/subsection's own summary/idea come from a content/graph/*
  // fragment when an author has written one, and are simply absent
  // otherwise (build.mjs falls back to the paper's own title only).
  const summary = Array.isArray(node.summaryHtml) && node.summaryHtml.length
    ? `<div class="section-label">Summary</div><div class="prose">${node.summaryHtml.map((c) => `<p>${c.html}</p>`).join('')}</div>` : '';
  const idea = Array.isArray(node.ideaHtml) && node.ideaHtml.length
    ? `<div class="section-label">Idea</div><div class="prose">${node.ideaHtml.map((c) => `<p>${c.html}</p>`).join('')}</div>` : '';
  return `
    <div class="node-head">
      <div class="node-head__eyebrow">${kindBadge(node)}${draftBadge(node)}</div>
      <h2 class="node-head__title">${node.titleHtml}</h2>
    </div>
    ${summary}
    ${idea}
    ${figuresSectionHtml(node, data)}
    ${usesList('Proved here', node.provedHere, data)}
    <div class="section-label">Contains</div>
    <nav class="uses-list">${rows || '<p class="prose">No children shown at this zoom level yet.</p>'}</nav>`;
}

function renderExternalNode(node) {
  const { data } = state;
  const c = data.citations[node.id];
  // The [AK25] cluster (tasks/p7a-tooling.md sec.6) also lists what it
  // holds: the [AK25] results the paper cites, and background nodes.
  const children = Object.values(data.externalNodes).filter((n) => n.parent === node.id);
  const contains = children.length
    ? usesList('Cited items and background', children.map((n) => n.id), data)
    : '';
  return `
    <div class="node-head">
      <div class="node-head__eyebrow"><span class="badge badge--kind">external input</span></div>
      <h2 class="node-head__title mono">[${escapeHtml(c ? c.tag : node.id)}]</h2>
      ${node.arxiv ? akhcNumberingNote(node) : ''}
    </div>
    <div class="section-label">Reference</div>
    <p class="bib-card">${c && c.cardHtml ? c.cardHtml : '(no bibliography entry found)'}</p>
    ${contains}
    ${usesList('Cited by', node.usedBy, data)}`;
}

// ---------------------------------------------------------------------------
// [AK25] panels (tasks/p7a-tooling.md sec.6). An ak.* node holds only text
// quoted verbatim from the pinned [AK25] source (rendered at build time with
// [AK25]'s own macros, never wrapped for HCP notation popovers) plus .aux
// numbers and pages. A bg.* node is new mathematics: audited claims in the
// paper's notation, labelled as background, with its [AK25] sources quoted.
// ---------------------------------------------------------------------------
function akhcClusterOf(node) {
  return (node && node.parent && state.data.externalNodes[node.parent]) || node || {};
}

function akhcTag(node) {
  return htmlToText(akhcClusterOf(node).numberHtml) || '[AK25]';
}

function akhcNumberingNote(node) {
  const a = akhcClusterOf(node).arxiv;
  if (!a) return '';
  return `<p class="akhc-note">numbering as in <a href="${escapeHtml(a.url)}" target="_blank" rel="noopener">arXiv:${escapeHtml(a.id)}${escapeHtml(a.version)}</a></p>`;
}

function akhcQuotes(htmlList) {
  return (htmlList || []).map((h) => `<div class="prose akhc-quote">${h}</div>`).join('');
}

function akhcProofHtml(proof, tag) {
  if (!proof) return '';
  if (proof.type === 'quote') {
    return `<div class="section-label" id="proof-anchor">Proof</div>
      <details class="akhc-details"><summary>The proof in ${escapeHtml(tag)}, quoted (${escapeHtml(proof.text || '')})</summary><div class="prose akhc-quote">${proof.html}</div></details>`;
  }
  return `<div class="section-label" id="proof-anchor">Proof</div><p class="akhc-pointer">${escapeHtml(proof.text)}</p>`;
}

/** The paper's own sentences around its citations of [AK25] (tasks/
 * p7a-tooling.md follow-up): each quoted verbatim through an HCP anchor and
 * rendered with the paper's macros -- so, unlike [AK25] text, notation
 * popovers work here -- and linked to the node(s) containing it. A sentence
 * clipped to 3 source lines is marked [...] at the cut. */
function paperSentencesHtml(title, list, data) {
  if (!Array.isArray(list) || list.length === 0) return '';
  const items = list.map((s) => {
    const where = (s.nodes || []).map((id) => {
      const n = data.nodes[id] || data.externalNodes[id];
      if (!n) return '';
      const num = htmlToText(n.numberHtml);
      const t = htmlToText(n.titleHtml);
      return `<a href="#/${encodeURIComponent(id)}/L3">${escapeHtml([num, t].filter(Boolean).join(' ') || id)}</a>`;
    }).filter(Boolean).join(', ');
    const cls = `prose hcp-quote${s.clippedStart ? ' hcp-quote--clip-start' : ''}${s.clippedEnd ? ' hcp-quote--clip-end' : ''}`;
    return `<figure class="hcp-cite"><blockquote class="${cls}">${s.html}</blockquote>${where ? `<figcaption class="hcp-cite__where">in ${where}</figcaption>` : ''}</figure>`;
  }).join('');
  return `<div class="section-label">${title}</div><div class="hcp-cites">${items}</div>`;
}

function renderAkhcNode(node) {
  const { data } = state;
  const tag = akhcTag(node);
  const statement = node.akType === 'section'
    ? `<div class="section-label" id="statement-anchor">Section title only</div><p class="akhc-pointer">${escapeHtml(node.locationText || '')}</p>`
    : `<div class="section-label" id="statement-anchor">Statement, quoted from ${escapeHtml(tag)}</div>${akhcQuotes(node.statementHtml)}
       ${node.locationText ? `<p class="akhc-pointer">${escapeHtml(node.locationText)}</p>` : ''}`;
  const citedBy = node.usedBy && node.usedBy.length
    ? usesList('Cited here by', node.usedBy, data)
    : '<div class="section-label">Cited here by</div><p class="akhc-pointer">Cited in a part of the paper that is not on this map.</p>';
  return `
    <div class="node-head">
      <div class="node-head__eyebrow"><span class="badge badge--akhc">from ${escapeHtml(tag)}</span></div>
      <h2 class="node-head__title"><span class="mono">${node.numberHtml}</span>${node.titleHtml ? ` (${node.titleHtml})` : ''}</h2>
      ${akhcNumberingNote(node)}
    </div>
    ${statement}
    ${paperSentencesHtml('How the paper cites it', node.citingSentences, data)}
    ${akhcProofHtml(node.proof, tag)}
    ${citedBy}
    ${usesList('Background that adds to it', node.background, data)}`;
}

function renderBackgroundNode(node) {
  const { data } = state;
  const tag = akhcTag(node);
  const claims = (list) => (list || []).map((c) => `<p>${c.html}</p>`).join('');
  const implicitBadge = node.implicit ? `<span class="badge badge--implicit">Not stated as such in ${escapeHtml(tag)}</span>` : '';
  const derivation = node.implicit && node.derivationHtml && node.derivationHtml.length
    ? `<div class="section-label">How it follows from ${escapeHtml(tag)}</div><div class="prose">${claims(node.derivationHtml)}</div>` : '';
  const sources = node.sourceHtml && node.sourceHtml.length
    ? `<div class="section-label">Where it comes from in ${escapeHtml(tag)}</div>
       <details class="akhc-details"><summary>Quoted from ${escapeHtml(tag)} (${node.sourceHtml.length} passage${node.sourceHtml.length === 1 ? '' : 's'})</summary>${akhcQuotes(node.sourceHtml)}</details>` : '';
  let proof = '';
  if (node.proof && node.proof.type === 'quote') {
    proof = `<div class="section-label" id="proof-anchor">Proof</div>
      <details class="akhc-details"><summary>Quoted from ${escapeHtml(tag)}</summary><div class="prose akhc-quote">${node.proof.html}</div></details>`;
  } else if (node.proof) {
    proof = `<div class="section-label" id="proof-anchor">Proof</div><p class="akhc-pointer">${escapeHtml(node.proof.text)}</p>`;
  }
  return `
    <div class="node-head">
      <div class="node-head__eyebrow"><span class="badge badge--background">Background: not stated in this paper</span>${implicitBadge}${auditBadge(node)}</div>
      <h2 class="node-head__title">${node.titleHtml || ''}</h2>
    </div>
    <div class="section-label" id="statement-anchor">Statement</div>
    <div class="prose">${claims(node.statementHtml)}</div>
    ${derivation}
    ${paperSentencesHtml('Where the paper uses it', node.usedAtSentences, data)}
    ${sources}
    ${usesList(`Related ${escapeHtml(tag)} results`, node.related, data)}
    ${proof}
    ${usesList('Used by', node.usedBy, data)}`;
}

// tasks/p5-polish-2.md bug fix: a top-level theorem whose content/graph/
// <label>.yaml section fragment shares its own id (Theorem A today; the
// same fragment/node id collision would apply to B-D if one of them gets a
// fragment) carries that fragment's own overview under
// `sectionSummaryHtml`/`sectionIdeaHtml`/`sectionTitleHtml` (scripts/lib/
// assembleGraph.mjs), separately from the node's own `summaryHtml` below --
// shown first, since it is "what the reader sees" before the node's own
// exact statement. `sectionTitleHtml` is the fragment's own title claim
// (its text duplicates the node's own titleHtml above almost always, so
// showing it again would just look like a typo); it still needs to be
// present so the claim itself is covered (tasks/p5-polish-2.md's coverage
// guarantee), so it renders visually hidden.
function theoremOverviewHtml(node) {
  const hasSummary = Array.isArray(node.sectionSummaryHtml) && node.sectionSummaryHtml.length > 0;
  const hasIdea = Array.isArray(node.sectionIdeaHtml) && node.sectionIdeaHtml.length > 0;
  if (!hasSummary && !hasIdea) return '';
  const heading = node.sectionTitleHtml ? `<h3 class="sr-only">${node.sectionTitleHtml}</h3>` : '';
  const whatItSays = hasSummary
    ? `<div class="section-label">What it says</div><div class="prose">${node.sectionSummaryHtml.map((c) => `<p>${c.html}</p>`).join('')}</div>` : '';
  const proofInOnePage = hasIdea
    ? `<div class="section-label">The proof in one page</div><div class="prose">${node.sectionIdeaHtml.map((c) => `<p>${c.html}</p>`).join('')}</div>` : '';
  return `${heading}${whatItSays}${proofInOnePage}`;
}

function renderTheoremNode(node, level) {
  const { data } = state;
  const overview = theoremOverviewHtml(node);
  const summary = Array.isArray(node.summaryHtml) && node.summaryHtml.length
    ? `<div class="section-label">Summary</div><div class="prose">${node.summaryHtml.map((c) => `<p>${c.html}</p>`).join('')}</div>` : '';
  const idea = Array.isArray(node.ideaHtml) && node.ideaHtml.length
    ? `<div class="section-label">Proof idea</div><div class="prose">${node.ideaHtml.map((c) => `<p>${c.html}</p>`).join('')}</div>` : '';

  let proofSection = '';
  if (node.proofHtml && typeof node.proofHtml === 'object' && node.proofHtml.steps) {
    proofSection = `<div class="section-label" id="proof-anchor">Proof &mdash; steps</div>${idea}${renderStepsHtml(node.proofHtml.steps)}`;
    if (node.proofHtml.fullHtml) {
      proofSection += `<details><summary>Full extracted proof text</summary><div class="prose">${node.proofHtml.fullHtml}</div></details>`;
    }
  } else if (typeof node.proofHtml === 'string') {
    proofSection = `<div class="section-label" id="proof-anchor">Proof</div>${idea}<div class="prose">${node.proofHtml}</div>`;
  } else if (idea) {
    proofSection = `<div id="proof-anchor">${idea}</div>`;
  }

  return `
    <div class="node-head">
      <div class="node-head__eyebrow">
        ${kindBadge(node)}${draftBadge(node)}${leanBadge(node)}${auditBadge(node)}
      </div>
      <h2 class="node-head__title">${node.numberHtml ? `<span class="mono">${escapeHtml(htmlToText(node.numberHtml))}</span> ` : ''}${node.titleHtml || ''}</h2>
    </div>
    ${overview}
    ${summary}
    <div class="section-label" id="statement-anchor">Statement</div>
    <div class="prose">${node.statementHtml || '<p>(no statement text)</p>'}</div>
    ${figuresSectionHtml(node, data)}
    ${usesList('Uses', node.uses, data, node.id)}
    ${usesList('Used by', node.usedBy, data)}
    ${proofSection}
  `;
}

function renderPanel(node, level) {
  const panel = document.getElementById('panel-content');
  let html;
  if (node.kind === 'section' || node.kind === 'subsection') html = renderStructuralNode(node);
  else if (node.kind === 'akhc') html = renderAkhcNode(node);
  else if (node.kind === 'background') html = renderBackgroundNode(node);
  else if (node.kind === 'external') html = renderExternalNode(node);
  else html = renderTheoremNode(node, level);
  panel.innerHTML = html;
  panel.scrollTop = 0;
  if (level === 'L4') {
    const anchor = document.getElementById('proof-anchor');
    if (anchor) anchor.scrollIntoView({ block: 'start' });
  }
  wireStepToggles(panel);
  mountFigures(panel, state.data);
}

function renderMissing(id) {
  document.getElementById('panel-content').innerHTML = `<div class="panel-empty"><p>No node named <code>${escapeHtml(id)}</code>.</p></div>`;
}

function wireStepToggles(root) {
  root.querySelectorAll('[data-step-toggle]').forEach((head) => {
    head.addEventListener('click', () => {
      const step = head.closest('.step');
      step.dataset.open = step.dataset.open === 'true' ? 'false' : 'true';
    });
  });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------
function buildSearchIndex(data) {
  const all = { ...data.nodes, ...data.externalNodes };
  return Object.values(all).map((n) => ({
    id: n.id,
    number: htmlToText(n.numberHtml),
    title: htmlToText(n.titleHtml),
    haystack: `${n.id} ${htmlToText(n.numberHtml)} ${htmlToText(n.titleHtml)}`.toLowerCase(),
  }));
}

function initSearch(data) {
  const index = buildSearchIndex(data);
  const input = document.getElementById('search-input');
  const results = document.getElementById('search-results');

  function render(list) {
    if (list.length === 0) { results.hidden = true; results.innerHTML = ''; return; }
    results.innerHTML = list.slice(0, 20).map((r) => `
      <button type="button" class="search-results__item" data-id="${escapeHtml(r.id)}">
        <span class="search-results__num">${escapeHtml(r.number)}</span>${escapeHtml(r.title || r.id)}
      </button>`).join('');
    results.hidden = false;
  }

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { render([]); return; }
    render(index.filter((r) => r.haystack.includes(q)));
  });
  input.addEventListener('focus', () => { if (input.value.trim()) results.hidden = false; });
  results.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    navigate(btn.dataset.id, 'L3');
    showPanelTab();
    results.hidden = true;
    input.value = '';
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.topbar__search')) results.hidden = true;
  });
}

// ---------------------------------------------------------------------------
// Notation popovers
// ---------------------------------------------------------------------------
/** Below the clicked symbol, kept inside the window: the popover's width
 * follows the reading text size (tasks/p13-reading-mode.md), so it is
 * measured once shown rather than assumed. */
function placeNotationPopover(pop, el) {
  const rect = el.getBoundingClientRect();
  pop.style.left = '0px';
  pop.style.top = `${rect.bottom + 6}px`;
  pop.hidden = false;
  const w = pop.offsetWidth || 330;
  pop.style.left = `${Math.max(8, Math.min(rect.left, window.innerWidth - w - 8))}px`;
}

function initNotationPopovers(data) {
  const pop = document.getElementById('notation-popover');
  document.getElementById('panel-content').addEventListener('click', (e) => {
    const el = e.target.closest('[class*="nt-"]');
    if (!el) return;
    // Never inside quoted [AK25] text (tasks/p7a-tooling.md sec.6): its
    // macros differ from the paper's, and it is never wrapped at build time.
    if (el.closest('.akhc-quote')) return;
    const key = notationKeyFromClassName(el.className);
    if (!key) return;
    const entry = getNotationEntry(data.notation, key);
    pop.innerHTML = renderNotationCard(key, entry);
    placeNotationPopover(pop, el);
    e.stopPropagation();
  });
  pop.addEventListener('click', (e) => {
    // "Go to definition" (site/notation.mjs's renderNotationCard): let the
    // hash change navigate as normal, just close the popover first so it
    // does not float over the freshly-opened node.
    if (e.target.closest('.notation-card__goto')) pop.hidden = true;
  });
  document.addEventListener('click', (e) => {
    if (!pop.hidden && !e.target.closest('#notation-popover')) pop.hidden = true;
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') pop.hidden = true; });
}

// ---------------------------------------------------------------------------
// History navigation (a reader asked for "a button to go back a step...
// given how complicated a network it is"): visible Back/Forward buttons
// that simply call history.back()/history.forward(), so they can never
// disagree with the browser's own. An in-app position counter travels in
// history.state as {hcpIndex: n}: n=0 on the entry this page loaded with
// (or whatever a same-session reload already carried), and the next n on
// every entry after -- however it was created (navigate(), the brand
// button, navigateWholeMap(), or an ordinary <a href="#/..."> in the panel
// -- every one of them ends in a 'hashchange', the one place this is
// tagged, via syncHistoryIndex). historyIndex/maxHistoryIndex are pure
// bookkeeping: Back is disabled at n <= 0 (the site's own first entry --
// this never navigates the reader off the site, whatever real history sits
// behind it) and Forward at the highest n reached so far; a brand-new entry
// always resets the ceiling to its own index, exactly as the browser itself
// discards any old forward branch the moment a fresh entry is pushed from
// the middle of history.
// ---------------------------------------------------------------------------
let historyIndex = 0;
let maxHistoryIndex = 0;

function updateHistoryNavButtons() {
  const backDisabled = historyIndex <= 0;
  const forwardDisabled = historyIndex >= maxHistoryIndex;
  document.querySelectorAll('[data-history-nav="back"]').forEach((b) => { b.disabled = backDisabled; });
  document.querySelectorAll('[data-history-nav="forward"]').forEach((b) => { b.disabled = forwardDisabled; });
}

/** Run on every hashchange after boot: an entry that already carries a
 * numeric hcpIndex is one this app tagged before (a Back/Forward step of
 * ours or the browser's own, or a same-entry replay); one that does not is
 * brand new and gets the next index, tagged in place with replaceState
 * (never a history entry of its own, and never fires hashchange/popstate). */
function syncHistoryIndex() {
  const cur = history.state;
  if (cur && typeof cur.hcpIndex === 'number') {
    historyIndex = cur.hcpIndex;
    maxHistoryIndex = Math.max(maxHistoryIndex, historyIndex);
  } else {
    historyIndex += 1;
    history.replaceState({ hcpIndex: historyIndex }, '', location.href);
    maxHistoryIndex = historyIndex;
  }
  updateHistoryNavButtons();
}

function initHistoryNav() {
  const cur = history.state;
  const tagged = cur && typeof cur.hcpIndex === 'number';
  historyIndex = tagged ? cur.hcpIndex : 0;
  if (!tagged) history.replaceState({ hcpIndex: historyIndex }, '', location.href);
  maxHistoryIndex = historyIndex;
  updateHistoryNavButtons();
  document.querySelectorAll('[data-history-nav="back"]').forEach((b) => b.addEventListener('click', () => history.back()));
  document.querySelectorAll('[data-history-nav="forward"]').forEach((b) => b.addEventListener('click', () => history.forward()));
}

// ---------------------------------------------------------------------------
// Boot
// ---------------------------------------------------------------------------
async function main() {
  initTheme();
  initTabs();
  initReading();
  initBrandHome();
  initGraphHelp();
  initHistoryNav();
  if (state.devMode) document.getElementById('dev-indicator').hidden = false;

  const res = await fetch('data.json');
  const data = await res.json();
  state.data = data;
  applySiteMeta(data);

  initGraph(data);
  initSearch(data);
  initNotationPopovers(data);
  initFigurePopouts();
  buildOutline(data);

  window.addEventListener('hashchange', () => { syncHistoryIndex(); applyRoute(parseHash()); });
  applyRoute(parseHash());
}

// ---------------------------------------------------------------------------
// Outline tree (phone-width fallback for the graph, <=700px -- deliverable 4)
// ---------------------------------------------------------------------------
function buildOutline(data) {
  const root = document.getElementById('outline');
  const byParent = {};
  const all = { ...data.nodes, ...data.externalNodes };
  for (const n of Object.values(all)) {
    const p = n.parent || '__root__';
    (byParent[p] = byParent[p] || []).push(n);
  }
  function renderLevel(parentId) {
    const kids = byParent[parentId] || [];
    if (kids.length === 0) return '';
    return `<ul>${kids.map((n) => `
      <li class="${[n.kind === 'external' ? 'outline__ext' : '', n.tier === 'major' ? 'outline__major' : '', n.tier === 'background' && n.kind !== 'external' ? 'outline__background' : ''].filter(Boolean).join(' ')}">
        <button type="button" data-id="${escapeHtml(n.id)}">
          <span class="outline__num">${escapeHtml(plainText(n.numberHtml))}</span>${escapeHtml(plainText(n.titleHtml) || n.id)}${n.lean ? '<span class="lean-check" title="Formalized in Lean">&#10003;</span>' : ''}${n.tier === 'major' ? '<span class="outline__tag">major</span>' : ''}
        </button>
        ${renderLevel(n.id)}
      </li>`).join('')}</ul>`;
  }
  root.innerHTML = renderLevel('__root__');
  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-id]');
    if (!btn) return;
    navigate(btn.dataset.id, 'L3');
    showPanelTab();
  });
  // Below the graph breakpoint, the outline replaces the canvas entirely.
  const mq = window.matchMedia('(max-width: 700px)');
  function sync() {
    root.hidden = !mq.matches;
    document.getElementById('cy').hidden = mq.matches;
    if (!mq.matches) withGraph((g) => g.resize());
  }
  mq.addEventListener ? mq.addEventListener('change', sync) : mq.addListener(sync);
  sync();
}

main().catch((err) => {
  console.error(err);
  document.getElementById('panel-content').innerHTML = `<div class="panel-empty"><p>Failed to load data.json: ${escapeHtml(err.message)}</p></div>`;
});
