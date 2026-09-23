// content/figures/fig.averaging-classes.yaml -- "Averaging on a fixed
// grid: independent classes of children, and the parent below their
// average". Schematic, d = 2, j = j* = 2 (so 3^j = 9 length units).
//
// (a) children of a parent cube, coloured by residue class mod 3 --
//     separated far more than the unit range of dependence;
// (b) 2x2 stand-ins: parent <= child average, with a positive gap whose
//     mean is the determinant-loss-controlled decrease;
// (c) inset: the normalized child-mean ellipse always contains the unit
//     ball (semi-axes exp(sDelta/2), exp((1-s)Delta/2)).

import {
  metric, roundQ, matVec, mapBox, rot, matMul, transpose, m2, sqrtSym, eigSym, ellipseBoundaryOfMatrix, ellipseBoundary,
} from './lib/mat2.mjs';
import { polygonDistance } from './lib/geom2d.mjs';
import {
  makeSvg, group, richText, wrappedText, fitTransform, rangeControl, buttonGroup, controlsBar, fmt, COLOR, tint,
  snapshotControlsCaption, measuredWidth, watchResize,
} from './lib/svgkit.mjs';
import { texText, texWrapped, texSpan } from './lib/texLabel.mjs';
import { clear, svgEl, htmlEl } from './lib/dom.mjs';
import { invariant } from './lib/assert.mjs';

const J_STAR = 2;

function polyPath(pts) {
  return `${pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ')} Z`;
}

/** Exact separating-axis test for two convex polygons: true iff they
 * overlap (share any interior point). Used to find a label position
 * whose whole bounding box clears an outline, not merely a position
 * whose anchor point does -- a wide, short label can have every corner
 * outside a polygon while an edge still slices through its middle. */
function polygonsOverlap(A, B) {
  const axesOf = (poly) => poly.map((p, i) => {
    const q = poly[(i + 1) % poly.length];
    const nx = -(q[1] - p[1]);
    const ny = q[0] - p[0];
    const len = Math.hypot(nx, ny) || 1;
    return [nx / len, ny / len];
  });
  for (const [ax, ay] of [...axesOf(A), ...axesOf(B)]) {
    let aMin = Infinity; let aMax = -Infinity; let bMin = Infinity; let bMax = -Infinity;
    for (const [x, y] of A) { const p = x * ax + y * ay; aMin = Math.min(aMin, p); aMax = Math.max(aMax, p); }
    for (const [x, y] of B) { const p = x * ax + y * ay; bMin = Math.min(bMin, p); bMax = Math.max(bMax, p); }
    if (aMax < bMin || bMax < aMin) return false;
  }
  return true;
}

function diag(l1, l2) { return m2(l1, 0, 0, l2); }
function conj(R, D) { return matMul(matMul(R, D), transpose(R)); }
function sandwich(Msqrt, X) { return matMul(matMul(Msqrt, X), Msqrt); }
function sub(A, B) { return m2(A.a - B.a, A.b - B.b, A.c - B.c, A.d - B.d); }
function add(A, B) { return m2(A.a + B.a, A.b + B.b, A.c + B.c, A.d + B.d); }

/** M <= M' iff M' - M is positive semidefinite (both eigenvalues >= -eps). */
function leq(M, Mp) {
  const { lo } = eigSym(sub(Mp, M));
  return lo >= -1e-7;
}

function computeChildren(e, a, h) {
  const q = roundQ(metric(e, a), J_STAR);
  const j = J_STAR;
  const sideJ = 3 ** j;
  const half = (3 ** h - 1) / 2;
  const children = [];
  for (let w1 = -half; w1 <= half; w1 += 1) {
    for (let w2 = -half; w2 <= half; w2 += 1) {
      const center = matVec(q, [sideJ * w1, sideJ * w2]);
      const corners = mapBox(q, center, sideJ / 2);
      const res = [((w1 % 3) + 3) % 3, ((w2 % 3) + 3) % 3];
      children.push({
        w: [w1, w2], center, corners, res,
      });
    }
  }
  const parent = mapBox(q, [0, 0], 3 ** (j + h) / 2);
  invariant(children.length === 3 ** (2 * h), `expected 3^(2h) children, got ${children.length}`);
  return { q, parent, children };
}

function drawChildren(svg, x0, y0, w, h, state) {
  const g = group(x0, y0);
  svg.appendChild(g);
  g.appendChild(richText(w / 2, -12, '(a) children and classes', { anchor: 'middle', size: 12, fill: COLOR.textDim }));

  const { parent, children } = computeChildren(state.e, state.a, state.h);
  const bbox = { xMin: -1, xMax: 1, yMin: -1, yMax: 1 };
  for (const p of parent) {
    bbox.xMin = Math.min(bbox.xMin, p[0]); bbox.xMax = Math.max(bbox.xMax, p[0]);
    bbox.yMin = Math.min(bbox.yMin, p[1]); bbox.yMax = Math.max(bbox.yMax, p[1]);
  }
  const t = fitTransform(bbox, { x0: 0, y0: 16, w, h: h - 60 }, { pad: 14 });

  // MUST HOLD: same-class children separated by >= 3^j = 9, as SETS (the
  // true boundary-to-boundary distance between the two cells, not their
  // centers -- which can be well under the center spacing once q is
  // eccentric enough to make a cell's own diagonal comparable to it).
  const sideJ = 3 ** J_STAR;
  const byClass = new Map();
  for (const c of children) {
    const key = `${c.res[0]},${c.res[1]}`;
    if (!byClass.has(key)) byClass.set(key, []);
    byClass.get(key).push(c);
  }
  for (const list of byClass.values()) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j2 = i + 1; j2 < list.length; j2 += 1) {
        const { dist } = polygonDistance(list[i].corners, list[j2].corners);
        invariant(dist >= sideJ - 1e-6, `same-class children (as sets) closer than 3^j: ${dist}`);
      }
    }
  }
  invariant(byClass.size <= 9, `more than 3^d = 9 classes: ${byClass.size}`);

  const selKey = `${state.residue[0]},${state.residue[1]}`;
  for (const c of children) {
    const isSel = `${c.res[0]},${c.res[1]}` === selKey;
    const childPath = svgEl('path', {
      d: polyPath(c.corners.map(t.toPx)),
      fill: isSel ? tint('gridA', 0.55, state.theme) : 'none',
      stroke: isSel ? COLOR.gridA : COLOR.border,
      'stroke-width': isSel ? 1.4 : 0.6,
    });
    // MUST HOLD interaction (av.2's "hovering a child selects its class"):
    // a plain, always-visible dimension line/legend already carries the
    // load-bearing content, so this is a progressive-enhancement handler,
    // not the only way to read the figure.
    childPath.addEventListener('mouseenter', () => {
      state.residue = c.res;
      state.onResidueChange();
    });
    g.appendChild(childPath);
  }
  g.appendChild(svgEl('path', {
    d: polyPath(parent.map(t.toPx)), fill: 'none', stroke: COLOR.text, 'stroke-width': 2,
  }));

  const selChildren = byClass.get(selKey) || [];
  if (state.h >= 2 && selChildren.length >= 2) {
    let best = null;
    let bestD = Infinity;
    let bestPts = null;
    for (let i = 0; i < selChildren.length; i += 1) {
      for (let j2 = i + 1; j2 < selChildren.length; j2 += 1) {
        const res = polygonDistance(selChildren[i].corners, selChildren[j2].corners);
        if (res.dist < bestD) {
          bestD = res.dist; best = [selChildren[i], selChildren[j2]]; bestPts = [res.pointA, res.pointB];
        }
      }
    }
    if (best) {
      // The dimension line runs between the two children's NEAREST
      // BOUNDARY points (bestPts), not their centers.
      const [p1, p2] = bestPts.map((pt) => t.toPx(pt));
      g.appendChild(svgEl('line', {
        x1: p1[0], y1: p1[1], x2: p2[0], y2: p2[1], stroke: COLOR.theorem, 'stroke-width': 1.2, 'stroke-dasharray': '3,2',
      }));
      g.appendChild(texText((p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2 - 6, 'separation $\\geq3^j$', 'separation ≥ 3^j', {
        anchor: 'middle', size: 8.5, fill: COLOR.theorem, halo: true,
      }));
      // scale bar of length 1 (range of dependence), drawn NEXT TO the
      // dimension line, not off in the corner of the bounding box.
      const mid = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
      const dirX = p2[0] - p1[0];
      const dirY = p2[1] - p1[1];
      const len = Math.hypot(dirX, dirY) || 1;
      // The perpendicular is taken on the side pointing DOWN the page, so the
      // bar and its label land below the dimension line, toward the free space
      // under the parent (the class caption now sits above the plot, under the
      // panel title, where a label pushed upward would collide with it).
      const flip = dirX < 0 ? -1 : 1;
      const perpX = (-dirY / len) * flip;
      const perpY = (dirX / len) * flip;
      const barOffset = 16;
      const barPxLen = t.scale * 1; // "range of dependence 1" in the same units
      const bx0 = mid[0] + perpX * barOffset;
      const by0 = mid[1] + perpY * barOffset;
      g.appendChild(svgEl('line', {
        x1: bx0 - dirX / len * barPxLen / 2, y1: by0 - dirY / len * barPxLen / 2, x2: bx0 + dirX / len * barPxLen / 2, y2: by0 + dirY / len * barPxLen / 2, stroke: COLOR.text, 'stroke-width': 2,
      }));
      // The label is pushed out along the SAME perpendicular direction as
      // the scale bar (which stays put, right beside the separation
      // line), stepping out until its whole bounding box clears the
      // parent's outline -- a single fixed pixel offset crossed that
      // outline at some slider settings, since the parent's shape and the
      // dimension line's own direction both change with e/a/h.
      const parentPx = parent.map(t.toPx);
      const labelText = 'range of dependence 1';
      const labelW = 92; // >= this fixed label's rendered width at size 8, plus margin
      const labelHalfH = 8;
      let extra = 10;
      for (; extra <= 220; extra += 6) {
        const cx = bx0 + perpX * extra;
        const cy = by0 + perpY * extra + 4;
        const labelBox = [
          [cx - labelW / 2, cy - labelHalfH], [cx + labelW / 2, cy - labelHalfH],
          [cx + labelW / 2, cy + labelHalfH], [cx - labelW / 2, cy + labelHalfH],
        ];
        if (!polygonsOverlap(labelBox, parentPx)) break;
      }
      const lx = bx0 + perpX * extra;
      const ly = by0 + perpY * extra + 4;
      g.appendChild(richText(lx, ly, labelText, { anchor: 'middle', size: 8, fill: COLOR.text }));
      // Leader from the label back to the scale bar: once the label has been
      // pushed clear of the parent outline it can sit well away from the bar
      // it names, and without a leader the two no longer read as one unit.
      // It ends just short of the label's own box (on the bar's side).
      const leaderEnd = Math.max(extra - labelHalfH - 2, 0);
      if (leaderEnd > 4) {
        g.appendChild(svgEl('line', {
          x1: bx0, y1: by0, x2: bx0 + perpX * leaderEnd, y2: by0 + perpY * leaderEnd, stroke: COLOR.text, 'stroke-width': 0.8, 'stroke-dasharray': '2,2',
        }));
      }
    }
  } else if (state.h === 1) {
    g.appendChild(texText(4, h - 44, '$h=1$: one child per class', 'h=1: one child per class', { size: 9, fill: COLOR.textDim }));
  }

  // Above the plot, under the panel title: at the bottom it collided with the
  // "range of dependence 1" label once that label is pushed below the parent.
  g.appendChild(texWrapped(4, 6, 'classes: residue of $w$ mod 3 (at most $3^d$)', 'classes: residue of w mod 3 (at most 3^d)', {
    maxWidth: w - 8, size: 9, fill: COLOR.textDim, lineHeight: 11,
  }));
}

function orderMatrices(Delta, s) {
  const E_P = conj(rot(20), diag(1.0, 0.45));
  const P = conj(rot(-35), diag(Math.exp(s * Delta), Math.exp((1 - s) * Delta)));
  const sqrtEP = sqrtSym(E_P);
  const E_C = sandwich(sqrtEP, P);
  let V = conj(rot(60), diag(0.12, -0.06));
  let B = conj(rot(50), diag(1.6, 0.5));
  const gapBase = sub(E_C, E_P);
  const { lo: gapLo } = eigSym(gapBase);
  invariant(gapLo >= -1e-7, 'E_C - E_P is not positive semidefinite');
  const sqrtGap = sqrtSym(gapBase);

  function build(vScale, bScale) {
    const Vs = m2(V.a * vScale, V.b * vScale, V.c * vScale, V.d * vScale);
    const Bs = m2(B.a * bScale, B.b * bScale, B.c * bScale, B.d * bScale);
    const G = add(E_C, Vs);
    const Dg = sandwich(sqrtGap, Bs);
    const F = sub(G, Dg);
    return { G, Dg, F };
  }

  let vScale = 1;
  let bScale = 1;
  let { G, Dg, F } = build(vScale, bScale);
  let tries = 0;
  while (eigSym(F).lo <= 1e-6 && tries < 40) {
    vScale *= 0.85; bScale *= 0.85; tries += 1;
    ({ G, Dg, F } = build(vScale, bScale));
  }
  invariant(eigSym(F).lo > 0, 'parent matrix F is not positive definite');
  invariant(leq(F, G), 'F is not <= G');
  invariant(leq(E_P, E_C), 'E_P is not <= E_C');

  return {
    E_P, E_C, G, F, P,
  };
}

function drawOrderPanel(svg, x0, y0, w, h, state) {
  const g = group(x0, y0);
  svg.appendChild(g);
  g.appendChild(richText(w / 2, -12, '(b) order of parent and child average', { anchor: 'middle', size: 12, fill: COLOR.textDim }));
  g.appendChild(texText(0, 12, 'schematic: $2\\times2$ stand-ins for $2d\\times2d$ matrices', 'schematic: 2×2 stand-ins for 2d×2d matrices', { size: 9, fill: COLOR.textDim }));
  g.appendChild(texWrapped(0, 26, "convention: $M$ drawn as the ellipse $\\{M^{\\nf12}x:|x|\\leq1\\}$; $M\\leq M'$ means the ellipse of $M$ lies inside that of $M'$", 'convention: M drawn as the ellipse {M^(1/2)x : |x|≤1}; M≤M’ means the ellipse of M lies inside that of M’', {
    maxWidth: w - 10, size: 8, fill: COLOR.textDim, lineHeight: 10,
  }));

  const {
    E_P, E_C, G, F,
  } = orderMatrices(state.Delta, state.s);
  const diagH = h - 130;
  const extent = Math.sqrt(eigSym(G).hi) * 1.35 + 0.2;
  const t = fitTransform({
    xMin: -extent, xMax: extent, yMin: -extent, yMax: extent,
  }, {
    x0: 0, y0: 56, w: w - 20, h: diagH,
  }, { pad: 10 });

  function ellipsePts(M) {
    // A sampled-boundary <path>, not an <ellipse transform="rotate(...)">
    // -- confirmed, repeatably, to rasterize in the wrong place under this
    // project's audit-snapshot pipeline once enough other elements precede
    // it (ImageMagick's `convert` falling back to its bundled minimal SVG
    // reader; no `rsvg-convert` binary on this machine). A plain
    // multi-point path has no such failure mode anywhere else in these
    // figures.
    return ellipseBoundaryOfMatrix(M, [0, 0]).map(t.toPx);
  }
  function ellipseNode(pts, attrs) {
    return svgEl('path', { d: polyPath(pts), ...attrs });
  }
  /** Topmost point of a sampled ellipse boundary, for a direct on-diagram
   * label (min pixel y = highest on screen). */
  function topPoint(pts) {
    return pts.reduce((best, p) => (p[1] < best[1] ? p : best), pts[0]);
  }

  const ptsG = ellipsePts(G);
  const ptsF = ellipsePts(F);
  const ptsEC = ellipsePts(E_C);
  const ptsEP = ellipsePts(E_P);

  // gap ring between F and G: fill G's whole ellipse with a light theorem
  // tint, then paint F's ellipse back over it in the panel's own ground
  // colour, leaving only the F..G annulus tinted -- two native <ellipse>s,
  // not a hand-built even-odd arc path (this renderer's fallback SVG
  // reader does not reliably rasterize elliptical-arc path commands).
  if (state.Delta > 1e-4) {
    g.appendChild(ellipseNode(ptsG, { fill: tint('theorem', 0.32, state.theme), stroke: 'none' }));
    g.appendChild(ellipseNode(ptsF, { fill: COLOR.surface, stroke: 'none' }));
  }

  // E_C and E_P get DIFFERENT dash patterns and colour roles (not just
  // "both dashed textDim"), so the two mean-ellipses -- close in size by
  // construction -- stay distinguishable on the diagram and in the legend
  // without relying on their labels alone.
  const EC_DASH = '2,3';
  const EP_DASH = '6,3';
  g.appendChild(ellipseNode(ptsEC, {
    fill: 'none', stroke: COLOR.textDim, 'stroke-width': 1, 'stroke-dasharray': EC_DASH,
  }));
  g.appendChild(ellipseNode(ptsEP, {
    fill: 'none', stroke: COLOR.neutral, 'stroke-width': 1.2, 'stroke-dasharray': EP_DASH,
  }));
  g.appendChild(ellipseNode(ptsG, { fill: 'none', stroke: COLOR.gridA, 'stroke-width': 2 }));
  g.appendChild(ellipseNode(ptsF, { fill: 'none', stroke: COLOR.theorem, 'stroke-width': 2 }));

  // Direct labels AT each ellipse (its topmost sampled point), not just a
  // legend: the two dashed mean-ellipses were otherwise indistinguishable
  // on the diagram itself.
  const gTop = topPoint(ptsG);
  const fTop = topPoint(ptsF);
  const ecTop = topPoint(ptsEC);
  const epTop = topPoint(ptsEP);
  // Several of these ellipses are very close in size at some slider
  // settings (that closeness is the point -- G = E_C + a small
  // fluctuation), so their topmost points can nearly coincide; stack the
  // labels with a minimum vertical gap instead of letting them overlap.
  // Each label gets its OWN horizontal column (dx) rather than sharing the
  // ellipses' common x: with every leader anchored at the same x, a label
  // stacked above another sat directly on that other label's leader line,
  // and a leader from a higher label ran straight down through the text
  // of every label stacked below it.
  const directLabels = [
    {
      top: gTop, text: 'G', tex: '$G$', color: COLOR.gridA, dx: 0,
    },
    {
      top: fTop, text: 'F', tex: '$F$', color: COLOR.theorem, dx: -18,
    },
    {
      top: ecTop, text: 'E_C', tex: '$E_C$', color: COLOR.textDim, dx: 18,
    },
    {
      top: epTop, text: 'E_P', tex: '$E_P$', color: COLOR.neutral, dx: -36,
    },
  ].sort((p, q) => p.top[1] - q.top[1]);
  // Several of these ellipses are very close in size at some slider
  // settings (that closeness is the point -- G = E_C + a small
  // fluctuation), so their topmost points can nearly coincide; stack the
  // labels with a minimum vertical gap instead of letting them overlap.
  let lastLabelY = Infinity;
  for (const d of directLabels) {
    const naturalY = d.top[1] - 6;
    const ly = Math.min(naturalY, lastLabelY - 11);
    lastLabelY = ly;
    const lx = d.top[0] + d.dx;
    g.appendChild(texText(lx, ly, d.tex, d.text, { anchor: 'middle', size: 8.5, fill: d.color }));
    // Leader line from the label down to the ellipse point it names: when
    // stacking pushes a label away from its own ellipse (to avoid
    // colliding with a neighbouring label), the label alone no longer
    // reads unambiguously as belonging to that curve. It runs from the
    // label's own column to the point it names, so it clears every other
    // label's text instead of running straight through their column.
    g.appendChild(svgEl('line', {
      x1: lx, y1: ly + 3, x2: d.top[0], y2: d.top[1] - 1, stroke: d.color, 'stroke-width': 0.8,
    }));
  }

  // Legend: fixed rows below the diagram (not tied to ellipse geometry,
  // which can put several of these very close together and overlap).
  // Swatches for E_C/E_P use the SAME distinct colour/dash pair as the
  // ellipses themselves, not identical swatches for two different means.
  const legendY0 = 56 + diagH + 16;
  const legendRows = [
    ['G = child average G', COLOR.gridA, null, '$G$ = child average $G$'],
    ['F = parent A(cube_{j+h}^q)', COLOR.theorem, null, '$F$ = parent $\\bfA(\\cus_{j+h}^{\\qq})$'],
    ['E_C = E[G] = Ahom_{j,q}', COLOR.textDim, EC_DASH, '$E_C=\\E[G]=\\bfAhom_{j,\\qq}$'],
    ['E_P = Ahom_{j+h,q}', COLOR.neutral, EP_DASH, '$E_P=\\bfAhom_{j+h,\\qq}$'],
  ];
  legendRows.forEach(([label, color, dash, tex], i) => {
    const ly = legendY0 + i * 12;
    g.appendChild(svgEl('line', {
      x1: 0, y1: ly - 3, x2: 14, y2: ly - 3, stroke: color, 'stroke-width': 2.2, 'stroke-dasharray': dash,
    }));
    g.appendChild(texText(18, ly, tex, label, { size: 8.5, fill: color }));
  });
  if (state.Delta > 1e-4) {
    g.appendChild(texText(
      18,
      legendY0 + 4 * 12 + 2,
      'shaded ring: gap $\\geq0$ (mean $=\\bfAhom_{j,\\qq}-\\bfAhom_{j+h,\\qq}$)',
      'shaded ring: gap ≥ 0 (mean = Ahom_{j,q} − Ahom_{j+h,q})',
      { size: 8, fill: COLOR.theorem },
    ));
  } else {
    g.appendChild(wrappedText(18, legendY0 + 4 * 12 + 2, 'no determinant loss: the gap has mean zero, so it vanishes almost surely', {
      maxWidth: w * 0.6, size: 8, fill: COLOR.textDim, lineHeight: 10,
    }));
  }

  // (c) is a SMALL inset in (b)'s lower-right CORNER, not a full-height
  // side column.
  const insetW = Math.min(w * 0.36, 190);
  const insetH = Math.min(h * 0.42, 190);
  drawInset(g, w - insetW - 4, h - insetH - 4, insetW, insetH, state);
}

function drawInset(g, x0, y0, w, h, state) {
  const ig = group(x0, y0);
  g.appendChild(ig);
  ig.appendChild(svgEl('rect', {
    x: 0, y: 0, width: w, height: h, fill: COLOR.surface, stroke: COLOR.border, 'stroke-width': 1,
  }));
  ig.appendChild(richText(4, 11, '(c)', { size: 8.5, fill: COLOR.textDim }));
  ig.appendChild(texWrapped(4, 23, 'normalized by $\\bfAhom_{j+h,\\qq}$', 'normalized by Ahom_{j+h,q}', {
    maxWidth: w - 8, size: 7.5, fill: COLOR.textDim, lineHeight: 9,
  }));

  const rMajor = Math.exp(Math.max(state.s, 1 - state.s) * state.Delta / 2);
  invariant(rMajor >= 1 - 1e-9, 'P ellipse does not contain the unit circle');
  const extent = rMajor * 1.3 + 0.15;
  const t = fitTransform({
    xMin: -extent, xMax: extent, yMin: -extent, yMax: extent,
  }, {
    x0: 0, y0: 30, w, h: h * 0.55 - 12,
  }, { pad: 8 });
  const [cx, cy] = t.toPx([0, 0]);
  ig.appendChild(svgEl('circle', {
    cx, cy, r: t.scale, fill: 'none', stroke: COLOR.textDim, 'stroke-width': 1, 'stroke-dasharray': '2,2',
  }));
  ig.appendChild(texText(cx, cy + t.scale + 10, '$\\Itwod$', 'I_{2d}', { anchor: 'middle', size: 8, fill: COLOR.textDim }));

  const rx = Math.exp(state.s * state.Delta / 2);
  const ry = Math.exp((1 - state.s) * state.Delta / 2);
  const dirMajor = matVec(rot(-35), [1, 0]);
  const dirMinor = matVec(rot(-35), [0, 1]);
  const pPts = ellipseBoundary([0, 0], ry, rx, dirMinor, dirMajor).map((p) => t.toPx([p[0], p[1]]));
  ig.appendChild(svgEl('path', {
    d: polyPath(pPts), fill: 'none', stroke: COLOR.theorem, 'stroke-width': 1.6,
  }));
  ig.appendChild(texText(cx, cy - ry * t.scale - 6, '$P_{j,j+h}^{\\qq}$', 'P_{j,j+h}^q', { anchor: 'middle', size: 8, fill: COLOR.theorem }));

  // Only the slider value Delta is a printed number here (brief): the
  // eigenvalue product e^Delta is stated symbolically, not computed.
  ig.appendChild(texWrapped(4, h * 0.55 + 26, 'eigenvalues $\\geq1$, product $e^{\\Delta}$', 'eigenvalues ≥ 1, product e^Δ', {
    maxWidth: w - 8, size: 7.5, fill: COLOR.text, lineHeight: 9,
  }));
  ig.appendChild(texWrapped(4, h * 0.55 + 46, '$\\tr(P-\\Itwod)\\leq e^{\\Delta}-1$ (gap); $|P|\\leq e^{\\Delta}$ (normalization)', 'tr(P−I)≤e^Δ−1 (gap); |P|≤e^Δ (normalization)', {
    maxWidth: w - 8, size: 7.5, fill: COLOR.text, lineHeight: 9,
  }));
  ig.appendChild(texText(4, h - 6, `$\\Delta=${fmt(state.Delta, 2)}$`, `Δ = ${fmt(state.Delta, 2)}`, { size: 8.5, fill: COLOR.textDim }));
}

const NARROW_BREAKPOINT = 700;

function layoutBoxes(mode, vbW) {
  if (mode === 'wide') {
    return {
      vbW,
      a: {
        x: 20, y: 70, w: 480, h: 440,
      },
      b: {
        x: 540, y: 70, w: 560, h: 440,
      },
      totalH: 560,
    };
  }
  const panelW = vbW - 40;
  return {
    vbW,
    a: {
      x: 20, y: 70, w: panelW, h: 420,
    },
    b: {
      x: 20, y: 610, w: panelW, h: 480,
    },
    totalH: 1120,
  };
}

export function render(el, { theme = 'light', params = {} } = {}) {
  const pH = params.h || {};
  const pE = params.e || {};
  const pA = params.a || {};
  const pRes = params.residue || {};
  const pDelta = params.Delta || {};
  const pS = params.s || {};

  const defResidue = (() => {
    const m = /\((\d),(\d)\)/.exec(pRes.default || '(0,0)');
    return m ? [Number(m[1]), Number(m[2])] : [0, 0];
  })();

  const state = {
    h: pH.default ?? 2,
    e: pE.default ?? 2.5,
    a: pA.default ?? 30,
    residue: defResidue,
    Delta: pDelta.default ?? 0.35,
    s: pS.default ?? 0.7,
    theme,
  };

  clear(el);
  const root = htmlEl('div', { class: 'd3-figure' });
  el.appendChild(root);

  const svg = makeSvg([0, 0, 1120, 560], { ariaLabel: 'Averaging on a fixed grid: independent classes of children, and the parent below their average' });

  const controls = controlsBar();
  const hCtl = buttonGroup({
    label: texSpan('$h$', 'h'),
    options: (pH.values || [1, 2, 3]).map((v) => ({ value: v, label: String(v) })),
    value: state.h,
    onChange: (v) => { state.h = Number(v); redraw(); },
  });
  const eCtl = rangeControl({
    label: texSpan('$e$', 'e'), min: pE.range ? pE.range[0] : 1, max: pE.range ? pE.range[1] : 5, step: pE.step ?? 0.1, value: state.e, format: (v) => fmt(v, 1), onInput: (v) => { state.e = v; redraw(); },
  });
  const aCtl = rangeControl({
    label: texSpan('$a$°', 'a°'), min: 0, max: 179, step: 1, value: state.a, format: (v) => fmt(v, 0), onInput: (v) => { state.a = v; redraw(); },
  });
  const deltaCtl = rangeControl({
    label: texSpan('$\\Delta$', 'Δ'), min: 0, max: 1, step: 0.01, value: state.Delta, format: (v) => fmt(v, 2), onInput: (v) => { state.Delta = v; redraw(); },
  });
  const sCtl = rangeControl({
    label: texSpan('$s$', 's'), min: 0, max: 1, step: 0.05, value: state.s, format: (v) => fmt(v, 2), onInput: (v) => { state.s = v; redraw(); },
  });
  controls.appendChild(hCtl.node);
  controls.appendChild(eCtl.node);
  controls.appendChild(aCtl.node);
  controls.appendChild(deltaCtl.node);
  controls.appendChild(sCtl.node);

  const picker = htmlEl('div', {
    class: 'fig-control fig-control--buttons', role: 'group', 'aria-label': 'residue class picker',
  });
  picker.style.display = 'inline-grid';
  // `auto` columns (were 1.6em): a "w1,w2" label in a padded pill button
  // is wider than 1.6em and was clipped to "0," in each cell.
  picker.style.gridTemplateColumns = 'repeat(3, auto)';
  picker.style.gap = '2px';
  const pickerButtons = [];
  for (let w1 = 0; w1 <= 2; w1 += 1) {
    for (let w2 = 0; w2 <= 2; w2 += 1) {
      const btn = htmlEl('button', {
        type: 'button', class: 'fig-btn', 'aria-label': `residue (${w1},${w2})`, style: 'padding:2px 7px;',
      }, [`${w1},${w2}`]);
      btn.addEventListener('click', () => {
        state.residue = [w1, w2];
        pickerButtons.forEach((b) => b.el.classList.toggle('is-active', b.w1 === w1 && b.w2 === w2));
        redraw();
      });
      pickerButtons.push({
        el: btn, w1, w2,
      });
      picker.appendChild(btn);
    }
  }
  controls.appendChild(picker);
  root.appendChild(controls);
  root.appendChild(svg);

  state.onResidueChange = () => { redraw(); };

  function redraw() {
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    pickerButtons.forEach((b) => b.el.classList.toggle('is-active', b.w1 === state.residue[0] && b.w2 === state.residue[1]));

    const mode = measuredWidth(root) < NARROW_BREAKPOINT ? 'narrow' : 'wide';
    const boxes = layoutBoxes(mode, mode === 'wide' ? 1120 : 480);
    svg.setAttribute('viewBox', `0 0 ${boxes.vbW} ${boxes.totalH}`);

    drawChildren(svg, boxes.a.x, boxes.a.y, boxes.a.w, boxes.a.h, state);
    drawOrderPanel(svg, boxes.b.x, boxes.b.y, boxes.b.w, boxes.b.h, state);

    const cap = snapshotControlsCaption(20, boxes.totalH - 8, [
      { label: 'h', value: state.h },
      { label: 'e', value: fmt(state.e, 1) },
      { label: 'a', value: `${fmt(state.a, 0)}°` },
      { label: 'residue', value: `(${state.residue[0]},${state.residue[1]})` },
      { label: 'Δ', value: fmt(state.Delta, 2) },
      { label: 's', value: fmt(state.s, 2) },
    ], { maxWidth: boxes.vbW - 40 });
    if (cap) svg.appendChild(cap);
  }

  watchResize(root, redraw);
  redraw();
}
