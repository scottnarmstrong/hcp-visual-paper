// Dependency-graph navigation (tasks/p8-graph-navigation.md), shared by the
// full site (site/app.js imports this module) and the compact preview
// (scripts/build_preview.mjs inlines it, `export` keywords stripped, as
// window.HCP_GRAPHNAV -- scripts/preview/app.js is a classic script).
//
// The first half is pure (no DOM, no cytoscape) and unit-tested in
// test/graphnav.test.mjs:
//   - buildGraphIndex: parent/children/edge lookups over the app's data
//     (on the map a node sits in its nearest section/subsection);
//   - overviewGraph / clusterView: the whole map, and one opened cluster
//     with its direct outside links as context -- result-level edges lifted
//     to the nearest visible node, one edge per pair, [AK25] edges left out
//     unless asked for;
//   - focusGraph / focusLayout: a result with what it uses on the left and
//     what uses it on the right (optionally one step further), laid out on
//     their own in columns;
// Everything drawn runs in reading order, as in a Lean blueprint: an arrow
// A -> B means "A is used in the proof of B" -- from the used node to the
// node that uses it, the reverse of the stored data's `from` (user) -> `to`
// (used), which is never changed.
//   - viewportFor / wheelZoomFactor / placeContext: fitting, zoom and
//     context-placement maths;
//   - essentialsMap / essentialsIndex (tasks/p17-essentials.md): the default
//     "Essentials" view -- the major results in section bands joined by the
//     build's proof skeleton, and opened sections without their definitions.
// The second half, createGraphController, drives one cytoscape instance
// with those pieces: it rebuilds the elements for each view (whole map,
// opened cluster, focus), lays them out, and sets the viewport itself.

export const EDGE_KIND_RANK = { uses: 2, cite: 1, ref: 0 };

/** A stored edge {from: user, to: used} as drawn: {source: used, target: user}. */
export function drawnEnds(e) {
  return { source: e.to, target: e.from };
}

export const ZOOM = {
  min: 0.5, // below this the 12-13px labels stop being readable
  max: 2.5,
  fitMax: 1.3, // never blow a small view up past this when fitting
  // tasks/p18-legend.md: at the fitted zoom, a box's own font-size * zoom
  // ("effective size") must stay >= ~11px -- these floors are picked against
  // the actual font-sizes buildStylesheet uses (ess-major.lvl-L2: 14px,
  // node.lvl-L0/L1: 15px, the default 12px), so the view overflows (pannable)
  // rather than shrink text past that.
  focusReadable: 0.95, // a focus that must be forced is forced to this
  focusMinFit: 0.75, // below this (9px on the default 12px font) forcing kicks in
  mapReadable: 0.75, // nor an overview (whole map or opened cluster)
};

// ---------------------------------------------------------------------------
// Index
// ---------------------------------------------------------------------------

/** Nodes of the [AK25] layer: its cluster node, its quoted ak.* items and
 * the background bg.* nodes (tasks/p7a-tooling.md sec.6). */
export function isAkhcNode(n) {
  return !!n && (n.kind === 'akhc' || n.kind === 'background' || n.cluster === 'akhc');
}

/**
 * `data`: the app's merged data ({nodes, externalNodes, edges}). Returns
 * lookups used by everything below. `clusters` are the nodes a reader
 * opens in place on the map: sections, subsections, and an external node
 * with children (the [AK25] cluster). A theorem stays a result even when
 * the paper nests something under it (Theorem A holds §1.1, its standing
 * definitions): clicking it focuses it, and on the map what it holds sits
 * beside it instead of inside it -- each node's `parent` here is its
 * nearest cluster ancestor (`paperParent` keeps the paper's own), so that
 * a use of a §1.1 definition is drawn to §1.1, never to Theorem A.
 */
export function buildGraphIndex(data) {
  const all = { ...(data.nodes || {}), ...(data.externalNodes || {}) };
  const isClusterKind = (n) => n.kind === 'section' || n.kind === 'subsection' || n.kind === 'external';
  const hasKids = new Set();
  for (const n of Object.values(all)) if (n.parent && all[n.parent]) hasKids.add(n.parent);
  const clusters = new Set(Object.values(all).filter((n) => hasKids.has(n.id) && isClusterKind(n)).map((n) => n.id));
  const clusterParent = (n) => {
    let p = n.parent && all[n.parent] ? n.parent : null;
    const seen = new Set();
    while (p && !clusters.has(p) && !seen.has(p)) {
      seen.add(p);
      p = all[p].parent && all[all[p].parent] ? all[p].parent : null;
    }
    return p && clusters.has(p) ? p : null;
  };
  const nodes = new Map();
  const children = new Map();
  for (const n of Object.values(all)) {
    nodes.set(n.id, {
      id: n.id,
      parent: clusterParent(n),
      paperParent: n.parent && all[n.parent] ? n.parent : null,
      level: n.level,
      kind: n.kind,
      akhc: isAkhcNode(n),
      tier: n.tier || null,
    });
  }
  for (const n of nodes.values()) {
    if (!n.parent) continue;
    if (!children.has(n.parent)) children.set(n.parent, []);
    children.get(n.parent).push(n.id);
  }
  // One edge per ordered pair, the curated kind winning (uses > cite > ref),
  // in data order. `lifted` marks the build's own section/subsection-level
  // edges (scripts/lib/liftEdges.mjs: same level, L0 or L1, a section or
  // subsection at one end, never hand-authored): the map lifts the
  // result-level edges itself, so it leaves these out rather than count
  // them twice (or draw "uses Theorem A" for a use of a §1.1 definition).
  const byPair = new Map();
  for (const e of data.edges || []) {
    if (!nodes.has(e.from) || !nodes.has(e.to) || e.from === e.to) continue;
    const key = `${e.from}\u0000${e.to}`;
    const prev = byPair.get(key);
    if (!prev) byPair.set(key, { from: e.from, to: e.to, kind: e.kind, mapVia: e.mapVia || null });
    else if ((EDGE_KIND_RANK[e.kind] ?? 0) > (EDGE_KIND_RANK[prev.kind] ?? 0)) prev.kind = e.kind;
  }
  const edges = [...byPair.values()];
  for (const e of edges) {
    const a = nodes.get(e.from);
    const b = nodes.get(e.to);
    const structural = (n) => clusters.has(n.id) && (n.kind === 'section' || n.kind === 'subsection');
    e.lifted = e.kind !== 'ref' && a.level === b.level && (a.level === 'L0' || a.level === 'L1')
      && (structural(a) || structural(b));
  }
  const out = new Map();
  const inn = new Map();
  for (const e of edges) {
    if (!out.has(e.from)) out.set(e.from, []);
    if (!inn.has(e.to)) inn.set(e.to, []);
    out.get(e.from).push(e);
    inn.get(e.to).push(e);
  }
  // The build's proof homes (a result proved in another box: Theorem A in Subsection
  // 5.4) and proof skeleton between major results (tasks/p17-essentials.md).
  const proofHome = new Map();
  for (const e of data.edges || []) if (e.proofHome && nodes.has(e.from) && nodes.has(e.to)) proofHome.set(e.from, e.to);
  const skeleton = (data.skeleton || []).filter((s) => nodes.has(s.from) && nodes.has(s.to));
  return {
    nodes, children, clusters, edges, out, in: inn, proofHome, skeleton,
  };
}

/** Ancestors of `id`, outermost first (not including `id`). */
export function ancestorsOf(index, id) {
  const chain = [];
  const seen = new Set([id]);
  let cur = index.nodes.get(id);
  while (cur && cur.parent && !seen.has(cur.parent)) {
    seen.add(cur.parent);
    chain.unshift(cur.parent);
    cur = index.nodes.get(cur.parent);
  }
  return chain;
}

/** A cluster that can be opened on the map: every ancestor is a cluster
 * too (so expanding the chain reveals it). */
export function isOpenableCluster(index, id) {
  if (!index.clusters.has(id)) return false;
  return ancestorsOf(index, id).every((a) => index.clusters.has(a));
}

// ---------------------------------------------------------------------------
// Overview: the map at a set of expanded clusters
// ---------------------------------------------------------------------------

/**
 * The map with the clusters in `expanded` open (a cluster only counts as
 * open when all of its ancestors are open too). Returns
 *   nodes: [{id, parent, cluster, expanded}]  -- parent only when open
 *   edges: [{source, target, kind, count}]  -- as drawn: source is the used
 *                                              node, target the one using it
 * Every `uses`/`cite` edge is drawn between the nearest visible, unopened
 * node on each side (so a closed section carries its results' edges),
 * merged to one edge per pair (`count` underlying edges, the curated kind
 * winning); the build's own pre-lifted cluster edges are left out. A `ref`
 * edge (the mechanical \ref baseline) is never lifted: it shows only when
 * both ends are visible, closed, as themselves. An edge authored to a
 * subsection as a whole stays on its box when it is open. With `showAkhc` off, every edge touching the [AK25] cluster, an
 * ak.* item or a bg.* node is left out. `refs: false` leaves out `ref`
 * edges altogether; `mergeMutual` draws a -> b and b -> a as one edge with
 * `mutual: true`.
 */
export function overviewGraph(index, expanded, { showAkhc = false, refs = true, mergeMutual = false } = {}) {
  const open = (id) => index.clusters.has(id) && expanded.has(id);
  const visible = (id) => ancestorsOf(index, id).every(open);
  /** Nearest visible stand-in for `id`: its outermost closed ancestor, or
   * itself (an open cluster stands for itself, as its box). */
  const rep = (id) => {
    for (const a of ancestorsOf(index, id)) {
      if (!open(a)) return a;
    }
    return id;
  };
  const nodes = [];
  for (const n of index.nodes.values()) {
    if (!visible(n.id)) continue;
    const isOpen = open(n.id);
    nodes.push({
      id: n.id,
      parent: n.parent || null,
      cluster: index.clusters.has(n.id),
      expanded: isOpen,
    });
  }
  const byPair = new Map();
  for (const e of index.edges) {
    const a0 = index.nodes.get(e.from);
    const b0 = index.nodes.get(e.to);
    if (e.lifted || (!showAkhc && (a0.akhc || b0.akhc))) continue;
    // A proof edge whose proof sits in another box is drawn through that box instead
    // (the build adds the box's own edges; scripts/lib/assembleGraph.mjs, proof homes).
    if (e.mapVia) continue;
    const a = rep(e.from);
    const b = rep(e.to);
    if (a === b || ancestorsOf(index, a).includes(b) || ancestorsOf(index, b).includes(a)) continue;
    if (e.kind === 'ref' && (!refs || a !== e.from || b !== e.to || open(a) || open(b))) continue;
    // a uses b: drawn b -> a
    const key = `${b}\u0000${a}`;
    const prev = byPair.get(key);
    if (!prev) byPair.set(key, { source: b, target: a, kind: e.kind, count: 1 });
    else {
      prev.count += 1;
      if ((EDGE_KIND_RANK[e.kind] ?? 0) > (EDGE_KIND_RANK[prev.kind] ?? 0)) prev.kind = e.kind;
    }
  }
  let edges = [...byPair.values()];
  if (mergeMutual) {
    // a -> b and b -> a become one two-headed edge (the first one seen).
    const merged = [];
    const taken = new Set();
    for (const e of edges) {
      const key = `${e.source}\u0000${e.target}`;
      if (taken.has(key)) continue;
      const back = byPair.get(`${e.target}\u0000${e.source}`);
      if (back) {
        taken.add(`${e.target}\u0000${e.source}`);
        merged.push({
          ...e,
          count: e.count + back.count,
          kind: (EDGE_KIND_RANK[back.kind] ?? 0) > (EDGE_KIND_RANK[e.kind] ?? 0) ? back.kind : e.kind,
          mutual: true,
        });
      } else merged.push(e);
    }
    edges = merged;
  }
  return { nodes, edges };
}

/**
 * An opened cluster on its own: `subject`'s visible contents (with the
 * clusters in `expanded` open inside it, exactly as overviewGraph would
 * draw them) plus the outside nodes they link to directly, as context --
 * at the level the map currently shows them (a closed sibling subsection,
 * another section, a theorem). Only edges with at least one end inside
 * `subject` are kept; the rest of the map is left out, so the view stays
 * local and its edges short. Returns overviewGraph's shape, plus
 * `context: true` on the outside nodes; `subject` itself has no parent.
 */
export function clusterView(index, subject, expanded, opts = {}) {
  const open = new Set(expanded);
  for (const a of ancestorsOf(index, subject)) open.add(a);
  open.add(subject);
  const g = overviewGraph(index, open, opts);
  const inside = (id) => id === subject || ancestorsOf(index, id).includes(subject);
  const edges = g.edges.filter((e) => inside(e.source) || inside(e.target));
  const linked = new Set();
  for (const e of edges) { linked.add(e.source); linked.add(e.target); }
  const nodes = [];
  for (const n of g.nodes) {
    if (inside(n.id)) nodes.push({ ...n, parent: n.id === subject ? null : n.parent });
    else if (linked.has(n.id)) nodes.push({ ...n, parent: null, expanded: false, context: true });
  }
  return { nodes, edges };
}

/**
 * Invisible layout-only edges for an overview: inside each open cluster,
 * the children with no drawn edge at all (e.g. the [AK25] items while
 * their links are hidden) are chained into a grid of `columns` so a layered
 * layout stacks them in rows instead of one screen-wide row.
 */
export function gridHelperEdges(graph, { maxColumns = 7 } = {}) {
  const degree = new Map();
  for (const e of graph.edges) {
    degree.set(e.source, (degree.get(e.source) || 0) + 1);
    degree.set(e.target, (degree.get(e.target) || 0) + 1);
  }
  const loneByParent = new Map();
  for (const n of graph.nodes) {
    if (!n.parent || n.expanded || degree.get(n.id)) continue;
    if (!loneByParent.has(n.parent)) loneByParent.set(n.parent, []);
    loneByParent.get(n.parent).push(n.id);
  }
  const helpers = [];
  for (const ids of loneByParent.values()) {
    if (ids.length < 3) continue;
    const cols = Math.min(maxColumns, Math.max(2, Math.ceil(Math.sqrt(ids.length * 0.6))));
    for (let i = 0; i + cols < ids.length; i++) helpers.push({ source: ids[i], target: ids[i + cols] });
  }
  return helpers;
}

// ---------------------------------------------------------------------------
// Essentials (tasks/p17-essentials.md): the major results and the proof skeleton
// ---------------------------------------------------------------------------

/** The section (L0 box) holding `id` in the paper, or null (a top-level theorem). */
export function sectionOf(index, id) {
  const seen = new Set();
  for (let cur = id; cur && !seen.has(cur); cur = (index.nodes.get(cur) || {}).paperParent) {
    seen.add(cur);
    const n = index.nodes.get(cur);
    if (n && n.kind === 'section') return cur;
  }
  return null;
}

/** The section band a major result sits in on the essentials map: its own section,
 * or for a top-level theorem the section holding its proof (Theorem A: Section 5). */
export function bandOf(index, id) {
  const own = sectionOf(index, id);
  if (own) return own;
  const home = index.proofHome.get(id);
  return home ? sectionOf(index, home) : null;
}

/**
 * The essentials whole map: the major results, each inside its section band
 * (bandOf), joined by the build's reduced proof skeleton. Returns
 *   nodes: [{id, parent, band}]  -- bands first, in paper order
 *   edges: [{source, target, kind: 'skeleton', via}]  -- as drawn: used -> user
 */
export function essentialsMap(index) {
  const major = [...index.nodes.values()].filter((n) => n.tier === 'major').map((n) => n.id);
  const bands = new Set();
  const items = major.map((id) => {
    const band = bandOf(index, id);
    if (band) bands.add(band);
    return { id, parent: band, band: false };
  });
  const bandNodes = [...index.nodes.keys()].filter((id) => bands.has(id)).map((id) => ({ id, parent: null, band: true }));
  const shown = new Set(major);
  const edges = index.skeleton
    .filter((s) => shown.has(s.from) && shown.has(s.to))
    .map((s) => ({
      source: s.from, target: s.to, kind: 'skeleton', via: s.via || [],
    }));
  return { nodes: [...bandNodes, ...items], edges };
}

/**
 * Positions for the essentials whole map, so that it reads like text: one row per
 * section band, the bands top to bottom in the order the proof runs through them
 * (by the earliest skeleton depth of their results, then paper order), and inside a
 * band its results left to right by skeleton depth -- results of equal depth stacked
 * in one column, so no arrow runs along a row behind another box. Each row is centred,
 * then slid (within the widest row's extent) towards the results above that it uses,
 * to keep the arrows between bands short. `sizeOf(id)` -> {w, h}. Returns Map id ->
 * {x, y} for the results (a band's box follows from its results).
 */
export function essentialsLayout(graph, sizeOf, { colGap = 20, rowGap = 46, stackGap = 12 } = {}) {
  const items = graph.nodes.filter((n) => !n.band);
  const order = new Map(graph.nodes.map((n, i) => [n.id, i]));
  // Longest path from a source along the (acyclic) skeleton.
  const depth = new Map(items.map((n) => [n.id, 0]));
  for (let pass = 0; pass < items.length; pass++) {
    let changed = false;
    for (const e of graph.edges) {
      if (!depth.has(e.source) || !depth.has(e.target)) continue;
      const d = depth.get(e.source) + 1;
      if (d > depth.get(e.target)) { depth.set(e.target, d); changed = true; }
    }
    if (!changed) break;
  }
  const rows = new Map();
  for (const n of items) {
    const key = n.parent || n.id;
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(n.id);
  }
  const byDepthThenPaper = (a, b) => (depth.get(a) - depth.get(b)) || (order.get(a) - order.get(b));
  const list = [...rows.entries()].map(([key, ids]) => ({ key, ids: ids.sort(byDepthThenPaper) }));
  list.sort((a, b) => (depth.get(a.ids[0]) - depth.get(b.ids[0])) || (order.get(a.key) - order.get(b.key)));
  // Each row: columns of equal depth.
  for (const row of list) {
    row.cols = [];
    for (const id of row.ids) {
      const last = row.cols[row.cols.length - 1];
      if (last && depth.get(last.ids[0]) === depth.get(id)) last.ids.push(id);
      else row.cols.push({ ids: [id] });
    }
    for (const col of row.cols) {
      const sizes = col.ids.map((id) => sizeOf(id));
      col.sizes = sizes;
      col.w = Math.max(...sizes.map((z) => z.w));
      col.h = sizes.reduce((sum, z) => sum + z.h, 0) + stackGap * (sizes.length - 1);
    }
    row.w = row.cols.reduce((sum, c) => sum + c.w, 0) + colGap * (row.cols.length - 1);
    row.h = Math.max(...row.cols.map((c) => c.h));
  }
  const widest = Math.max(...list.map((r) => r.w));
  const into = new Map();
  for (const e of graph.edges) {
    if (!into.has(e.target)) into.set(e.target, []);
    into.get(e.target).push(e.source);
  }
  const pos = new Map();
  let top = 0;
  for (const row of list) {
    const local = new Map();
    let x = -row.w / 2;
    for (const col of row.cols) {
      let y = top + (row.h - col.h) / 2;
      col.ids.forEach((id, i) => {
        local.set(id, { x: x + col.w / 2, y: y + col.sizes[i].h / 2 });
        y += col.sizes[i].h + stackGap;
      });
      x += col.w + colGap;
    }
    const pulls = [];
    for (const id of row.ids) {
      for (const src of into.get(id) || []) if (pos.has(src)) pulls.push(pos.get(src).x - local.get(id).x);
    }
    const room = (widest - row.w) / 2;
    const shift = pulls.length ? Math.max(-room, Math.min(room, pulls.reduce((a, b) => a + b, 0) / pulls.length)) : 0;
    for (const [id, p] of local) pos.set(id, { x: p.x + shift, y: p.y });
    top += row.h + rowGap;
  }
  return pos;
}

/**
 * The index an opened section uses in the essentials view: `data` without its
 * background results (definitions) and plain external leaves -- the [AK25] layer
 * stays, behind its own toggle -- and without the sections/subsections that
 * removal leaves empty.
 */
export function essentialsIndex(data) {
  const all = { ...(data.nodes || {}), ...(data.externalNodes || {}) };
  const kids = new Map();
  for (const n of Object.values(all)) {
    if (!n.parent || !all[n.parent]) continue;
    if (!kids.has(n.parent)) kids.set(n.parent, []);
    kids.get(n.parent).push(n.id);
  }
  const hiddenLeaf = (n) => n.tier === 'background' && !isAkhcNode(n);
  const memo = new Map();
  const hidden = (id, depth = 0) => {
    if (memo.has(id)) return memo.get(id);
    const n = all[id];
    let h = hiddenLeaf(n);
    const ks = kids.get(id);
    if (!h && ks && ks.length && (n.kind === 'section' || n.kind === 'subsection') && depth < 32) {
      h = ks.every((k) => hidden(k, depth + 1));
    }
    memo.set(id, h);
    return h;
  };
  const keep = (obj) => Object.fromEntries(Object.entries(obj || {}).filter(([id]) => !hidden(id)));
  const nodes = keep(data.nodes);
  const externalNodes = keep(data.externalNodes);
  const has = (id) => id in nodes || id in externalNodes;
  return buildGraphIndex({
    ...data,
    nodes,
    externalNodes,
    edges: (data.edges || []).filter((e) => has(e.from) && has(e.to)),
  });
}

/**
 * An opened cluster in the essentials view: its visible contents and the arrows
 * among them, exactly as clusterView draws them, without the outside context --
 * the closed boxes and results elsewhere that its contents link to, whose many
 * long thin arrows would bury the section's own. (A result's focus still shows
 * everything it uses and everything using it.) Same shape as clusterView.
 */
export function essentialsClusterView(index, subject, expanded, opts = {}) {
  const g = clusterView(index, subject, expanded, opts);
  const nodes = g.nodes.filter((n) => !n.context);
  const shown = new Set(nodes.map((n) => n.id));
  return { nodes, edges: g.edges.filter((e) => shown.has(e.source) && shown.has(e.target)) };
}

/** Every cluster inside `id` (not `id` itself), in `index`. */
export function clustersInside(index, id) {
  const out = [];
  const stack = [...(index.children.get(id) || [])];
  while (stack.length) {
    const c = stack.pop();
    if (!index.clusters.has(c)) continue;
    out.push(c);
    stack.push(...(index.children.get(c) || []));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Focus: one result and its neighbourhood
// ---------------------------------------------------------------------------

/** Display group within a column: results of the paper first, then
 * sections/subsections, then [AK25] items last. */
function groupOf(index, id) {
  const n = index.nodes.get(id);
  if (n.akhc) return 2;
  if (index.clusters.has(id)) return 1;
  return 0;
}

/**
 * `focusId` with its direct uses (side 'uses', the edges it starts) and
 * what directly uses it (side 'usedBy'), and with `hops` = 2 one more step
 * out on each side. Returns
 *   nodes: [{id, side: 'focus'|'uses'|'usedBy', dist, group, rank}]
 *   edges: [{source, target, kind, dist}]  -- as drawn: used -> user
 * where `rank` orders a column top to bottom and `dist` of an edge is the
 * distance of its outer end. Only edges between consecutive columns of
 * the same side are kept (no edges across the focus, none within a
 * column). The second step never widens from a section/subsection or an
 * [AK25] item, and brings in [AK25] items only with `showAkhc` on; [AK25]
 * items directly linked to the focus always show.
 */
export function focusGraph(index, focusId, { hops = 1, showAkhc = false } = {}) {
  if (!index.nodes.has(focusId)) return { nodes: [], edges: [] };
  const placed = new Map([[focusId, { id: focusId, side: 'focus', dist: 0, group: groupOf(index, focusId), rank: 0 }]]);
  const edges = [];
  for (const side of ['uses', 'usedBy']) {
    let frontier = [focusId];
    for (let d = 1; d <= hops; d++) {
      const layer = new Map(); // id -> {firstParentRank, order}
      let order = 0;
      frontier.forEach((src, parentRank) => {
        if (d > 1 && (index.clusters.has(src) || index.nodes.get(src).akhc)) return;
        const list = side === 'uses' ? (index.out.get(src) || []) : (index.in.get(src) || []);
        for (const e of list) {
          const id = side === 'uses' ? e.to : e.from;
          if (id === focusId) continue;
          if (d > 1 && index.nodes.get(id).akhc && !showAkhc) continue;
          const prev = placed.get(id);
          if (prev && !(prev.side === side && prev.dist === d)) continue;
          if (!layer.has(id)) layer.set(id, { firstParentRank: parentRank, order: order++ });
          // drawn used -> user: on the uses side `src` uses `id`
          edges.push(side === 'uses'
            ? { source: id, target: src, kind: e.kind, dist: d }
            : { source: src, target: id, kind: e.kind, dist: d });
          if (!prev) placed.set(id, { id, side, dist: d, group: groupOf(index, id), rank: 0 });
        }
      });
      const ids = [...layer.keys()].sort((a, b) => {
        const ga = placed.get(a).group;
        const gb = placed.get(b).group;
        if (ga !== gb) return ga - gb;
        const la = layer.get(a);
        const lb = layer.get(b);
        if (la.firstParentRank !== lb.firstParentRank) return la.firstParentRank - lb.firstParentRank;
        return la.order - lb.order;
      });
      ids.forEach((id, i) => { placed.get(id).rank = i; });
      frontier = ids;
      if (frontier.length === 0) break;
    }
  }
  return { focusId, nodes: [...placed.values()], edges };
}

/**
 * Column positions for a focusGraph: the focus at (0, 0), what it uses in
 * columns to the left (one column per step), what uses it to the right --
 * so arrows run left to right, ingredient -> focus -> consequence.
 * A column taller than `maxRows` wraps into side-by-side sub-columns, and
 * [AK25] items start a sub-column of their own. Sub-columns of one column
 * are offset by a small stagger, so a horizontal edge into a far sub-column
 * passes between the nodes of a near one. `focusName` (the focused result's
 * own number/title), when given, names it in the two innermost captions
 * ("What Prop 2.1 uses", "What uses Prop 2.1") so the columns layout reads
 * on its own, without the generic "Uses"/"Used by".
 *
 * `sizeOf(id)` -> {w, h}, the node's own real box size (site/graphnav.mjs
 * measures it with cytoscape's `layoutDimensions` after the elements are
 * added, the same way essentialsLayout does) -- spacing is computed from
 * actual sizes, not a fixed row pitch, so a taller box (e.g. a 3-line
 * theorem) never overlaps its neighbour above or below (a fixed-row-pitch
 * version of this once let a tall box do exactly that). A header's `topY`
 * is its column's own top edge, real sizes included; site/graphnav.mjs
 * (layoutFocus) turns that into a final `y` once it also knows the header's
 * own real height (its caption can wrap to more than one line), so a
 * caption always clears its column's top box, however tall either is.
 * Returns
 *   positions: Map id -> {x, y}
 *   headers:   [{id, label, x, topY}]  (column captions)
 */
export function focusLayout(graph, {
  sizeOf = () => ({ w: 160, h: 40 }), focusName = null, rowGap = 12, subGap = 24, colGap = 62, staggerStep = 20, maxRows = 13,
} = {}) {
  const positions = new Map();
  const headers = [];
  const focus = graph.nodes.find((n) => n.side === 'focus');
  if (!focus) return { positions, headers };
  positions.set(focus.id, { x: 0, y: 0 });
  /** `ids` in `n` near-equal chunks of at most maxRows. */
  const chunk = (ids) => {
    const n = Math.ceil(ids.length / maxRows);
    const size = Math.ceil(ids.length / Math.max(1, n));
    const out = [];
    for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
    return out;
  };
  for (const side of ['uses', 'usedBy']) {
    const dir = side === 'uses' ? -1 : 1;
    const sideNodes = graph.nodes.filter((n) => n.side === side);
    const maxDist = sideNodes.reduce((m, n) => Math.max(m, n.dist), 0);
    let edge = sizeOf(focus.id).w / 2; // distance from x=0 to the near edge of the next column
    for (let d = 1; d <= maxDist; d++) {
      const col = sideNodes.filter((n) => n.dist === d).sort((a, b) => a.rank - b.rank);
      const paper = col.filter((n) => n.group !== 2).map((n) => n.id);
      const ak = col.filter((n) => n.group === 2).map((n) => n.id);
      // One sub-column when everything fits; otherwise the paper's results
      // and the [AK25] items wrap separately, [AK25] further out.
      const subs = col.length <= maxRows
        ? [{ group: paper.length ? 0 : 2, ids: [...paper, ...ak] }]
        : [...chunk(paper).map((ids) => ({ group: 0, ids })), ...chunk(ak).map((ids) => ({ group: 2, ids }))];
      // Sub-column j is stacked by each item's own real height (never a fixed
      // pitch), centred on the column, then nudged down by a small stagger so
      // an edge into a far sub-column threads between a near one's boxes.
      let cursor = edge + colGap;
      subs.forEach((sub, j) => {
        const sizes = sub.ids.map((id) => sizeOf(id));
        const subW = Math.max(...sizes.map((z) => z.w));
        const x = dir * (cursor + subW / 2);
        const totalH = sizes.reduce((sum, z) => sum + z.h, 0) + rowGap * (sizes.length - 1);
        const stagger = j * staggerStep;
        let y = -totalH / 2 + stagger;
        sub.ids.forEach((id, i) => {
          const h = sizes[i].h;
          positions.set(id, { x, y: y + h / 2 });
          y += h + rowGap;
        });
        sub.x = x;
        sub.top = -totalH / 2 + stagger; // the sub-column's own top edge
        cursor += subW + subGap;
      });
      const topY = Math.min(...subs.map((s) => s.top));
      const paperSubs = subs.filter((s) => s.group !== 2);
      const akSubs = subs.filter((s) => s.group === 2);
      // The first column names the focused result directly ("What Prop 2.1
      // uses"/"What uses Prop 2.1"); a second step further stays generic.
      const caption = side === 'uses'
        ? (d === 1 ? (focusName ? `What ${focusName} uses ←` : 'Uses') : 'Uses, one step further')
        : (d === 1 ? (focusName ? `→ What uses ${focusName}` : 'Used by') : 'Used by, one step further');
      if (paperSubs.length) {
        const x0 = paperSubs[0].x;
        const x1 = paperSubs[paperSubs.length - 1].x;
        headers.push({
          id: `hdr:${side}:${d}`, label: caption, x: (x0 + x1) / 2, topY,
        });
      }
      if (akSubs.length) {
        const x0 = akSubs[0].x;
        const x1 = akSubs[akSubs.length - 1].x;
        headers.push({
          id: `hdr:${side}:${d}:akhc`, label: paperSubs.length ? '[AK25]' : `${caption}: [AK25]`, x: (x0 + x1) / 2, topY,
        });
      }
      edge = cursor - subGap; // the far edge actually reached by this column
    }
  }
  return { positions, headers };
}

// ---------------------------------------------------------------------------
// Viewport and zoom maths
// ---------------------------------------------------------------------------

/** Pan (one axis) that centres `want` (model units, at `zoom`) within
 * [nearPad, size - farPad] when the box (lo0..hi0) fits there; otherwise
 * anchors its near edge (lo0) to nearPad, so that edge never crosses out of
 * view even though the far edge then overflows (tasks/p18-legend.md: used
 * where a specific edge -- a whole map's band labels, a focus's left-column
 * caption -- must never be the one that goes offscreen). */
function clampOrAnchorNear(mid, size, nearPad, farPad, lo0, hi0, want, zoom) {
  const least = nearPad - lo0 * zoom;
  const most = size - farPad - hi0 * zoom;
  if (least <= most) return Math.min(most, Math.max(least, mid - want * zoom));
  return least;
}

/** `padding` as a number or {top, right, bottom, left}. */
function insetsOf(padding) {
  if (typeof padding === 'number') return { top: padding, right: padding, bottom: padding, left: padding };
  return {
    top: 0, right: 0, bottom: 0, left: 0, ...padding,
  };
}

/**
 * The {zoom, pan} that shows bounding box `bb` ({x1, y1, x2, y2}) in a
 * `width` x `height` viewport inside `padding` (a number, or per side for
 * controls overlaid on the canvas), clamped to [minZoom, maxZoom]. With
 * `prefer` ({x, y}) the view is shifted towards that point as far as it
 * can go while the whole box stays in view. With `readable`, the zoom never
 * drops below it: if the box does not fit at that zoom, the view is
 * centred on `prefer` (or the box) and the rest overflows.
 */
export function viewportFor(bb, width, height, {
  padding = 30, minZoom = ZOOM.min, maxZoom = ZOOM.fitMax, prefer = null, readable = null,
} = {}) {
  const pad = insetsOf(padding);
  const availW = Math.max(1, width - pad.left - pad.right);
  const availH = Math.max(1, height - pad.top - pad.bottom);
  const bw = Math.max(1, bb.x2 - bb.x1);
  const bh = Math.max(1, bb.y2 - bb.y1);
  let zoom = Math.min(availW / bw, availH / bh);
  zoom = Math.min(maxZoom, Math.max(minZoom, zoom));
  const midX = pad.left + availW / 2;
  const midY = pad.top + availH / 2;
  const centre = prefer || { x: (bb.x1 + bb.x2) / 2, y: (bb.y1 + bb.y2) / 2 };
  if (readable != null && zoom < readable) {
    zoom = Math.min(maxZoom, Math.max(minZoom, readable));
    return { zoom, pan: { x: midX - centre.x * zoom, y: midY - centre.y * zoom } };
  }
  const axis = (mid, size, nearPad, farPad, lo0, hi0, want) => {
    const centred = mid - ((lo0 + hi0) / 2) * zoom;
    if (!prefer) return centred;
    const least = nearPad - lo0 * zoom; // the box's near edge sits on the near padding
    const most = size - farPad - hi0 * zoom; // its far edge sits on the far padding
    if (least > most) return centred;
    return Math.min(most, Math.max(least, mid - want * zoom));
  };
  return {
    zoom,
    pan: {
      x: axis(midX, width, pad.left, pad.right, bb.x1, bb.x2, centre.x),
      y: axis(midY, height, pad.top, pad.bottom, bb.y1, bb.y2, centre.y),
    },
  };
}

/**
 * Where the outside context of an opened cluster goes, around the
 * cluster's laid-out box `box` ({x1, y1, x2, y2}): nodes whose drawn
 * arrows all point into the cluster ('in': what its contents use) in a row
 * above it, nodes the arrows all point out to ('out': what uses its
 * contents) in a row below, and nodes linked both ways ('both') in columns
 * at the sides -- so the view reads top to bottom like the map. Each row/column is ordered
 * by `anchor` (the mean position of the inside nodes it links to) and
 * centred on the box. `items`: [{id, w, h, dir, anchor: {x, y}}]. Returns
 * Map id -> {x, y}.
 */
export function placeContext(box, items, { gap = 24, margin = 70 } = {}) {
  const pos = new Map();
  const cx = (box.x1 + box.x2) / 2;
  const cy = (box.y1 + box.y2) / 2;
  const row = (list, y) => {
    const sorted = [...list].sort((a, b) => (a.anchor.x - b.anchor.x) || (a.id < b.id ? -1 : 1));
    const total = sorted.reduce((sum, it) => sum + it.w, 0) + gap * Math.max(0, sorted.length - 1);
    let x = cx - total / 2;
    for (const it of sorted) {
      pos.set(it.id, { x: x + it.w / 2, y });
      x += it.w + gap;
    }
  };
  const above = items.filter((it) => it.dir === 'in');
  const below = items.filter((it) => it.dir === 'out');
  const both = [...items.filter((it) => it.dir === 'both')].sort((a, b) => (a.anchor.y - b.anchor.y) || (a.id < b.id ? -1 : 1));
  const tallest = (list) => list.reduce((m, it) => Math.max(m, it.h), 0);
  row(above, box.y1 - margin - tallest(above) / 2);
  row(below, box.y2 + margin + tallest(below) / 2);
  const left = both.filter((_, i) => i % 2 === 0);
  const right = both.filter((_, i) => i % 2 === 1);
  const column = (list, side) => {
    const total = list.reduce((sum, it) => sum + it.h, 0) + gap * Math.max(0, list.length - 1);
    let y = cy - total / 2;
    for (const it of list) {
      const x = side < 0 ? box.x1 - margin - it.w / 2 : box.x2 + margin + it.w / 2;
      pos.set(it.id, { x, y: y + it.h / 2 });
      y += it.h + gap;
    }
  };
  column(left, -1);
  column(right, 1);
  return pos;
}

/**
 * Zoom factor for one wheel event: a mouse-wheel notch (~100px) zooms by
 * about 20%, a trackpad pinch (reported as a ctrl+wheel with small deltas)
 * at a matching rate per pixel of finger travel, and line/page-mode deltas
 * are converted to pixels first. Clamped per event so one fast flick never
 * jumps more than 2x.
 */
export function wheelZoomFactor({ deltaY = 0, deltaMode = 0, ctrlKey = false } = {}) {
  let px = deltaY;
  if (deltaMode === 1) px *= 16;
  else if (deltaMode === 2) px *= 400;
  const k = ctrlKey ? 0.01 : 0.0018;
  const f = Math.exp(-px * k);
  return Math.min(2, Math.max(0.5, f));
}

/**
 * The words shown on hovering a skeleton arrow `from` -> `to` (from is used to prove
 * to) that passes through the results `via` (hidden supporting results);
 * `nameOf(id)` gives a result's plain-text name.
 */
export function skeletonEdgeText(from, to, via, nameOf) {
  if (!via || !via.length) return `${nameOf(from)} is used directly in the proof of ${nameOf(to)}.`;
  const head = `${nameOf(from)} is used to prove ${nameOf(to)}`;
  const names = via.map(nameOf);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  return `${head}, via ${list}.`;
}

// ---------------------------------------------------------------------------
// Controller (DOM + cytoscape). Everything above is pure.
// ---------------------------------------------------------------------------

/** The reader's "Essentials / Everything" choice, remembered across visits; storage
 * that throws (a private window, blocked site data) just means the default. */
const VIEW_STORAGE_KEY = 'hcp-graph-view';
function readViewPreference() {
  try { return localStorage.getItem(VIEW_STORAGE_KEY); } catch { return null; }
}
function writeViewPreference(v) {
  try { localStorage.setItem(VIEW_STORAGE_KEY, v); } catch { /* not remembered */ }
}

/** Whether the reader collapsed the graph legend, remembered the same way. */
const LEGEND_STORAGE_KEY = 'hcp-legend-collapsed';
function readLegendCollapsed() {
  try { return localStorage.getItem(LEGEND_STORAGE_KEY) === '1'; } catch { return false; }
}
function writeLegendCollapsed(v) {
  try { localStorage.setItem(LEGEND_STORAGE_KEY, v ? '1' : '0'); } catch { /* not remembered */ }
}

function truncate(s, max) {
  const t = String(s || '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:–-]+$/, '')}…`;
}

/** The graph label for a node: its number, then its title on a second
 * line (shortened), and for a closed cluster how much it holds. */
export function nodeLabel({ number, title }, { maxTitle = 30, childCount = 0, collapsedCluster = false, akhcCluster = false } = {}) {
  const lines = [];
  if (number) lines.push(number);
  if (title && title !== number) lines.push(truncate(title, maxTitle));
  if (!lines.length) lines.push('?');
  if (collapsedCluster && childCount) {
    lines.push(akhcCluster ? `${childCount} cited items  +` : `${childCount} ${childCount === 1 ? 'part' : 'parts'}  +`);
  }
  return lines.join('\n');
}

function nodeClasses(n) {
  const classes = [`lvl-${n.level}`];
  if (n.level === 'L0' && n.kind !== 'section' && n.kind !== 'external') classes.push('theorem');
  else classes.push(`kind-${n.kind}`);
  if (n.cluster) classes.push(`cluster-${n.cluster}`);
  if (n.lean) classes.push('lean');
  return classes;
}

/** `fontGen` > 0 adds a never-installed family name to the stack: it changes
 * nothing on screen, but gives every label a new style key, so cytoscape
 * re-measures and redraws labels it cached before the web font arrived. */
/** A filled check-circle in `color`, as a data URI (the Lean badge on a graph box). */
export function leanCheckSvg(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 20 20"><circle cx="10" cy="10" r="9" fill="${color}" stroke="#ffffff" stroke-width="1.5"/><path d="M5.6 10.4l2.9 2.9 5.9-6.2" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function buildStylesheet(cssVar, fontGen = 0) {
  const font = `IBM Plex Sans, ${fontGen ? `hcp-font-${fontGen}, ` : ''}system-ui, sans-serif`;
  return [
    { selector: 'node', style: {
      shape: 'round-rectangle',
      'background-color': cssVar('--surface'),
      'border-width': 1.5,
      'border-color': cssVar('--border'),
      label: 'data(label)',
      color: cssVar('--text'),
      'font-family': font,
      'font-size': 12,
      'line-height': 1.3,
      'text-valign': 'center',
      'text-halign': 'center',
      'text-wrap': 'wrap',
      'text-max-width': '150px',
      padding: '8px',
      width: 'label',
      height: 'label',
      'transition-property': 'opacity',
      'transition-duration': '150ms',
    } },
    { selector: 'node.lvl-L0, node.lvl-L1', style: { 'font-size': 15 } },
    { selector: 'node.lvl-L0', style: { 'font-weight': 600 } },
    { selector: 'node.theorem', style: { 'background-color': cssVar('--accent'), color: cssVar('--surface'), 'border-color': cssVar('--accent-strong') } },
    // Box geometry (width/text-max-width) is keyed on tier/kind alone below, never on
    // which view drew the element, so a box is the same size everywhere it appears:
    // the whole map, an opened section, a focus, Full graph. ":childless" guards a
    // kind that can also be an opened (":parent") cluster -- section, subsection, the
    // [AK25] container -- whose own size must stay free to fit its children.
    { selector: 'node.kind-section', style: { 'background-color': cssVar('--surface-2'), 'border-color': cssVar('--text-faint') } },
    { selector: 'node.kind-section:childless', style: { width: 188, 'text-max-width': '172px' } },
    { selector: 'node.kind-subsection', style: { 'background-color': cssVar('--surface'), 'border-style': 'dashed', 'border-color': cssVar('--text-faint') } },
    { selector: 'node.kind-subsection:childless', style: { width: 172, 'text-max-width': '158px' } },
    { selector: 'node.lvl-L2', style: {
      'background-color': cssVar('--accent-2-tint'), 'border-color': cssVar('--accent-2'), width: 156, 'text-max-width': '142px',
    } },
    { selector: 'node.collapsed', style: { 'border-width': 2.5 } },
    // Lean-formalized: a green check-circle on the box's top-right corner.
    { selector: 'node.lean', style: {
      'background-image': leanCheckSvg(cssVar('--lean')),
      'background-width': 18, 'background-height': 18,
      'background-position-x': '100%', 'background-position-y': '0%',
      'background-offset-x': 9, 'background-offset-y': -9,
      'background-clip': 'none', 'background-image-containment': 'over', 'bounds-expansion': 10,
      'background-image-opacity': 1,
    } },
    { selector: 'node.context', style: { opacity: 0.72, 'border-width': 1.5 } },
    { selector: 'node:parent', style: {
      'text-valign': 'top', 'text-halign': 'center', 'text-margin-y': -4, 'text-events': 'yes',
      'background-opacity': 0.4, padding: '18px', 'font-size': 14, 'font-weight': 600,
    } },
    // A halo (the pane's own background) and a z-index above the skeleton
    // arrows, so a band label stays legible even where an arrow runs behind
    // it (tasks/p18-legend.md: labels sit outside the bands, in the arrows'
    // own area, and a long arrow can cross that margin).
    { selector: 'node.band-label', style: {
      shape: 'rectangle', 'background-opacity': 1, 'background-color': cssVar('--bg'), 'border-width': 0,
      width: 'label', height: 'label', padding: '3px', 'font-size': 13, 'font-weight': 600,
      color: cssVar('--text-dim'), 'text-max-width': '120px', 'z-index': 10,
    } },
    { selector: 'node.band', style: {
      'background-color': cssVar('--surface'), 'background-opacity': 0.5, 'border-width': 1, 'border-style': 'solid',
      'border-color': cssVar('--border'), color: cssVar('--text-dim'), 'font-size': 13, 'font-weight': 600, padding: '14px',
      'text-max-width': '600px', 'text-wrap': 'none',
    } },
    // Tiers (tasks/p17-essentials.md): major results stand out (bold, a thicker
    // border in the theorem colour, a wider box); definitions, external inputs and
    // the [AK25] layer are small grey boxes. Applied everywhere (not just Main
    // results), so a result's box looks the same wherever it is drawn.
    { selector: 'node.ess-major', style: { 'border-width': 3, 'border-color': cssVar('--accent'), 'font-weight': 700, width: 176, 'text-max-width': '162px' } },
    // A major result's own font-size, even an L2 one (base font-size is 12,
    // node.lvl-L0/L1's 15 already covers a theorem) -- tasks/p18-legend.md:
    // at the whole map's fitted zoom this must still read at >= 11px.
    { selector: 'node.ess-major.lvl-L2', style: { 'background-color': cssVar('--surface'), color: cssVar('--text'), 'font-size': 15 } },
    { selector: 'node.ess-major.theorem', style: { 'border-color': cssVar('--accent-strong') } },
    { selector: 'node.ess-background', style: {
      'background-color': cssVar('--surface-2'), 'border-color': cssVar('--border'), 'border-width': 1,
      color: cssVar('--text-dim'), 'font-size': 11, 'font-weight': 400,
    } },
    { selector: 'node.ess-background:childless', style: { width: 138, 'text-max-width': '122px', padding: '5px' } },
    // The [AK25] layer's own colours (external input italic-dotted; a quoted [AK25]
    // item or a Background node, tinted) come after ess-background, so a citation or
    // a Background node keeps its own colour even where it is also sized/dimmed as
    // background context (e.g. flanking a focus) -- only a plain definition, with no
    // colour of its own, actually shows ess-background's grey.
    { selector: 'node.lvl-ext', style: { 'border-style': 'dotted', 'border-width': 2, 'border-color': cssVar('--text-faint'), 'background-color': cssVar('--surface'), 'font-style': 'italic' } },
    { selector: 'node.cluster-akhc', style: { 'background-color': cssVar('--akhc-tint'), 'border-color': cssVar('--akhc'), 'border-style': 'dotted' } },
    { selector: 'node.kind-akhc', style: { 'background-color': cssVar('--akhc-tint'), 'border-color': cssVar('--akhc'), 'border-style': 'dotted', 'font-style': 'normal' } },
    { selector: 'node.kind-background', style: { 'background-color': cssVar('--background-node-tint'), 'border-color': cssVar('--background-node'), 'border-style': 'dashed', 'font-style': 'normal' } },
    // The focused box in a column layout: an outline overlay only (like
    // .is-selected below) -- its fill/border/width/font stay whatever its own
    // tier/kind gives it, so it is recognisable as the same box the map showed.
    { selector: 'node.focus', style: {
      'border-width': 3, 'border-color': cssVar('--focus-ring'),
      'underlay-color': cssVar('--focus-ring'), 'underlay-opacity': 0.16, 'underlay-padding': 7, 'underlay-shape': 'round-rectangle',
    } },
    { selector: 'node.header', style: {
      shape: 'rectangle', 'background-opacity': 0, 'border-width': 0, 'font-size': 12, 'font-weight': 600,
      'text-transform': 'uppercase', color: cssVar('--text-dim'), events: 'no', width: 'label', height: 'label', padding: '2px',
    } },
    { selector: 'node.is-selected', style: {
      'border-width': 3, 'border-color': cssVar('--focus-ring'),
      'underlay-color': cssVar('--focus-ring'), 'underlay-opacity': 0.16, 'underlay-padding': 6, 'underlay-shape': 'round-rectangle',
    } },
    { selector: 'edge', style: {
      width: 1.6,
      'line-color': cssVar('--text-dim'),
      'target-arrow-color': cssVar('--text-dim'),
      'target-arrow-shape': 'triangle',
      'arrow-scale': 0.9,
      'curve-style': 'bezier',
      opacity: 0.8,
      'transition-property': 'opacity, line-color, width',
      'transition-duration': '150ms',
    } },
    // One arrow style for every dependency ("A is used in the proof of B"): no width,
    // shade or dash variations -- the authors found unexplained variations confusing.
    // Only the orange hover/selection highlight and fading differ (both in the legend).
    { selector: 'edge.mutual', style: { 'source-arrow-shape': 'triangle', 'source-arrow-color': cssVar('--text-dim') } },
    // Edges at the focus bend on a shared trunk next to it: out of the focus
    // (to what uses it) turn near their source, into it (from what it
    // uses) near their target.
    { selector: 'edge.f-out', style: { 'curve-style': 'taxi', 'taxi-direction': 'rightward', 'taxi-turn': '30px', 'taxi-radius': 10, 'taxi-turn-min-distance': 6 } },
    { selector: 'edge.f-in', style: { 'curve-style': 'taxi', 'taxi-direction': 'rightward', 'taxi-turn': '-30px', 'taxi-radius': 10, 'taxi-turn-min-distance': 6 } },
    { selector: 'edge.layout-helper', style: { visibility: 'hidden', events: 'no' } },
    // A main-results arrow is straight unless a straight line would run through a
    // third box (layoutOverview sets .bowed), so it stays visible as its own arrow.
    { selector: 'edge.skeleton.bowed', style: {
      'curve-style': 'unbundled-bezier', 'control-point-distances': [100], 'control-point-weights': [0.5],
    } },
    { selector: 'edge.ctx-edge', style: { opacity: 0.4 } },
    { selector: 'node.faded', style: { opacity: 0.25 } },
    { selector: 'edge.faded', style: { opacity: 0.1 } },
    { selector: 'edge.hl', style: {
      'line-color': cssVar('--accent'), 'target-arrow-color': cssVar('--accent'), 'source-arrow-color': cssVar('--accent'), width: 2.4, opacity: 1, 'z-index': 10,
    } },
  ];
}

/**
 * Drive one cytoscape instance. `opts`:
 *   cytoscape  -- the library (window.cytoscape)
 *   container  -- the #cy element
 *   pane       -- the element holding the canvas and its controls
 *   data       -- the app's data object
 *   labelOf(id) -> {number, title} as plain text
 *   cssVar(name) -> current value of a theme token
 *   navigate(id) -- open `id` in the reading panel (updates the route)
 *   onWholeMap() -- optional; the "Whole map" button was clicked (updates
 *     the route to make it a history step -- tasks/p16 "Back" button).
 *     Falls back to the plain internal wholeMap() when not given (e.g. a
 *     bare controller in a test), so the button still works either way.
 * Views: the whole map (L0, everything closed); an opened cluster
 * (clusterView: its contents, with sub-clusters opened in place, and its
 * direct outside links as context); a result's focus (focusGraph).
 * In "Main results" (the default, tasks/p17-essentials.md; internally still called
 * "essentials") the whole map is the major results in section bands joined by the
 * proof skeleton, and an opened section leaves out its definitions; "Full graph"
 * (internally "everything") draws every result, definition and link. A node's own
 * box style (fill, border, width, font) is the same in both, and in a focus, an
 * opened cluster or a band on the map: only the tier/kind classes below decide it,
 * never which view drew the element. The choice is remembered (localStorage).
 * Returns {show(id|null), wholeMap(selectedId?), setHops(n), setShowAkhc(bool),
 * setEssentials(bool), isEssentials(),
 * zoomBy(f), fit(), zoomToSelection(), resize(), refreshStyle(), cy}.
 */
export function createGraphController(opts) {
  const {
    cytoscape, container, pane, data, labelOf, cssVar, navigate, onWholeMap,
  } = opts;
  const index = buildGraphIndex(data);
  // Essentials (tasks/p17-essentials.md): an opened section drawn without its
  // definitions, from an index built without them (lazily, on first use).
  let essIdx = null;
  const essIndex = () => essIdx || (essIdx = essentialsIndex(data));
  const cy = cytoscape({
    container,
    elements: [],
    style: buildStylesheet(cssVar),
    minZoom: ZOOM.min,
    maxZoom: ZOOM.max,
    boxSelectionEnabled: false,
    autounselectify: true,
    autoungrabify: true,
  });

  const st = {
    mode: 'overview', // 'overview' (whole map or an opened cluster) | 'focus'
    subject: null, // overview: the opened cluster shown, or null for the whole map
    expanded: new Set(), // overview: clusters open inside the subject
    focusId: null,
    hops: 1,
    showAkhc: false,
    selectedId: null,
    hoverId: null,
    zoomTarget: null, // overview: the cluster last zoomed to
    snapshots: new Map(), // cluster id -> overview state to return to when it closes
    pendingFit: false, // a fit was asked for while the canvas had no size (phone width)
    userMoved: false, // the reader zoomed or panned since the last fit
    essentials: readViewPreference() !== 'everything', // "Main results" (the default) or "Full graph"
    legendCollapsed: readLegendCollapsed(),
  };

  /** The index the current overview is drawn from: in Essentials, an opened
   * cluster without its definitions (unless it holds nothing else, like the
   * standing definitions of Subsection 1.1: then it shows them). */
  function indexFor(subject) {
    return st.essentials && subject && essIndex().clusters.has(subject) ? essIndex() : index;
  }
  /** The clusters open when `id` is opened as a view's subject: just itself, or
   * in Essentials everything inside it too (a section shows all its results). */
  function initialExpanded(id) {
    const open = new Set([id]);
    if (st.essentials) for (const c of clustersInside(indexFor(id), id)) open.add(c);
    return open;
  }
  /** Tier classes: major/supporting/background, plus the [AK25] layer and external
   * inputs styled as background. Applied in every view (Main results and Full
   * graph alike), so a result's box looks the same wherever it is drawn. */
  function tierClasses(id) {
    const n = index.nodes.get(id);
    if (n && n.tier) return [`ess-${n.tier}`];
    return n && (n.akhc || n.kind === 'external') ? ['ess-background'] : [];
  }

  /** How much of a node's title `nodeLabel` shows before truncating, by tier/kind --
   * the same number wherever the node is drawn (the whole map, an opened section, a
   * focus, Full graph), so a box wraps/truncates identically everywhere. */
  function titleMaxFor(id) {
    const n = index.nodes.get(id);
    if (!n) return 30;
    if (n.tier === 'major') return 40;
    if (n.tier === 'background' || n.akhc || n.kind === 'external') return 26;
    return 30;
  }

  const reducedMotion = () => typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const hasSize = () => container.clientWidth > 0 && container.clientHeight > 0;
  const inside = (id, root) => id === root || ancestorsOf(index, id).includes(root);

  function raw(id) {
    return (data.nodes && data.nodes[id]) || (data.externalNodes && data.externalNodes[id]) || { id };
  }

  /** Plain-text number/title; inside an open cluster, a child's number
   * drops the cluster's own prefix ("[AK25] Lemma 2.8" -> "Lemma 2.8"). */
  function textOf(id, { inCluster = false } = {}) {
    const t = { ...(labelOf(id) || {}) };
    const n = index.nodes.get(id);
    if (inCluster && n && n.parent && t.number) {
      const prefix = (labelOf(n.parent) || {}).number;
      if (prefix && t.number.startsWith(`${prefix} `)) t.number = t.number.slice(prefix.length + 1);
    }
    return t;
  }

  // ---- building each view ---------------------------------------------------
  /** The Essentials whole map: the major results in their section bands, joined by
   * the proof skeleton (thick arrows; hovering one names the results it passes
   * through). A band is not an opened cluster: clicking it opens its section. */
  function essentialsElements() {
    const g = essentialsMap(index);
    const els = [];
    for (const n of g.nodes) {
      const t = textOf(n.id);
      if (n.band) {
        // The band's name sits in a column of row headings to the left of the map
        // (layoutOverview), where no arrow crosses it; clicking either opens the section.
        els.push({ group: 'nodes', data: { id: n.id, label: '' }, classes: 'band cluster' });
        els.push({
          group: 'nodes',
          data: { id: `band-label:${n.id}`, opens: n.id, label: [t.number, t.title].filter(Boolean).join('\n') },
          classes: 'band-label',
        });
        continue;
      }
      const classes = [...nodeClasses(raw(n.id)), ...tierClasses(n.id)];
      els.push({
        group: 'nodes',
        data: { id: n.id, parent: n.parent || undefined, label: nodeLabel(t, { maxTitle: titleMaxFor(n.id) }) },
        classes: classes.join(' '),
      });
    }
    for (const e of g.edges) {
      els.push({
        group: 'edges',
        data: {
          id: `s:${e.source}>${e.target}`, source: e.source, target: e.target, via: e.via,
        },
        classes: 'skeleton',
      });
    }
    return els;
  }

  function overviewElements() {
    if (st.essentials && !st.subject) return essentialsElements();
    const idx = indexFor(st.subject);
    const view = st.essentials && idx === essIdx ? essentialsClusterView : clusterView;
    const g = st.subject
      ? view(idx, st.subject, st.expanded, { showAkhc: st.showAkhc, mergeMutual: true })
      : overviewGraph(index, new Set(), { showAkhc: st.showAkhc, refs: false, mergeMutual: true });
    const shown = new Set(g.nodes.map((n) => n.id));
    const els = [];
    for (const n of g.nodes) {
      const classes = [...nodeClasses(raw(n.id)), ...tierClasses(n.id)];
      if (n.cluster) classes.push(n.expanded ? 'expanded' : 'collapsed', 'cluster');
      if (n.context) classes.push('context');
      const t = textOf(n.id, { inCluster: !!(n.parent && shown.has(n.parent)) });
      const label = n.expanded
        ? [t.number, t.title].filter(Boolean).join('  ')
        : nodeLabel(t, {
          maxTitle: titleMaxFor(n.id),
          childCount: (idx.children.get(n.id) || []).length,
          collapsedCluster: n.cluster,
          akhcCluster: index.nodes.get(n.id).kind === 'external',
        });
      els.push({
        group: 'nodes',
        data: { id: n.id, parent: n.parent || undefined, label },
        classes: classes.join(' '),
      });
    }
    const ctx = new Set(g.nodes.filter((n) => n.context).map((n) => n.id));
    g.edges.forEach((e) => {
      const cls = [e.kind];
      if (e.mutual) cls.push('mutual');
      if (st.essentials) cls.push('ess-edge');
      if (ctx.has(e.source) || ctx.has(e.target)) cls.push('ctx-edge');
      els.push({ group: 'edges', data: { id: `o:${e.source}>${e.target}`, source: e.source, target: e.target, count: e.count }, classes: cls.join(' ') });
    });
    gridHelperEdges(g).forEach((e) => {
      els.push({ group: 'edges', data: { id: `h:${e.source}>${e.target}`, source: e.source, target: e.target }, classes: 'layout-helper' });
    });
    return els;
  }

  /** Nodes and edges only -- no headers (column captions): those need each
   * box's real rendered size, so layoutFocus (below) adds them itself once
   * everything here is already in cy and styled. */
  function focusElements() {
    const g = focusGraph(index, st.focusId, { hops: st.hops, showAkhc: st.showAkhc });
    const els = [];
    const background = (id) => tierClasses(id).includes('ess-background');
    for (const n of g.nodes) {
      // Same tier/kind classes, same titleMaxFor as every other view -- a box
      // looks the same here as on the map or in an opened section; only its
      // position differs (set afterwards, by layoutFocus, from each box's real
      // size), and the focused box also gets the 'focus' outline.
      const classes = [...nodeClasses(raw(n.id)), ...tierClasses(n.id), `side-${n.side}`];
      if (n.side === 'focus') classes.push('focus');
      const label = nodeLabel(textOf(n.id), { maxTitle: titleMaxFor(n.id) });
      els.push({
        group: 'nodes', data: { id: n.id, label }, classes: classes.join(' '), position: { x: 0, y: 0 },
      });
    }
    g.edges.forEach((e) => {
      const cls = [e.kind];
      if (e.dist === 1) cls.push(e.source === st.focusId ? 'f-out' : 'f-in');
      if (background(e.source) || background(e.target)) cls.push('bg-edge');
      els.push({ group: 'edges', data: { id: `f:${e.source}>${e.target}`, source: e.source, target: e.target }, classes: cls.join(' ') });
    });
    return els;
  }

  /** Positions a rendered focus view from each box's own real size
   * (cytoscape's layoutDimensions, measured now that every box is added and
   * styled), then adds the column-caption headers at their computed spots --
   * tasks/p18-legend.md: a fixed row pitch once let a taller box (e.g. a
   * 3-line theorem) overlap its neighbour or a column's caption. */
  function layoutFocus() {
    const g = focusGraph(index, st.focusId, { hops: st.hops, showAkhc: st.showAkhc });
    const focusName = (() => {
      const t = textOf(st.focusId);
      const name = t.number || t.title;
      return name ? truncate(name, 24) : null;
    })();
    const sizeOf = (id) => {
      const d = cy.getElementById(id).layoutDimensions({ nodeDimensionsIncludeLabels: true });
      return { w: d.w, h: d.h };
    };
    const { positions, headers } = focusLayout(g, { sizeOf, focusName });
    for (const [id, pos] of positions) {
      const n = cy.getElementById(id);
      if (!n.empty()) n.position(pos);
    }
    // A header (column caption) is added at a placeholder y, then measured for
    // its own real height and moved to clear its column's top box by a small
    // fixed margin -- a caption can wrap to more than one line, so a fixed gap
    // sized for one line once let it overlap the box below it.
    const HEADER_MARGIN = 8;
    cy.add(headers.map((h) => ({
      group: 'nodes', data: { id: h.id, label: h.label }, classes: 'header', position: { x: h.x, y: h.topY },
    })));
    for (const h of headers) {
      const n = cy.getElementById(h.id);
      if (n.empty()) continue;
      const hh = n.layoutDimensions({ nodeDimensionsIncludeLabels: true }).h;
      n.position({ x: h.x, y: h.topY - HEADER_MARGIN - hh / 2 });
    }
  }

  function render() {
    st.hoverId = null;
    cy.stop();
    if (tipEl) tipEl.hidden = true;
    cy.batch(() => {
      cy.elements().remove();
      cy.add(st.mode === 'focus' ? focusElements() : overviewElements());
    });
    if (st.mode === 'overview') layoutOverview();
    else if (st.mode === 'focus') layoutFocus();
    markSelection();
    emphasize();
    syncControls();
  }

  const DAGRE = {
    name: 'dagre',
    rankDir: 'TB',
    ranker: 'network-simplex',
    nodeSep: 16, // tight spacing, and dummy nodes of long edges packed close
    rankSep: 38, // (edgeSep), keep the map near readable zoom when fitted
    edgeSep: 3,
    nodeDimensionsIncludeLabels: true,
    fit: false,
    animate: false,
  };

  /** The whole map: one layered layout. An opened cluster: its contents
   * laid out on their own (a layered layout, or a grid when nothing inside
   * links to anything else inside), then its outside context placed around
   * it (placeContext). */
  function layoutOverview() {
    if (!st.subject && st.essentials) {
      const leaves = cy.nodes().not(':parent');
      const pos = essentialsLayout(essentialsMap(index), (id) => {
        const d = cy.getElementById(id).layoutDimensions({ nodeDimensionsIncludeLabels: true });
        return { w: d.w, h: d.h };
      });
      leaves.forEach((n) => { if (pos.has(n.id())) n.position(pos.get(n.id())); });
      // Bow only a skeleton arrow that would otherwise run straight through a
      // third major's own box (tasks/p18-legend.md): both ends in the same
      // row (aligned y), with some other major sitting strictly between them.
      const EPS_Y = 6;
      const EPS_X = 4;
      cy.edges('.skeleton').forEach((e) => {
        const s = pos.get(e.source().id());
        const t = pos.get(e.target().id());
        let blocked = false;
        if (s && t && Math.abs(s.y - t.y) < EPS_Y) {
          const lo = Math.min(s.x, t.x);
          const hi = Math.max(s.x, t.x);
          for (const [id, p] of pos) {
            if (id === e.source().id() || id === e.target().id()) continue;
            if (Math.abs(p.y - s.y) < EPS_Y && p.x > lo + EPS_X && p.x < hi - EPS_X) { blocked = true; break; }
          }
        }
        e.toggleClass('bowed', blocked);
      });
      cy.nodes('.band').forEach((b) => {
        const label = cy.getElementById(`band-label:${b.id()}`);
        if (label.empty()) return;
        const bb = b.boundingBox();
        const w = label.layoutDimensions({ nodeDimensionsIncludeLabels: true }).w;
        label.position({ x: bb.x1 - 12 - w / 2, y: (bb.y1 + bb.y2) / 2 });
      });
      return;
    }
    if (!st.subject) {
      cy.layout(DAGRE).run();
      return;
    }
    const subj = cy.getElementById(st.subject);
    if (subj.empty()) return;
    const contents = subj.union(subj.descendants());
    const inner = cy.edges().filter((e) => contents.contains(e.source()) && contents.contains(e.target()));
    const kids = subj.children();
    if (inner.not('.layout-helper').empty() && kids.filter(':parent').empty() && kids.length >= 3) {
      kids.layout({
        name: 'grid',
        cols: Math.max(2, Math.round(Math.sqrt(kids.length * 0.45))),
        condense: true,
        avoidOverlap: true,
        avoidOverlapPadding: 18,
        nodeDimensionsIncludeLabels: true,
        boundingBox: { x1: 0, y1: 0, w: 1000, h: 1000 },
        fit: false,
        animate: false,
      }).run();
    } else {
      contents.union(inner).layout(DAGRE).run();
    }
    const ctx = cy.nodes('.context');
    if (ctx.empty()) return;
    const box = subj.boundingBox({ includeLabels: true });
    const items = ctx.map((n) => {
      // Drawn arrows (used -> user): out of `n` into the cluster means its
      // contents use `n`; a two-headed (mutual) edge counts both ways.
      const links = n.connectedEdges().filter((e) => contents.contains(e.source()) || contents.contains(e.target()));
      const into = links.filter((e) => e.source().same(n) || e.hasClass('mutual'));
      const outOf = links.filter((e) => e.target().same(n) || e.hasClass('mutual'));
      const linked = links.connectedNodes().difference(n);
      const anchor = linked.nonempty()
        ? {
          x: linked.reduce((sum, m) => sum + m.position('x'), 0) / linked.length,
          y: linked.reduce((sum, m) => sum + m.position('y'), 0) / linked.length,
        }
        : { x: (box.x1 + box.x2) / 2, y: (box.y1 + box.y2) / 2 };
      const dim = n.layoutDimensions({ nodeDimensionsIncludeLabels: true });
      let dir = 'out';
      if (into.nonempty() && outOf.nonempty()) dir = 'both';
      else if (into.nonempty()) dir = 'in';
      return {
        id: n.id(), w: dim.w, h: dim.h, dir, anchor,
      };
    });
    const pos = placeContext({
      x1: box.x1, y1: box.y1, x2: box.x2, y2: box.y2,
    }, items);
    ctx.forEach((n) => { if (pos.has(n.id())) n.position(pos.get(n.id())); });
  }

  /** Room taken on the canvas by the controls drawn over it. */
  function insets() {
    const pad = {
      top: 18, right: 18, bottom: 18, left: 18,
    };
    if (!pane) return pad;
    const r = container.getBoundingClientRect();
    const box = (sel) => {
      const el = q(sel);
      if (!el || el.offsetParent === null) return null;
      const b = el.getBoundingClientRect();
      return b.width > 0 && b.height > 0 ? b : null;
    };
    const tb = box('.graph-toolbar');
    const zm = box('.graph-zoom');
    const lg = box('.graph-legend');
    if (tb) pad.top = Math.max(pad.top, tb.bottom - r.top + 12);
    if (zm) pad.right = Math.max(pad.right, r.right - zm.left + 12);
    // The legend sits bottom-right (tasks/p18-legend.md), away from the
    // essentials whole map's band labels (left margin, outside the bands) --
    // only its height is reserved, as before; reserving its width too once
    // left the whole map with too little room to fit at a readable zoom.
    if (lg) pad.bottom = Math.max(pad.bottom, r.bottom - lg.top + 12);
    return pad;
  }

  // ---- viewport ---------------------------------------------------------------
  function setViewport(vp, animate = true) {
    if (!hasSize()) { st.pendingFit = true; return; }
    cy.stop();
    if (animate && !reducedMotion()) cy.animate({ zoom: vp.zoom, pan: vp.pan }, { duration: 260, easing: 'ease-in-out-cubic' });
    else cy.viewport({ zoom: vp.zoom, pan: vp.pan });
  }

  function bbOf(eles) {
    const b = eles.boundingBox({ includeLabels: true, includeOverlays: false });
    return { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 };
  }

  function fitView(animate = true) {
    if (!hasSize()) { st.pendingFit = true; return; }
    st.pendingFit = false;
    st.userMoved = false;
    const w = container.clientWidth;
    const h = container.clientHeight;
    if (st.mode === 'focus') {
      const f = cy.getElementById(st.focusId);
      if (f.empty()) return;
      // tasks/p18-legend.md: a focus's column captions sit above its topmost
      // box, and the focused box is always at local (0, 0). If everything
      // (both columns, both captions) already fits at a still-readable zoom
      // (>= focusMinFit, ~9px on the default font), show it all, centred as
      // usual. Otherwise, forcing zoom up to keep text readable would, under
      // plain centring, push the captions up above the pane (under the
      // toolbar, or off it) or to the side, so instead fit just the two
      // captions and the focus box itself (a much smaller box than the whole
      // view, so it fits) top-aligned -- captions visible just below the
      // toolbar, the focus centred horizontally under them -- and let the
      // (still fully drawn) boxes of both columns overflow left/right/down,
      // pannable, rather than ever cropping a caption.
      const bb = bbOf(cy.elements());
      const pad = insets();
      const availW = Math.max(1, w - pad.left - pad.right);
      const availH = Math.max(1, h - pad.top - pad.bottom);
      const bw = Math.max(1, bb.x2 - bb.x1);
      const bh = Math.max(1, bb.y2 - bb.y1);
      const natural = Math.min(ZOOM.fitMax, Math.max(ZOOM.min, Math.min(availW / bw, availH / bh)));
      if (natural >= ZOOM.focusMinFit) {
        setViewport(viewportFor(bb, w, h, { padding: pad, prefer: f.position(), maxZoom: ZOOM.fitMax }), animate);
      } else {
        const zoom = Math.min(ZOOM.fitMax, Math.max(ZOOM.min, ZOOM.focusReadable));
        const midX = pad.left + availW / 2;
        const must = bbOf(cy.nodes('.header, .focus'));
        const panX = clampOrAnchorNear(midX, w, pad.left, pad.right, must.x1, must.x2, 0, zoom);
        setViewport({ zoom, pan: { x: panX, y: pad.top - must.y1 * zoom } }, animate);
      }
      return;
    }
    const all = cy.elements().not('.layout-helper');
    if (all.empty()) return;
    const pad = insets();
    // The essentials whole map (tasks/p18-legend.md): its band labels sit in
    // the left margin, outside the bands, so at a forced (too-small-to-fit)
    // zoom a plain centred pan can push them past the left edge -- centring
    // on the bbox happens to touch it exactly at some widths, and the pane's
    // own fractional-pixel size at others pushes it a hair past 0. Anchor the
    // left edge (bb.x1, labels included -- bbOf includes labels) to the left
    // padding instead, whenever the natural fit needs forcing; only the
    // right side then overflows (pannable).
    if (!st.subject && st.essentials) {
      const bb = bbOf(all);
      const availW = Math.max(1, w - pad.left - pad.right);
      const availH = Math.max(1, h - pad.top - pad.bottom);
      const bw = Math.max(1, bb.x2 - bb.x1);
      const bh = Math.max(1, bb.y2 - bb.y1);
      const natural = Math.min(ZOOM.fitMax, Math.max(ZOOM.min, Math.min(availW / bw, availH / bh)));
      if (natural >= ZOOM.mapReadable) {
        setViewport(viewportFor(bb, w, h, { padding: pad, maxZoom: ZOOM.fitMax }), animate);
      } else {
        const zoom = Math.min(ZOOM.fitMax, Math.max(ZOOM.min, ZOOM.mapReadable));
        const midX = pad.left + availW / 2;
        const midY = pad.top + availH / 2;
        const centreX = (bb.x1 + bb.x2) / 2;
        const centreY = (bb.y1 + bb.y2) / 2;
        const panX = clampOrAnchorNear(midX, w, pad.left, pad.right, bb.x1, bb.x2, centreX, zoom);
        setViewport({ zoom, pan: { x: panX, y: midY - centreY * zoom } }, animate);
      }
      return;
    }
    const target = st.zoomTarget ? cy.getElementById(st.zoomTarget) : cy.collection();
    let vp = viewportFor(bbOf(all), w, h, { padding: pad, maxZoom: ZOOM.fitMax });
    if (target.nonempty() && (target.id() !== st.subject || vp.zoom < ZOOM.mapReadable)) {
      // An opened cluster: its own contents fill the view (context around it
      // may be cut off -- it is one pan away).
      vp = viewportFor(bbOf(target.union(target.descendants())), w, h, { padding: pad, maxZoom: ZOOM.fitMax });
    }
    setViewport(vp, animate);
  }

  function currentViewport() { return { zoom: cy.zoom(), pan: { ...cy.pan() } }; }

  // ---- selection / hover emphasis ----------------------------------------------
  /** The node standing for the selected route on the current view. */
  function selectedEle() {
    if (st.mode === 'focus') return cy.getElementById(st.focusId);
    if (!st.selectedId) return cy.collection();
    for (const id of [st.selectedId, ...ancestorsOf(index, st.selectedId).reverse()]) {
      const n = cy.getElementById(id);
      if (n.nonempty()) return n;
    }
    return cy.collection();
  }

  function markSelection() {
    cy.nodes('.is-selected').removeClass('is-selected');
    if (st.mode === 'overview') {
      const n = selectedEle();
      if (n.nonempty() && !n.isParent()) n.addClass('is-selected');
    }
  }

  function emphasize() {
    cy.batch(() => {
      cy.elements('.faded').removeClass('faded');
      cy.edges('.hl').removeClass('hl');
      let subject = st.hoverId ? cy.getElementById(st.hoverId) : cy.collection();
      if (subject.empty() && st.mode === 'overview') {
        const sel = selectedEle();
        if (sel.nonempty() && !sel.isParent()) subject = sel;
      }
      if (subject.empty() || subject.isParent() || subject.hasClass('header')) return;
      if (st.mode === 'focus' && subject.id() === st.focusId) return; // every edge on screen is already its own
      const own = subject.connectedEdges().not('.layout-helper');
      if (own.empty()) return;
      const keep = subject.union(own).union(own.connectedNodes());
      cy.nodes().not(':parent').not('.header').difference(keep).addClass('faded');
      cy.edges().not('.layout-helper').difference(own).addClass('faded');
      own.addClass('hl');
    });
  }

  // ---- mode changes ----------------------------------------------------------------
  function overviewState() {
    return {
      subject: st.subject, expanded: new Set(st.expanded), zoomTarget: st.zoomTarget, viewport: currentViewport(), ready: hasSize(),
    };
  }

  /** Open cluster `id`: in place when it sits inside the cluster already
   * shown, otherwise as the view's new subject. Either way the view zooms
   * to it, and closing it returns to the view it was opened from. */
  function openCluster(id) {
    const before = st.mode === 'overview' ? overviewState() : null;
    const inPlace = st.mode === 'overview' && st.subject && id !== st.subject && inside(id, st.subject);
    if (inPlace && st.expanded.has(id)) {
      st.zoomTarget = id;
      markSelection();
      emphasize();
      fitView(true);
      return;
    }
    if (inPlace) {
      for (const a of ancestorsOf(index, id)) if (inside(a, st.subject)) st.expanded.add(a);
      st.expanded.add(id);
    } else if (!(st.mode === 'overview' && st.subject === id)) {
      st.subject = id;
      st.expanded = initialExpanded(id);
    }
    if (before && !(before.subject === st.subject && before.expanded.has(id) && !inPlace)) st.snapshots.set(id, before);
    else if (!before) st.snapshots.delete(id);
    st.mode = 'overview';
    st.zoomTarget = id;
    render();
    fitView(true);
  }

  function closeCluster(id) {
    const snap = st.snapshots.get(id);
    st.snapshots.delete(id);
    if (snap) {
      st.subject = snap.subject;
      st.expanded = snap.expanded;
      st.zoomTarget = snap.zoomTarget;
      render();
      if (snap.ready) setViewport(snap.viewport, true);
      else fitView(true);
      return;
    }
    if (id === st.subject) {
      const up = ancestorsOf(index, id).filter((a) => isOpenableCluster(index, a)).pop() || null;
      st.subject = up;
      st.expanded = up ? initialExpanded(up) : new Set();
      st.zoomTarget = up;
    } else {
      st.expanded.delete(id);
      for (const other of [...st.expanded]) if (inside(other, id)) st.expanded.delete(other);
      st.zoomTarget = st.subject;
    }
    render();
    fitView(true);
  }

  function focusOn(id) {
    const fresh = st.mode !== 'focus' || st.focusId !== id;
    st.mode = 'focus';
    st.focusId = id;
    if (fresh) st.hops = 1;
    render();
    fitView(true);
  }

  /** `selectedId` (tasks/p16 "Back" button): "Whole map" keeps the reading
   * panel on whatever node was open, so the map should still mark it (its
   * nearest visible ancestor -- markSelection/selectedEle already do that)
   * rather than showing no selection at all. */
  function wholeMap(selectedId = null) {
    st.mode = 'overview';
    st.subject = null;
    st.expanded = new Set();
    st.snapshots.clear();
    st.zoomTarget = null;
    st.selectedId = selectedId;
    render();
    fitView(true);
  }

  /** Show a route: null -> the whole map; a section/subsection/the [AK25]
   * cluster -> opened and zoomed to; anything else -> its neighbourhood. */
  function show(id) {
    if (!id || !index.nodes.has(id)) {
      st.selectedId = null;
      wholeMap();
      return;
    }
    st.selectedId = id;
    if (isOpenableCluster(index, id)) openCluster(id);
    else focusOn(id);
  }

  // ---- controls ---------------------------------------------------------------------
  const q = (sel) => (pane ? pane.querySelector(sel) : null);
  const hopsGroup = q('[data-graph-hops]');
  const hintEl = q('[data-graph-hint]');
  const akhcToggle = q('[data-graph-akhc]');
  const tiersGroup = q('[data-graph-view-switch]');
  const legendToggle = q('[data-graph-action="legend-toggle"]');

  function syncControls() {
    if (pane) pane.dataset.legendCollapsed = String(st.legendCollapsed);
    if (pane) pane.dataset.akhcShown = String(!!st.showAkhc);
    if (legendToggle) legendToggle.setAttribute('aria-expanded', String(!st.legendCollapsed));
    if (tiersGroup) {
      tiersGroup.querySelectorAll('[data-graph-action^="view-"]').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.graphAction === (st.essentials ? 'view-essentials' : 'view-everything')));
      });
    }
    if (pane) pane.dataset.graphTiers = st.essentials ? 'essentials' : 'everything';
    if (hopsGroup) {
      hopsGroup.hidden = st.mode !== 'focus';
      hopsGroup.querySelectorAll('[data-graph-action^="hops-"]').forEach((b) => {
        b.setAttribute('aria-pressed', String(b.dataset.graphAction === `hops-${st.hops}`));
      });
    }
    if (akhcToggle) akhcToggle.checked = st.showAkhc;
    if (hintEl) {
      if (st.mode === 'focus') hintEl.textContent = 'Columns, not the map: what it uses in the left columns, what uses it in the right ones. Click any box to go there.';
      else if (st.essentials && !st.subject) hintEl.textContent = 'The main results and how each is used to prove the next. Click a section to see its supporting results.';
      else if (st.essentials) hintEl.textContent = 'Definitions are hidden here. Click a result to see everything it uses, or a heading to close it.';
      else if (st.subject) hintEl.textContent = 'Click a part to open it, or its heading to close it. Faded boxes outside link in or out.';
      else hintEl.textContent = 'Click a section to open it. Click a theorem to see what it uses and what uses it.';
    }
    if (pane) pane.dataset.graphMode = st.mode === 'focus' ? 'focus' : (st.subject ? 'cluster' : 'map');
  }

  function zoomBy(f) {
    if (!hasSize()) return;
    st.userMoved = true;
    const z = Math.min(ZOOM.max, Math.max(ZOOM.min, cy.zoom() * f));
    const w = container.clientWidth / 2;
    const h = container.clientHeight / 2;
    const p = cy.pan();
    const vp = { zoom: z, pan: { x: w - ((w - p.x) / cy.zoom()) * z, y: h - ((h - p.y) / cy.zoom()) * z } };
    setViewport(vp, true);
  }

  function zoomToSelection() {
    if (!hasSize()) return;
    const n = selectedEle();
    if (n.empty()) { fitView(true); return; }
    const w = container.clientWidth;
    const h = container.clientHeight;
    const target = n.isParent() ? n.union(n.descendants()) : n.closedNeighborhood().nodes().not(':parent');
    setViewport(viewportFor(bbOf(target), w, h, {
      padding: insets(), prefer: n.isParent() ? null : n.position(), readable: 1, maxZoom: 1.6,
    }), true);
    st.userMoved = true;
  }

  function setHops(n) {
    if (st.mode !== 'focus') return;
    st.hops = n === 2 ? 2 : 1;
    render();
    fitView(true);
  }

  function setShowAkhc(on) {
    st.showAkhc = !!on;
    render();
    fitView(false);
  }

  /** "Essentials / Everything": redraw the current view in the other mode. */
  function setEssentials(on) {
    const want = !!on;
    writeViewPreference(want ? 'essentials' : 'everything');
    if (want === st.essentials) return;
    st.essentials = want;
    st.snapshots.clear();
    if (st.mode === 'overview' && st.subject) st.expanded = initialExpanded(st.subject);
    render();
    fitView(true);
  }

  /** The "Legend" toggle: collapses the legend to keep it from covering the graph. */
  function setLegendCollapsed(on) {
    st.legendCollapsed = !!on;
    writeLegendCollapsed(st.legendCollapsed);
    syncControls();
  }

  if (pane) {
    pane.addEventListener('click', (e) => {
      const b = e.target.closest('[data-graph-action]');
      if (!b || !pane.contains(b)) return;
      const a = b.dataset.graphAction;
      if (a === 'zoom-in') zoomBy(1.3);
      else if (a === 'zoom-out') zoomBy(1 / 1.3);
      else if (a === 'fit') fitView(true);
      else if (a === 'zoom-selection') zoomToSelection();
      else if (a === 'whole-map') { if (onWholeMap) onWholeMap(); else wholeMap(); }
      else if (a === 'hops-1') setHops(1);
      else if (a === 'hops-2') setHops(2);
      else if (a === 'view-essentials') setEssentials(true);
      else if (a === 'view-everything') setEssentials(false);
      else if (a === 'legend-toggle') setLegendCollapsed(!st.legendCollapsed);
    });
    if (akhcToggle) akhcToggle.addEventListener('change', () => setShowAkhc(akhcToggle.checked));
    // Keyboard zoom while the graph (or one of its controls) has focus.
    pane.addEventListener('keydown', (e) => {
      if (e.target.closest('input, textarea, select') || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === '+' || e.key === '=') { zoomBy(1.3); e.preventDefault(); } else if (e.key === '-' || e.key === '_') { zoomBy(1 / 1.3); e.preventDefault(); } else if (e.key === '0') { fitView(true); e.preventDefault(); }
    });
    // Wheel and trackpad pinch at our own rate (wheelZoomFactor), caught on
    // the pane in the capture phase so cytoscape's own handler never sees
    // it. Touch pinch stays with cytoscape.
    pane.addEventListener('wheel', (e) => {
      if (!container.contains(e.target) && e.target !== container) return;
      e.preventDefault();
      e.stopPropagation();
      const f = wheelZoomFactor(e);
      const r = container.getBoundingClientRect();
      const z = Math.min(ZOOM.max, Math.max(ZOOM.min, cy.zoom() * f));
      cy.stop();
      cy.zoom({ level: z, renderedPosition: { x: e.clientX - r.left, y: e.clientY - r.top } });
      st.userMoved = true;
    }, { capture: true, passive: false });
  }

  // ---- graph events -------------------------------------------------------------------
  cy.on('tap', 'node', (evt) => {
    const n = evt.target;
    if (n.hasClass('header')) return;
    const id = n.data('opens') || n.id();
    if (st.mode === 'overview' && n.hasClass('cluster') && n.hasClass('expanded')) {
      closeCluster(id);
      return;
    }
    navigate(id);
  });
  cy.on('mouseover', 'node', (evt) => {
    const n = evt.target;
    if (n.hasClass('header')) return;
    container.style.cursor = 'pointer';
    if (n.isParent()) return;
    st.hoverId = n.id();
    emphasize();
  });
  cy.on('mouseout', 'node', () => {
    container.style.cursor = '';
    if (st.hoverId) { st.hoverId = null; emphasize(); }
  });

  cy.on('dragpan pinchzoom scrollzoom', () => { st.userMoved = true; });

  // A skeleton arrow (Essentials whole map) names, on hover or tap, the hidden
  // results it passes through.
  const tipEl = pane && typeof document !== 'undefined' ? document.createElement('div') : null;
  if (tipEl) {
    tipEl.className = 'graph-tip';
    tipEl.setAttribute('role', 'tooltip');
    tipEl.hidden = true;
    pane.appendChild(tipEl);
  }
  const nameOf = (id) => {
    const t = textOf(id);
    return t.number || t.title || id;
  };
  function showTip(edge, at) {
    if (!tipEl) return;
    cy.edges('.tip-hl').removeClass('tip-hl hl');
    edge.addClass('tip-hl hl');
    tipEl.textContent = skeletonEdgeText(edge.data('source'), edge.data('target'), edge.data('via'), nameOf);
    tipEl.hidden = false;
    const w = container.clientWidth;
    const x = Math.max(8, Math.min(at.x + 14, w - tipEl.offsetWidth - 8));
    const y = at.y + 16 + tipEl.offsetHeight > container.clientHeight ? at.y - tipEl.offsetHeight - 10 : at.y + 16;
    tipEl.style.left = `${x}px`;
    tipEl.style.top = `${Math.max(8, y)}px`;
  }
  function hideTip() {
    if (tipEl) tipEl.hidden = true;
    cy.edges('.tip-hl').removeClass('tip-hl hl');
  }
  cy.on('mouseover tap', 'edge.skeleton', (evt) => showTip(evt.target, evt.renderedPosition));
  cy.on('mouseout', 'edge.skeleton', hideTip);
  cy.on('viewport', hideTip);
  container.addEventListener('mouseleave', hideTip);

  /** The canvas changed size (window resize, phone <-> desktop): re-fit,
   * unless the reader has zoomed or panned by hand since the last fit.
   * `{ refit: true }` (the reading-mode divider settling, or the graph shown
   * again after being hidden -- tasks/p13-reading-mode.md) re-fits anyway,
   * or as soon as the canvas has a size again. */
  let refitTimer = null;
  function resize({ refit = false } = {}) {
    cy.resize();
    if (!hasSize()) { if (refit) st.pendingFit = true; return; }
    if (st.userMoved && !st.pendingFit && !refit) return;
    clearTimeout(refitTimer);
    refitTimer = setTimeout(() => fitView(false), 80);
  }
  // Only a real change of size (a whole pixel or more) re-fits: sub-pixel jitter at
  // fractional browser zoom must not start a resize -> re-fit -> resize loop.
  let lastSize = { w: -1, h: -1 };
  if (typeof ResizeObserver === 'function') {
    new ResizeObserver(() => {
      const w = container.clientWidth; const h = container.clientHeight;
      if (Math.abs(w - lastSize.w) < 1 && Math.abs(h - lastSize.h) < 1) return;
      lastSize = { w, h };
      resize();
    }).observe(container);
  }

  let fontGen = 0;
  function refreshStyle() { cy.style(buildStylesheet(cssVar, fontGen)); }

  // Labels drawn before the graph's web font (IBM Plex Sans, each weight
  // arriving separately) has loaded are measured, and cached, in the
  // fallback font: redraw them as each face arrives, and re-lay out and
  // re-fit a map whose box sizes came from those measurements unless the
  // reader has already moved the view. Math fonts loading later for the
  // reading panel never touch the graph.
  if (typeof document !== 'undefined' && document.fonts && document.fonts.addEventListener) {
    document.fonts.addEventListener('loadingdone', (e) => {
      const faces = (e && e.fontfaces) || [];
      if (!faces.some((f) => /Plex Sans/i.test(f.family || ''))) return;
      fontGen += 1;
      refreshStyle();
      if (st.mode === 'overview' && cy.nodes().nonempty() && !st.userMoved) {
        render();
        fitView(false);
      }
    });
  }

  syncControls();

  return {
    show,
    wholeMap,
    setHops,
    setShowAkhc,
    setEssentials,
    isEssentials: () => st.essentials,
    setLegendCollapsed,
    isLegendCollapsed: () => st.legendCollapsed,
    zoomBy,
    fit: () => fitView(true),
    zoomToSelection,
    resize,
    refreshStyle,
    cy,
    index,
  };
}
