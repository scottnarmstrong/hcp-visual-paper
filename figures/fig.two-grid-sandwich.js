// content/figures/fig.two-grid-sandwich.yaml -- "Filling and packing place
// the new-grid mean between two old-grid means, up to boundary errors".
// Schematic (kind: schematic), no numbers anywhere in the drawing itself.
//
// (a) FILL: a new-grid cube filled by old-grid cubes (upper comparison);
// (b) PACK: an old-grid cube packed by new-grid cubes, remainder filled by
//     old-grid cubes (lower comparison);
// (c) what the two comparisons and the small-determinant-loss bound give:
//     the new-grid mean only as a band between the two old-grid levels.
//
// Everything is drawn in q-coordinates. A = q^-1 q_+ is the FIXED
// illustrative matrix the brief specifies (not derived from any metric).

import {
  m2, matVec, mapBox, scaleMat, inv2,
} from './lib/mat2.mjs';
import { boundingBox, ensureCCW, clipConvex, polygonArea } from './lib/geom2d.mjs';
import { selectInConvex } from './lib/whitneySelect.mjs';
import {
  makeSvg, group, richText, fitTransform, arrowMarker, hatchPattern, buttonGroup, controlsBar, COLOR, tint,
  snapshotControlsCaption, measuredWidth, watchResize,
} from './lib/svgkit.mjs';
import { texText, texWrapped, texSpan } from './lib/texLabel.mjs';
import { clear, svgEl, htmlEl } from './lib/dom.mjs';
import { invariant } from './lib/assert.mjs';

const A = m2(0.848, 0.217, 0.004, 1.304);

function polyPath(pts) {
  return `${pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')} Z`;
}

/** Opacity ramp: bulk (largest scale, r = rMax) lightest, finest (r =
 * rMin) darkest. */
function rampOpacity(r, rMax, rMin) {
  const t = rMin === rMax ? 0 : (rMax - r) / (rMax - rMin);
  return 0.28 + 0.58 * Math.min(Math.max(t, 0), 1);
}

/** One <path> per occupied scale (all its squares as separate subpaths of
 * a single `d`), not one per square -- the boundary layer alone can carry
 * thousands of squares at the finer scales, and a merged path keeps both
 * the live page and the audit SVG snapshot light regardless. */
function drawSelection(g, toPx, scale, selection, {
  cap, floor, hatch, theme,
}) {
  const byScale = new Map();
  for (const sq of selection.selected) {
    if (!byScale.has(sq.r)) byScale.set(sq.r, []);
    byScale.get(sq.r).push(sq);
  }
  for (const [r, squares] of byScale) {
    const d = squares.map(({ cx, cy }) => polyPath(mapBox(m2(3 ** r, 0, 0, 3 ** r), [cx, cy], 0.5).map(toPx))).join(' ');
    g.appendChild(svgEl('path', {
      d, fill: tint('gridA', rampOpacity(r, cap, floor), theme), stroke: COLOR.gridA, 'stroke-width': 0.5, 'stroke-opacity': 0.6,
    }));
  }
  if (selection.remainder.length) {
    const d = selection.remainder.map(({
      cx, cy, r,
    }) => polyPath(mapBox(m2(3 ** r, 0, 0, 3 ** r), [cx, cy], 0.5).map(toPx))).join(' ');
    g.appendChild(svgEl('path', { d, fill: hatch, stroke: COLOR.border, 'stroke-width': 0.4 }));
  }
}

function buildFill(L) {
  const T = mapBox(A, [0, 0], 3 ** L / 2);
  return { T, selection: selectInConvex(T, { cap: 0, floor: -4 }) };
}

/** New-grid cells near a given (small) region: transforms the region's
 * corners into w-space (via M^-1) to enumerate only the handful of lattice
 * cells `P_w = M(w + (-1/2,1/2)^2)` that could possibly meet it, instead of
 * scanning every cell in S_b (thousands, for the larger L values) on every
 * recursive call. */
function cellsNear(M, Minv, half, corners) {
  const ws = corners.map((c) => matVec(Minv, c));
  const bbox = boundingBox(ws);
  const w1min = Math.floor(bbox.xMin - 1);
  const w1max = Math.ceil(bbox.xMax + 1);
  const w2min = Math.floor(bbox.yMin - 1);
  const w2max = Math.ceil(bbox.yMax + 1);
  const cells = [];
  for (let w1 = w1min; w1 <= w1max; w1 += 1) {
    for (let w2 = w2min; w2 <= w2max; w2 += 1) {
      const cc = mapBox(M, matVec(M, [w1, w2]), 0.5);
      const packed = cc.every(([x, y]) => Math.abs(x) <= half + 1e-9 && Math.abs(y) <= half + 1e-9);
      cells.push({ corners: cc, packed });
    }
  }
  return cells;
}

function meetsAny(cells, corners, areaSq, wantPacked) {
  for (const cell of cells) {
    if (cell.packed !== wantPacked) continue;
    const clipped = clipConvex(corners, ensureCCW(cell.corners));
    if (clipped.length >= 3 && polygonArea(clipped) > 1e-9 * areaSq) return true;
  }
  return false;
}

function buildPack(L) {
  const half = 3 ** (2 * L) / 2;
  const Sb = [[-half, -half], [half, -half], [half, half], [-half, half]];
  const M = scaleMat(A, 3 ** L);
  const Minv = inv2(M);

  const cap = L;
  const floor = L - 4;
  const selected = [];
  const remainder = [];

  function recurse(cx, cy, r) {
    const hs = 3 ** r / 2;
    const corners = [[cx - hs, cy - hs], [cx + hs, cy - hs], [cx + hs, cy + hs], [cx - hs, cy + hs]];
    const areaSq = 9 ** r;
    const nearby = cellsNear(M, Minv, half, corners);
    if (!meetsAny(nearby, corners, areaSq, true)) { selected.push({ cx, cy, r }); return; }
    if (!meetsAny(nearby, corners, areaSq, false)) return; // every meeting cell is packed -> fully covered
    if (r > floor) {
      const child = 3 ** (r - 1);
      for (let di = -1; di <= 1; di += 1) {
        for (let dj = -1; dj <= 1; dj += 1) recurse(cx + di * child, cy + dj * child, r - 1);
      }
    } else {
      remainder.push({ cx, cy, r });
    }
  }

  const nPerSide = 3 ** L;
  for (let i = -(nPerSide - 1) / 2; i <= (nPerSide - 1) / 2; i += 1) {
    for (let j = -(nPerSide - 1) / 2; j <= (nPerSide - 1) / 2; j += 1) {
      recurse(i * 3 ** cap, j * 3 ** cap, cap);
    }
  }

  const packedCells = cellsNear(M, Minv, half, Sb).filter((c) => c.packed).map((c) => c.corners);

  return {
    Sb, packedCells, selection: { selected, remainder }, cap, floor,
  };
}

function drawFill(svg, x0, y0, w, h, L, hatch, theme) {
  const g = group(x0, y0);
  svg.appendChild(g);
  g.appendChild(richText(w / 2, -12, '(a) fill', { anchor: 'middle', size: 12, fill: COLOR.textDim }));
  g.appendChild(texText(2, 12, '$\\qq$-coordinates', 'q-coordinates', { size: 9, fill: COLOR.textDim, halo: true }));

  const { T, selection } = buildFill(L);
  invariant(selection.selected.every((s) => s.r <= 0), 'FILL: a selected square exceeds scale n');
  const bbox = boundingBox(T);
  const t = fitTransform(bbox, { x0: 0, y0: 14, w, h: h - 14 }, { pad: 10 });
  drawSelection(g, t.toPx, t.scale, selection, {
    cap: 0, floor: -4, hatch, theme,
  });
  g.appendChild(svgEl('path', {
    d: polyPath(T.map(t.toPx)), fill: 'none', stroke: COLOR.gridB, 'stroke-width': 2,
  }));
  g.appendChild(texWrapped(w / 2, h + 18, 'new-grid cube of scale $n+L$ filled by old-grid cubes of scale $\\leq n$', 'new-grid cube of scale n+L filled by old-grid cubes of scale ≤ n', {
    maxWidth: w - 8, anchor: 'middle', size: 9.5, fill: COLOR.textDim, lineHeight: 12,
  }));
  return g;
}

function drawPack(svg, x0, y0, w, h, L, hatch, theme) {
  const g = group(x0, y0);
  svg.appendChild(g);
  g.appendChild(richText(w / 2, -12, '(b) pack', { anchor: 'middle', size: 12, fill: COLOR.textDim }));
  g.appendChild(texText(2, 12, '$\\qq$-coordinates', 'q-coordinates', { size: 9, fill: COLOR.textDim, halo: true }));

  const {
    Sb, packedCells, selection, cap, floor,
  } = buildPack(L);
  invariant(selection.selected.every((s) => s.r <= cap), 'PACK: an uncovered square exceeds scale n+L');
  const bbox = boundingBox(Sb);
  const t = fitTransform(bbox, { x0: 0, y0: 14, w, h: h - 14 }, { pad: 10 });
  if (packedCells.length) {
    g.appendChild(svgEl('path', {
      d: packedCells.map((cell) => polyPath(cell.map(t.toPx))).join(' '), fill: tint('gridB', 0.28, theme), stroke: COLOR.gridB, 'stroke-width': 0.6,
    }));
  }
  drawSelection(g, t.toPx, t.scale, selection, {
    cap, floor, hatch, theme,
  });
  g.appendChild(svgEl('path', {
    d: polyPath(Sb.map(t.toPx)), fill: 'none', stroke: COLOR.gridA, 'stroke-width': 2,
  }));
  g.appendChild(texWrapped(
    w / 2,
    h + 18,
    'old-grid cube of scale $n+2L$: packed new-grid cubes (scale $n+L$); old-grid cubes (scale $\\leq n+L$) fill the rest',
    'old-grid cube of scale n+2L: packed new-grid cubes (scale n+L); old-grid cubes (scale ≤ n+L) fill the rest',
    {
      maxWidth: w - 8, anchor: 'middle', size: 9.5, fill: COLOR.textDim, lineHeight: 12,
    },
  ));
  return g;
}

function drawComparisons(svg, x0, y0, w, h, theme) {
  const g = group(x0, y0);
  svg.appendChild(g);
  g.appendChild(richText(w / 2, -12, '(c) what the comparisons give', { anchor: 'middle', size: 12, fill: COLOR.textDim }));

  // The determinant-loss statement sits in its own row, full width, above
  // the level diagram -- not squeezed into the ~12px left of the bracket,
  // where it used to wrap into many near-unreadable lines.
  g.appendChild(texWrapped(
    w / 2,
    8,
    'small determinant loss: $\\bfAhom_{n+2L,\\qq}\\leq\\bfAhom_{n,\\qq}\\leq(1+\\delta_0)^d\\bfAhom_{n+2L,\\qq}$',
    'small determinant loss: Ahom_{n+2L,q} ≤ Ahom_{n,q} ≤ (1+δ_0)^d Ahom_{n+2L,q}',
    {
      maxWidth: w - 8, anchor: 'middle', size: 8.5, fill: COLOR.theorem, lineHeight: 10,
    },
  ));

  const axisX = 14;
  const topY = 54;
  const botY = h - 66;
  g.appendChild(svgEl('line', {
    x1: axisX, y1: topY - 10, x2: axisX, y2: botY + 10, stroke: COLOR.border, 'stroke-width': 1,
  }));
  g.appendChild(richText(axisX - 4, botY + 24, 'order (schematic)', { size: 8, fill: COLOR.textDim }));

  const barLen = 130;
  const levelX = axisX + 12;
  const yTop = topY + 14; // Ahom_{n,q}
  const yBot = yTop + 40; // Ahom_{n+2L,q}
  for (const [y, label, tex] of [[yTop, 'Ahom_{n,q}', '$\\bfAhom_{n,\\qq}$'], [yBot, 'Ahom_{n+2L,q}', '$\\bfAhom_{n+2L,\\qq}$']]) {
    g.appendChild(svgEl('line', {
      x1: levelX, y1: y, x2: levelX + barLen, y2: y, stroke: COLOR.gridA, 'stroke-width': 2.5,
    }));
    g.appendChild(texText(levelX + barLen + 6, y + 3, tex, label, { size: 9.5, fill: COLOR.text }));
  }
  // bracket between the two old-grid levels.
  const bx = levelX - 8;
  g.appendChild(svgEl('path', {
    d: `M${bx + 5},${yTop} L${bx},${yTop} L${bx},${yBot} L${bx + 5},${yBot}`, fill: 'none', stroke: COLOR.theorem, 'stroke-width': 1.2,
  }));

  // the new-grid mean: a band overhanging both old levels, not a definite line.
  const bandTop = yTop - 18;
  const bandBot = yBot + 18;
  const bandG = svgEl('g', { class: 'sw-band' });
  g.appendChild(bandG);
  bandG.appendChild(svgEl('rect', {
    x: levelX, y: bandTop, width: barLen, height: bandBot - bandTop, fill: tint('gridB', 0.22, theme),
  }));
  bandG.appendChild(svgEl('line', {
    x1: levelX, y1: bandTop, x2: levelX + barLen, y2: bandTop, stroke: COLOR.gridB, 'stroke-width': 1.6, class: 'sw-edge-a',
  }));
  bandG.appendChild(svgEl('line', {
    x1: levelX, y1: bandBot, x2: levelX + barLen, y2: bandBot, stroke: COLOR.gridB, 'stroke-width': 1.6, class: 'sw-edge-b',
  }));
  // Placed level with the whole cluster: below both old-grid labels'
  // rows (not at the same x,y as "Ahom_{n,q}", which crowded it before).
  bandG.appendChild(texWrapped(levelX + barLen + 6, yBot + 20, '$\\bfAhom_{n+L,\\qq_+}$ lies in this band', 'Ahom_{n+L,q+} lies in this band', {
    maxWidth: 150, size: 9, fill: COLOR.text, lineHeight: 11,
  }));
  bandG.appendChild(texWrapped(levelX, bandTop - 8, '(a): $\\bfAhom_{n+L,\\qq_+}\\leq\\bfAhom_{n,\\qq}$ + boundary terms', '(a): Ahom_{n+L,q+} ≤ Ahom_{n,q} + boundary terms', {
    maxWidth: barLen + 60, size: 7.6, fill: COLOR.textDim, lineHeight: 9,
  }));
  // (+15, was +12: the typeset label's overlines need the extra room below
  // the "lies in this band" label.)
  bandG.appendChild(texWrapped(levelX, bandBot + 15, '(b): $\\bfAhom_{n+2L,\\qq}\\leq\\bfAhom_{n+L,\\qq_+}$ + boundary terms', '(b): Ahom_{n+2L,q} ≤ Ahom_{n+L,q+} + boundary terms', {
    maxWidth: barLen + 60, size: 7.6, fill: COLOR.textDim, lineHeight: 9,
  }));

  // brace with the full-hypothesis (1 +- sigma) statement, including the
  // explicit quantitative L >= L_0 + ceil(log_3(sigma^-1)) condition --
  // always shown together, never the bound alone (MUST HOLD: the brace
  // carries its hypotheses).
  const braceX = levelX + barLen + 170;
  g.appendChild(svgEl('path', {
    d: `M${braceX - 5},${bandTop} L${braceX},${bandTop} L${braceX},${bandBot} L${braceX - 5},${bandBot}`, fill: 'none', stroke: COLOR.theorem, 'stroke-width': 1.2,
  }));
  g.appendChild(texWrapped(
    braceX + 6,
    bandTop + 2,
    'under the proposition’s hypotheses, including ${L\\geq L_0+\\lceil\\log_3(1/\\sigma)\\rceil}$ and small error, drift and determinant loss:',
    'under the proposition’s hypotheses, including L ≥ L_0+ceil(log_3(1/σ)) and small error, drift and determinant loss:',
    {
      maxWidth: w - braceX - 16, size: 7.6, fill: COLOR.theorem, lineHeight: 9.5,
    },
  ));
  g.appendChild(texWrapped(
    braceX + 6,
    (bandTop + bandBot) / 2 + 22,
    // (Braced groups: a narrow column may break the line only after a
    // relation, never inside a factor such as (1+sigma).)
    '${(1-\\sigma)\\bfAhom_{n+2L,\\qq}}\\leq{\\bfAhom_{n+L,\\qq_+}}\\leq{(1+\\sigma)\\bfAhom_{n+2L,\\qq}}$',
    '(1−σ)Ahom_{n+2L,q} ≤ Ahom_{n+L,q+} ≤ (1+σ)Ahom_{n+2L,q}',
    // lineHeight 13 (was 10): wrapped in a narrow column, a line's
    // subscripts otherwise ran into the next line's overlines.
    { maxWidth: w - braceX - 16, size: 8.2, fill: COLOR.theorem, lineHeight: 13 },
  ));

  // scale line n, n+L, n+2L.
  const scaleY = h - 22;
  const sx = [levelX, levelX + barLen * 0.5, levelX + barLen];
  g.appendChild(svgEl('line', {
    x1: sx[0], y1: scaleY, x2: sx[2], y2: scaleY, stroke: COLOR.border, 'stroke-width': 1,
  }));
  const ticks = [[sx[0], 'n', COLOR.gridA], [sx[1], 'n+L', COLOR.gridB], [sx[2], 'n+2L', COLOR.gridA]];
  for (const [x, label, color] of ticks) {
    g.appendChild(svgEl('circle', { cx: x, cy: scaleY, r: 3.5, fill: color }));
    g.appendChild(texText(x, scaleY + 16, `$${label}$`, label, { anchor: 'middle', size: 9, fill: COLOR.textDim }));
  }

  return {
    g,
    upperAnchor: [x0 - 4, y0 + bandTop - 10],
    lowerAnchor: [x0 - 4, y0 + bandBot + 10],
    highlight(which, on) {
      const cls = which === 'a' ? '.sw-edge-a' : '.sw-edge-b';
      const edge = bandG.querySelector(cls);
      if (edge) edge.setAttribute('stroke-width', on ? '3.4' : '1.6');
    },
  };
}

const NARROW_BREAKPOINT = 800;

function layoutBoxes(mode, vbW) {
  const panelY = 70;
  const panelH = 280;
  if (mode === 'wide') {
    return {
      vbW,
      a: { x: 20, y: panelY, w: 260, h: panelH },
      b: { x: 330, y: panelY, w: 260, h: panelH },
      c: { x: 640, y: panelY, w: 540, h: panelH },
      totalH: panelY + panelH + 90,
    };
  }
  const panelW = vbW - 40;
  let y = panelY;
  const a = {
    x: 20, y, w: panelW, h: 260,
  };
  y += a.h + 90;
  const b = {
    x: 20, y, w: panelW, h: 260,
  };
  y += b.h + 90;
  const c = {
    x: 20, y, w: panelW, h: 300,
  };
  y += c.h + 20;
  return {
    vbW, a, b, c, totalH: y,
  };
}

export function render(el, { theme = 'light', params = {} } = {}) {
  const pL = params.L || {};
  const state = { L: pL.default ?? 2 };

  clear(el);
  const root = htmlEl('div', { class: 'd3-figure' });
  el.appendChild(root);

  const svg = makeSvg([0, 0, 1200, 500], { ariaLabel: 'Filling and packing place the new-grid mean between two old-grid means, up to boundary errors' });

  const controls = controlsBar();
  const lCtl = buttonGroup({
    label: texSpan('$L$', 'L'),
    options: (pL.values || [1, 2, 3]).map((v) => ({ value: v, label: String(v) })),
    value: state.L,
    onChange: (v) => { state.L = Number(v); redraw(); },
  });
  controls.appendChild(lCtl.node);
  root.appendChild(controls);
  root.appendChild(svg);

  function redraw() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const hatch = hatchPattern(svg, COLOR.neutral);

    const mode = measuredWidth(root) < NARROW_BREAKPOINT ? 'narrow' : 'wide';
    const boxes = layoutBoxes(mode, mode === 'wide' ? 1200 : 480);
    svg.setAttribute('viewBox', `0 0 ${boxes.vbW} ${boxes.totalH}`);

    const fillG = drawFill(svg, boxes.a.x, boxes.a.y, boxes.a.w, boxes.a.h, state.L, hatch, theme);
    const packG = drawPack(svg, boxes.b.x, boxes.b.y, boxes.b.w, boxes.b.h, state.L, hatch, theme);
    const cmp = drawComparisons(svg, boxes.c.x, boxes.c.y, boxes.c.w, boxes.c.h, theme);

    const arrowRef = arrowMarker(svg, COLOR.textDim, 6);
    if (mode === 'wide') {
      // Real arrows FROM each panel to panel (c)'s band edges, arcing
      // through the top/bottom margin so they don't cut across panel (b)'s
      // own drawing, each labelled with the brief's own wording.
      const aFrom = [boxes.a.x + boxes.a.w + 4, boxes.a.y + boxes.a.h * 0.25];
      const upperMidY = boxes.a.y - 26;
      // Behind the panels (first in paint order): the arc passes panel
      // (b)'s top-left corner, where its "q-coordinates" label (on a
      // background patch) now sits over the arc instead of under it.
      svg.insertBefore(svgEl('path', {
        d: `M${aFrom[0]},${aFrom[1]} C${(aFrom[0] + cmp.upperAnchor[0]) / 2},${upperMidY} ${(aFrom[0] + cmp.upperAnchor[0]) / 2},${upperMidY} ${cmp.upperAnchor[0]},${cmp.upperAnchor[1]}`,
        fill: 'none', stroke: COLOR.textDim, 'stroke-width': 1.2, 'stroke-dasharray': '4,3', 'marker-end': arrowRef,
      }), svg.firstChild);
      svg.appendChild(richText((aFrom[0] + cmp.upperAnchor[0]) / 2, upperMidY - 6, 'upper comparison', { anchor: 'middle', size: 9.5, fill: COLOR.textDim }));

      const bFrom = [boxes.b.x + boxes.b.w + 4, boxes.b.y + boxes.b.h * 0.75];
      const lowerMidY = boxes.b.y + boxes.b.h + 30;
      svg.appendChild(svgEl('path', {
        d: `M${bFrom[0]},${bFrom[1]} C${(bFrom[0] + cmp.lowerAnchor[0]) / 2},${lowerMidY} ${(bFrom[0] + cmp.lowerAnchor[0]) / 2},${lowerMidY} ${cmp.lowerAnchor[0]},${cmp.lowerAnchor[1]}`,
        fill: 'none', stroke: COLOR.textDim, 'stroke-width': 1.2, 'stroke-dasharray': '4,3', 'marker-end': arrowRef,
      }));
      svg.appendChild(richText((bFrom[0] + cmp.lowerAnchor[0]) / 2, lowerMidY + 16, 'lower comparison', { anchor: 'middle', size: 9.5, fill: COLOR.textDim }));
    } else {
      // Stacked: a short downward arrow from each panel into the next,
      // with the same wording (no room for a curve past panel (b)). The
      // arrow starts below the panel's two-line caption (at h+18, h+30),
      // which it used to cut through.
      svg.appendChild(svgEl('line', {
        x1: boxes.a.x + 20, y1: boxes.a.y + boxes.a.h + 38, x2: boxes.a.x + 20, y2: boxes.b.y - 6, stroke: COLOR.textDim, 'stroke-width': 1.2, 'stroke-dasharray': '4,3', 'marker-end': arrowRef,
      }));
      svg.appendChild(richText(boxes.a.x + 28, boxes.a.y + boxes.a.h + 54, 'upper comparison, into (c) below', { size: 9, fill: COLOR.textDim }));
      svg.appendChild(svgEl('line', {
        x1: boxes.b.x + 20, y1: boxes.b.y + boxes.b.h + 38, x2: boxes.b.x + 20, y2: boxes.c.y - 6, stroke: COLOR.textDim, 'stroke-width': 1.2, 'stroke-dasharray': '4,3', 'marker-end': arrowRef,
      }));
      svg.appendChild(richText(boxes.b.x + 28, boxes.b.y + boxes.b.h + 54, 'lower comparison, into (c) below', { size: 9, fill: COLOR.textDim }));
    }

    fillG.addEventListener('mouseenter', () => cmp.highlight('a', true));
    fillG.addEventListener('mouseleave', () => cmp.highlight('a', false));
    packG.addEventListener('mouseenter', () => cmp.highlight('b', true));
    packG.addEventListener('mouseleave', () => cmp.highlight('b', false));

    const cap = snapshotControlsCaption(20, boxes.totalH - 8, [{ label: 'L', value: state.L }], { maxWidth: boxes.vbW - 40 });
    if (cap) svg.appendChild(cap);
  }

  watchResize(root, redraw);
  redraw();
}
