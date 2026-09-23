// content/figures/fig.adapted-cube.yaml -- "Adapted cubes: stretched to
// the metric, snapped to the lattice". Toy run, d = 2, j* = 2.
//
// (a) the adapted cube is the image of the Euclidean cube under (a
//     rounding of) U(m) = |m^-1|^(1/2) m^(1/2), aligned with the metric's
//     ellipse;
// (b) rounding puts the grid on the integer lattice;
// (c) the mismatch factor in the cutoff estimate stays at most three on
//     the adapted grid but grows like the eccentricity on a Euclidean one.

import {
  metric, shapeU, roundQ, eigSym, eccentricity, mapBox, ellipseBoundary,
  matVec, matMul, inv2, sqrtSym, invSqrtSym, opNorm,
} from './lib/mat2.mjs';
import {
  distPointToPolygon, ensureCCW,
} from './lib/geom2d.mjs';
import {
  makeSvg, group, richText, fitTransform, arrowMarker, rangeControl, toggleControl, controlsBar,
  fmt, COLOR, snapshotControlsCaption, measuredWidth, watchResize,
} from './lib/svgkit.mjs';
import { clear, svgEl, htmlEl } from './lib/dom.mjs';
import { invariant, approxEqual } from './lib/assert.mjs';
import { texText, texWrapped, texSpan } from './lib/texLabel.mjs';

const D = 2;
const J_STAR = 2;
const NARROW_BREAKPOINT = 800;

function polyPath(pts) {
  return `${pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')} Z`;
}

function mod(a, n) { return ((a % n) + n) % n; }

function computeState({ e, a, compare }) {
  const m = metric(e, a);
  const U = shapeU(m);
  const q = roundQ(m, J_STAR);
  const { lo: mLo, hi: mHi, vLo, vHi } = eigSym(m);
  const ecc = eccentricity(m);

  // MUST HOLD (ac.2, ac.3): 9q integer, q symmetric, |q - U| <= 2/9, q's
  // smallest eigenvalue >= 1/2.
  const nine = 3 ** J_STAR;
  invariant(approxEqual(nine * q.a, Math.round(nine * q.a), 1e-6), '9q entry a is not an integer');
  invariant(approxEqual(nine * q.b, Math.round(nine * q.b), 1e-6), '9q entry b is not an integer');
  invariant(approxEqual(nine * q.d, Math.round(nine * q.d), 1e-6), '9q entry d is not an integer');
  invariant(q.b === q.c, 'q is not symmetric');
  const diff = {
    a: q.a - U.a, b: q.b - U.b, c: q.c - U.c, d: q.d - U.d,
  };
  const diffNorm = opNorm(diff);
  invariant(diffNorm <= D / nine + 1e-9, `|q-U| = ${diffNorm} exceeds d*3^-j* = ${D / nine}`);
  const qEig = eigSym(q);
  invariant(qEig.lo >= 0.5 - 1e-9, `smallest eigenvalue of q is ${qEig.lo} < 1/2`);

  // (c) mismatch factors.
  const sqrtM = sqrtSym(m);
  const invSqrtM = invSqrtSym(m);
  const adaptedMismatch = opNorm(matMul(q, invSqrtM)) * opNorm(matMul(sqrtM, inv2(q)));
  const euclideanMismatch = opNorm(invSqrtM) * opNorm(sqrtM);
  invariant(adaptedMismatch <= 3 + 1e-6, `adapted mismatch ${adaptedMismatch} exceeds 3`);
  invariant(approxEqual(euclideanMismatch, ecc, 1e-6), 'Euclidean mismatch does not equal e(m)');

  return {
    e, a, compare, m, U, q, mLo, mHi, vLo, vHi, ecc, diffNorm, adaptedMismatch, euclideanMismatch,
  };
}

function drawMetricToCube(svg, x0, y0, w, h, st) {
  const g = group(x0, y0);
  svg.appendChild(g);
  g.appendChild(richText(w / 2, -10, '(a) metric to cube', { anchor: 'middle', size: 12, fill: COLOR.textDim }));

  const leftW = w * 0.42;
  const rightW = w - leftW - 30;
  const rightX0 = leftW + 30;

  // ONE common scale for both sub-scenes (MUST HOLD: "same scale"): fit
  // the LARGER of the two extents (the ellipse, semi-axis e(m) >= 1) into
  // whichever sub-viewport is tighter, then reuse that same pixels-per-
  // unit factor for the disk side too, so a bigger e(m) visibly shrinks
  // the disk relative to the ellipse instead of both independently
  // filling their own boxes.
  const pad = 8;
  const diskExtent = 1.1;
  const ellExtent = Math.max(st.ecc, 1) * 1.05 + 0.15;
  const commonExtent = Math.max(diskExtent, ellExtent);
  const scale = Math.max(
    Math.min((leftW - 2 * pad) / (2 * commonExtent), (rightW - 2 * pad) / (2 * commonExtent), (h - 2 * pad) / (2 * commonExtent)),
    1e-9,
  );
  const leftOrigin = [leftW / 2, h / 2];
  const rightOrigin = [rightX0 + rightW / 2, h / 2];
  const toPxLeft = ([x, y]) => [leftOrigin[0] + x * scale, leftOrigin[1] - y * scale];
  const toPxRight = ([x, y]) => [rightOrigin[0] + x * scale, rightOrigin[1] - y * scale];

  // unit disk + Euclidean cube (neutral).
  const dc0 = toPxLeft([0, 0]);
  const leftG = group(0, 0);
  g.appendChild(leftG);
  leftG.appendChild(svgEl('circle', {
    cx: dc0[0], cy: dc0[1], r: scale, fill: 'none', stroke: COLOR.neutral, 'stroke-width': 1.2,
  }));
  const cube0 = mapBox({
    a: 1, b: 0, c: 0, d: 1,
  }, [0, 0], 0.5).map(toPxLeft);
  leftG.appendChild(svgEl('path', {
    d: polyPath(cube0), fill: 'none', stroke: COLOR.neutral, 'stroke-width': 1.5,
  }));
  leftG.appendChild(richText(dc0[0], dc0[1] - scale - 10, 'unit disk, unit square', {
    anchor: 'middle', size: 10, fill: COLOR.textDim,
  }));

  // arrow x -> qx
  const arrowY = h / 2;
  const arrowRef = arrowMarker(svg, COLOR.text, 5);
  g.appendChild(svgEl('line', {
    x1: leftW + 4, y1: arrowY, x2: leftW + 26, y2: arrowY, stroke: COLOR.text, 'stroke-width': 1.4, 'marker-end': arrowRef,
  }));
  g.appendChild(texText(leftW + 15, arrowY - 8, '$x\\mapsto\\qq x$', 'x -> qx', { anchor: 'middle', size: 10, fill: COLOR.text }));

  // right sub-scene: ellipse U(disk), unrounded image U(cube0), adapted cube q(cube0).
  const rightG = group(0, 0);
  g.appendChild(rightG);
  const ecOrigin = toPxRight([0, 0]);
  const ellipsePts = ellipseBoundary([0, 0], 1, st.ecc, st.vLo, st.vHi).map(toPxRight);
  rightG.appendChild(svgEl('path', {
    d: polyPath(ellipsePts), fill: 'none', stroke: COLOR.theorem, 'stroke-width': 1.5, 'stroke-dasharray': '5,4',
  }));
  // principal axes of the ellipse, labelled 1 and e(m).
  const majorEnd = toPxRight([st.vHi[0] * st.ecc, st.vHi[1] * st.ecc]);
  const minorEnd = toPxRight([st.vLo[0] * 1, st.vLo[1] * 1]);
  rightG.appendChild(svgEl('line', {
    x1: ecOrigin[0], y1: ecOrigin[1], x2: majorEnd[0], y2: majorEnd[1], stroke: COLOR.theorem, 'stroke-width': 1,
  }));
  rightG.appendChild(svgEl('line', {
    x1: ecOrigin[0], y1: ecOrigin[1], x2: minorEnd[0], y2: minorEnd[1], stroke: COLOR.theorem, 'stroke-width': 1,
  }));
  // Each axis label just OUTSIDE the ellipse, past its axis end (on the
  // end's own side), so the dashed boundary never runs through it.
  const axisLabel = (end, tex, old) => {
    const dx = end[0] - ecOrigin[0];
    const dy = end[1] - ecOrigin[1];
    const len = Math.hypot(dx, dy) || 1;
    const px = end[0] + (dx / len) * 5;
    const py = end[1] + (dy / len) * 5;
    const anchor = dx >= 0 ? 'start' : 'end';
    const baseY = dy >= 0 ? py + 8 : py - 1;
    rightG.appendChild(texText(px, baseY, tex, old, { size: 9, fill: COLOR.theorem, anchor }));
  };
  axisLabel(majorEnd, '$\\mathfrak e(\\m)$', [{ t: 'e(m)', italic: true }]);
  axisLabel(minorEnd, '$1$', '1');

  const unroundedPts = mapBox(st.U, [0, 0], 0.5).map(toPxRight);
  rightG.appendChild(svgEl('path', {
    d: polyPath(unroundedPts), fill: 'none', stroke: COLOR.textDim, 'stroke-width': 1, 'stroke-dasharray': '1,3',
  }));
  const adaptedPts = mapBox(st.q, [0, 0], 0.5).map(toPxRight);
  rightG.appendChild(svgEl('path', {
    d: polyPath(adaptedPts), fill: 'none', stroke: COLOR.gridA, 'stroke-width': 2,
  }));

  if (st.compare) {
    // Euclidean square of equal area to q(cu_0): area(q cu_0) = |det q|.
    const detQ = Math.abs(st.q.a * st.q.d - st.q.b * st.q.c);
    const side = Math.sqrt(detQ);
    const sqPts = mapBox({
      a: side, b: 0, c: 0, d: side,
    }, [0, 0], 0.5).map(toPxRight);
    rightG.appendChild(svgEl('path', {
      d: polyPath(sqPts), fill: 'none', stroke: COLOR.neutral, 'stroke-width': 1.3, 'stroke-dasharray': '4,3',
    }));
  }

  // Centred on the whole panel (it wraps at the panel's width): centred
  // under the right sub-scene, its right half ran past the panel edge.
  g.appendChild(texWrapped(
    w / 2,
    h + 16,
    'adapted cube $=\\qq\\,$unit square (solid); unrounded $=U\\,$unit square (dotted)',
    'adapted cube = q * unit square (solid); unrounded = U * unit square (dotted)',
    {
      maxWidth: w - 8, anchor: 'middle', size: 9.5, fill: COLOR.textDim, lineHeight: 11,
    },
  ));
}

function drawLattice(svg, x0, y0, w, h, st) {
  const g = group(x0, y0);
  svg.appendChild(g);
  g.appendChild(richText(w / 2, -10, '(b) snapped to the lattice', { anchor: 'middle', size: 12, fill: COLOR.textDim }));

  const win = 30;
  const t = fitTransform({
    xMin: -win, xMax: win, yMin: -win, yMax: win,
  }, {
    x0: 0, y0: 0, w, h: h - 30,
  }, { pad: 6 });

  // integer lattice as a repeating pattern (avoids ~3700 individual dots),
  // its origin aligned to the SAME coordinate transform as everything
  // else in this panel: a dot must sit exactly at t.toPx([integer, integer]),
  // not at the pattern's own independent (0,0).
  const patId = `fig-adapted-cube-lattice-${Math.round(st.ecc * 100)}`;
  let defs = svg.querySelector('defs');
  if (!defs) { defs = svgEl('defs'); svg.insertBefore(defs, svg.firstChild); }
  const cell = t.scale;
  const origin = t.toPx([0, 0]);
  const patX = mod(origin[0] - cell / 2, cell);
  const patY = mod(origin[1] - cell / 2, cell);
  const pat = svgEl('pattern', {
    id: patId, x: patX, y: patY, width: cell, height: cell, patternUnits: 'userSpaceOnUse',
  }, [svgEl('circle', { cx: cell / 2, cy: cell / 2, r: Math.max(cell * 0.05, 0.6), fill: COLOR.neutral })]);
  defs.appendChild(pat);
  const [bx0, by0] = t.toPx([-win, win]);
  const winPx = 2 * win * t.scale;

  // Everything that is defined only inside the [-win,win]^2 plotting
  // window (the dot lattice, cell outlines, adapted/unrounded points) is
  // clipped to that window's rectangle: a cell can be centred inside the
  // window yet still poke outside it, and left unclipped that spills into
  // the panel title, the inclusion-formula caption and the legend below.
  const clipId = `fig-adapted-cube-clip-${Math.round(st.ecc * 100)}`;
  defs.appendChild(svgEl('clipPath', { id: clipId }, [
    svgEl('rect', {
      x: bx0, y: by0, width: winPx, height: winPx,
    }),
  ]));
  const latticeG = group(0, 0);
  latticeG.setAttribute('clip-path', `url(#${clipId})`);
  g.appendChild(latticeG);

  latticeG.appendChild(svgEl('rect', {
    x: bx0, y: by0, width: winPx, height: winPx, fill: `url(#${patId})`,
  }));

  const nine = 3 ** J_STAR;
  const scaledQ = {
    a: nine * st.q.a, b: nine * st.q.b, c: nine * st.q.c, d: nine * st.q.d,
  };
  const scaledU = {
    a: nine * st.U.a, b: nine * st.U.b, c: nine * st.U.c, d: nine * st.U.d,
  };
  const range = 6;
  const inWindow = (p) => Math.abs(p[0]) <= win + 1 && Math.abs(p[1]) <= win + 1;
  for (let w1 = -range; w1 <= range; w1 += 1) {
    for (let w2 = -range; w2 <= range; w2 += 1) {
      const pt = matVec(scaledQ, [w1, w2]);
      const uPt = matVec(scaledU, [w1, w2]);
      // Outline the cell iff it actually MEETS the disc of radius 20
      // around the origin (a true point-to-polygon distance test, not a
      // center-distance heuristic). This must NOT be skipped just because
      // both the rounded and unrounded centers of the cell lie outside
      // the plotting window: for eccentric metrics a cell can be centred
      // outside the window while still reaching into the disc, and the
      // clip-path above keeps its drawn outline confined to the window.
      const cellPts = ensureCCW(mapBox(scaledQ, pt, 0.5));
      if (distPointToPolygon([0, 0], cellPts) <= 20) {
        latticeG.appendChild(svgEl('path', {
          d: polyPath(cellPts.map((v) => t.toPx(v))), fill: 'none', stroke: COLOR.gridA, 'stroke-width': 0.6, opacity: 0.55,
        }));
      }
      if (inWindow(pt)) {
        const [px, py] = t.toPx(pt);
        latticeG.appendChild(svgEl('circle', { cx: px, cy: py, r: 3, fill: COLOR.gridA }));
      }
      if (inWindow(uPt)) {
        const [ux, uy] = t.toPx(uPt);
        latticeG.appendChild(svgEl('circle', {
          cx: ux, cy: uy, r: 2.6, fill: 'none', stroke: COLOR.theorem, 'stroke-width': 1,
        }));
      }
    }
  }
  g.appendChild(texText(w / 2, h - 20, '$3^j\\qq\\Zd\\subseteq\\Zd$ for $j\\geq j_*$', [
    { t: '3' }, { t: 'j', sup: true }, { t: ' q Z' }, { t: 'd', sup: true },
    { t: ' is inside Z' }, { t: 'd', sup: true }, { t: ' for j ≥ j*' },
  ], { anchor: 'middle', size: 10.5, fill: COLOR.textDim }));

  // legend: filled adapted point vs hollow unrounded point.
  const legendY = h - 4;
  g.appendChild(svgEl('circle', { cx: 6, cy: legendY - 3, r: 3, fill: COLOR.gridA }));
  g.appendChild(texText(14, legendY, 'adapted point $9\\qq w$', 'adapted point 9qw', { size: 8.5, fill: COLOR.textDim }));
  g.appendChild(svgEl('circle', {
    cx: w / 2 + 6, cy: legendY - 3, r: 2.6, fill: 'none', stroke: COLOR.theorem, 'stroke-width': 1,
  }));
  g.appendChild(texText(w / 2 + 14, legendY, 'unrounded point $9Uw$', 'unrounded point 9Uw', { size: 8.5, fill: COLOR.theorem }));
}

function drawMismatch(svg, x0, y0, w, h, st) {
  const g = group(x0, y0);
  svg.appendChild(g);
  g.appendChild(richText(w / 2, -10, '(c) mismatch factor', { anchor: 'middle', size: 12, fill: COLOR.textDim }));

  g.appendChild(texText(0, 12, `$\\mathfrak e(\\m)=${fmt(st.ecc, 2)}$`, `e(m) = ${fmt(st.ecc, 2)}`, { size: 11, fill: COLOR.text }));
  g.appendChild(texText(0, 28, `$|\\qq-U|=${fmt(st.diffNorm, 3)}$`, `|q−U| = ${fmt(st.diffNorm, 3)}`, { size: 11, fill: COLOR.text }));

  const plotX0 = 8;
  const plotW = w - 16;
  const logMin = 0; // log10(1)
  const logMax = Math.log10(12);
  const xAt = (v) => plotX0 + ((Math.log10(Math.max(v, 1)) - logMin) / (logMax - logMin)) * plotW;

  const axisY = h - 30;
  g.appendChild(svgEl('line', {
    x1: plotX0, y1: axisY, x2: plotX0 + plotW, y2: axisY, stroke: COLOR.border, 'stroke-width': 1,
  }));
  for (const tick of [1, 3, 10, 12]) {
    const tx = xAt(tick);
    g.appendChild(svgEl('line', { x1: tx, y1: axisY, x2: tx, y2: axisY + 5, stroke: COLOR.border }));
    g.appendChild(richText(tx, axisY + 16, String(tick), { anchor: 'middle', size: 9, fill: COLOR.neutral }));
  }
  // reference line at 3.
  const x3 = xAt(3);
  g.appendChild(svgEl('line', {
    x1: x3, y1: axisY - 95, x2: x3, y2: axisY, stroke: COLOR.theorem, 'stroke-width': 1.3, 'stroke-dasharray': '4,3',
  }));
  g.appendChild(richText(x3 + 4, axisY - 98, 'at most 3 on the adapted grid', { size: 9, fill: COLOR.theorem }));

  const barH = 22;
  const bars = [
    {
      y: axisY - 80, value: st.adaptedMismatch, label: 'adapted grid q = Q(m)', tex: 'adapted grid $\\qq=\\mathcal Q(\\m)$', color: COLOR.gridA,
    },
    {
      y: axisY - 40, value: st.euclideanMismatch, label: 'Euclidean grid', color: COLOR.neutral,
    },
  ];
  for (const b of bars) {
    g.appendChild(svgEl('rect', {
      x: plotX0, y: b.y, width: Math.max(xAt(b.value) - plotX0, 1), height: barH, fill: b.color, opacity: 0.85,
    }));
    g.appendChild(texText(plotX0, b.y - 4, b.tex || b.label, b.label, { size: 9.5, fill: COLOR.textDim }));
    g.appendChild(richText(xAt(b.value) + 4, b.y + barH / 2 + 3, fmt(b.value, 2), { size: 10, fill: COLOR.text }));
  }
}

function layoutBoxes(mode, vbW) {
  const rowY = 96;
  if (mode === 'wide') {
    const rowH = 300;
    return {
      vbW,
      a: {
        x: 16, y: rowY, w: 320, h: rowH,
      },
      b: {
        x: 356, y: rowY, w: 300, h: rowH,
      },
      c: {
        x: 676, y: rowY, w: 288, h: rowH,
      },
      totalH: rowY + rowH + 60,
    };
  }
  const panelW = vbW - 32;
  let y = rowY;
  const a = {
    x: 16, y, w: panelW, h: 260,
  };
  y += a.h + 80;
  const b = {
    x: 16, y, w: panelW, h: Math.min(panelW, 340),
  };
  y += b.h + 60;
  const c = {
    x: 16, y, w: panelW, h: 260,
  };
  y += c.h + 20;
  return {
    vbW, a, b, c, totalH: y,
  };
}

export function render(el, { theme = 'light', params = {} } = {}) {
  const pe = params.e || {};
  const pa = params.a || {};
  const pc = params.compare || {};
  const state = {
    e: pe.default ?? 4, a: pa.default ?? 30, compare: pc.default ?? false,
  };

  clear(el);
  const root = htmlEl('div', { class: 'd3-figure' });
  el.appendChild(root);

  const svg = makeSvg([0, 0, 980, 460], { ariaLabel: 'Adapted cubes: stretched to the metric, snapped to the lattice' });

  const controls = controlsBar();
  const eCtl = rangeControl({
    label: texSpan('eccentricity $e$', 'eccentricity e'),
    min: pe.range ? pe.range[0] : 1,
    max: pe.range ? pe.range[1] : 10,
    step: pe.step ?? 0.1,
    value: state.e,
    format: (v) => fmt(v, 1),
    onInput: (v) => { state.e = v; redraw(); },
  });
  const aCtl = rangeControl({
    label: texSpan('orientation $a$°', 'orientation a°'),
    min: pa.range ? pa.range[0] : 0,
    max: pa.range ? pa.range[1] : 179,
    step: pa.step ?? 1,
    value: state.a,
    format: (v) => fmt(v, 0),
    onInput: (v) => { state.a = v; redraw(); },
  });
  const cmpCtl = toggleControl({
    label: 'compare with a Euclidean cube',
    checked: state.compare,
    onChange: (v) => { state.compare = v; redraw(); },
  });
  controls.appendChild(eCtl.node);
  controls.appendChild(aCtl.node);
  controls.appendChild(cmpCtl.node);
  root.appendChild(controls);
  root.appendChild(svg);

  function redraw() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    const st = computeState(state);

    const mode = measuredWidth(root) < NARROW_BREAKPOINT ? 'narrow' : 'wide';
    const vbW = mode === 'wide' ? 980 : 480;
    const boxes = layoutBoxes(mode, vbW);
    svg.setAttribute('viewBox', `0 0 ${vbW} ${boxes.totalH}`);

    const header = group(16, 20);
    svg.appendChild(header);
    header.appendChild(texWrapped(
      0,
      0,
      '$F\\mapsto\\m=\\cmet(F)\\mapsto\\qq=\\mathcal Q(\\m)\\mapsto{}$ adapted cube (scale $j$) $=\\qq\\,$(unit cube, scale $j$)',
      'F -> m = cmet(F) -> q = Q(m) -> adapted cube (scale j) = q * (unit cube, scale j)',
      {
        maxWidth: vbW - 32, size: 13, fill: COLOR.text, lineHeight: 15,
      },
    ));
    header.appendChild(texText(0, 40, 'schematic toy run: $d=2$, $j_*=2$', 'schematic toy run: d = 2, j* = 2', { size: 9.5, fill: COLOR.textDim }));

    drawMetricToCube(svg, boxes.a.x, boxes.a.y, boxes.a.w, boxes.a.h, st);
    drawLattice(svg, boxes.b.x, boxes.b.y, boxes.b.w, boxes.b.h, st);
    drawMismatch(svg, boxes.c.x, boxes.c.y, boxes.c.w, boxes.c.h, st);

    const cap = snapshotControlsCaption(16, boxes.totalH - 8, [
      { label: 'e', value: fmt(state.e, 1) },
      { label: 'a', value: `${fmt(state.a, 0)}°` },
      { label: 'compare with a Euclidean cube', value: state.compare ? 'on' : 'off' },
    ], { maxWidth: vbW - 32 });
    if (cap) svg.appendChild(cap);
  }

  watchResize(root, redraw);
  redraw();
}
