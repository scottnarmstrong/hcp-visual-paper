// fig.determinant-ledger (content/figures/fig.determinant-ledger.yaml):
// Schematic (loss heights are made up; panel (a)'s combinatorics is exact).
// Two panels in ONE <svg> (see fig.polynomial-entry.js's header comment for
// why a multi-panel D3 figure must be a single root <svg>): panel (a) is
// interactive (hover/focus a scale column, a slider for h, a toggle), panel
// (b) is a static telescoping plot.
//
// `d3` is the global from vendor/d3.min.js -- no import here.
/* global d3 */

import {
  cssVar, assert, showAssertionError, makeSliderControl, makeButtonControl, drawSnapshotCaption,
} from './lib/theme.mjs';
import { d3TexLabel } from './lib/texLabel.mjs';
import { drawCaseMarker, roleColor, ensureHatchPattern } from './lib/caseRoles.mjs';

const VB_W = 640;
const PAD_L = 34;
const PAD_R = 16;

const L_FIXED = 2; // fig.determinant-ledger.yaml parameters.L (fixed, schematic)

/**
 * The exact synthetic schedule (fig.determinant-ledger.yaml PANEL (a)):
 * startup [0,h]; length-h steps at n=h and n=2h; a length-2L obstruction
 * interval [3h,3h+2L]; length-h steps at n=3h+2L and n=4h+2L; departure by
 * a partial change of geometry at n* = 5h+2L (old geometry ends at
 * n*+2L, next geometry starts at n*+L).
 */
export function computeSchedule(h, L = L_FIXED) {
  const steps = [h, 2 * h, 3 * h + 2 * L, 4 * h + 2 * L];
  const obstruction = [3 * h, 3 * h + 2 * L];
  const nStar = 5 * h + 2 * L;
  const axisEnd = nStar + 2 * L;
  return {
    h, L, steps, obstruction, nStar, axisEnd, startup: [0, h],
  };
}

/** Row-A staircase segments: for every length-h step at n and every
 * a in {n+1,...,n+h}, the segment [a-h,a] (fig.determinant-ledger.yaml).
 * Returns { segmentsByStep, coverage } where coverage[r] counts how many
 * segments cover unit column [r,r+1). */
export function computeRowA(schedule) {
  const { steps, h, axisEnd } = schedule;
  const coverage = new Array(axisEnd).fill(0);
  const segmentsByStep = steps.map((n, stepIdx) => {
    const segs = [];
    for (let j = 0; j < h; j += 1) {
      const a = n + 1 + j;
      const from = a - h;
      const to = a;
      segs.push({
        from, to, row: j, stepIdx,
      });
      for (let r = from; r < to; r += 1) coverage[r] += 1;
    }
    return segs;
  });
  return { segmentsByStep, coverage };
}

function checkMustHold(schedule, rowA) {
  const { h, axisEnd } = schedule;
  const maxA = Math.max(...rowA.coverage);
  assert(maxA === h, `max over columns of A must equal h (${h}); got ${maxA}`);
  for (let r = 0; r < axisEnd; r += 1) {
    assert(rowA.coverage[r] <= h, `A must never exceed h at column ${r}`);
  }
  // No A segment starts before k+1 = 1 (n >= h >= k + h with k = 0).
  for (const segs of rowA.segmentsByStep) {
    for (const s of segs) assert(s.from >= 1, 'no A segment may start before k+1');
  }
}

function drawColumnBars(g, x, y0, h0, values, fill, fillOpacity) {
  const bars = [];
  for (let r = 0; r < values.length; r += 1) {
    const bar = g.append('rect')
      .attr('x', x(r)).attr('y', y0 - values[r] * h0).attr('width', Math.max(1, x(r + 1) - x(r) - 0.6))
      .attr('height', values[r] * h0)
      .attr('fill', fill).attr('fill-opacity', fillOpacity == null ? 1 : fillOpacity);
    bars.push(bar);
  }
  return bars;
}

function drawPanelA(g, svg, state) {
  g.append('text').attr('x', PAD_L).attr('y', 12).attr('font-size', 12).attr('font-weight', 600)
    .attr('fill', cssVar('--text')).text('How often a one-scale loss is counted');

  const schedule = computeSchedule(state.h);
  const rowA = computeRowA(schedule);
  checkMustHold(schedule, rowA);

  const showAll = !state.onlyBound;
  const domainEnd = showAll ? schedule.axisEnd : 3 * schedule.h;

  const width = VB_W;
  const x = d3.scaleLinear().domain([0, domainEnd]).range([PAD_L, width - PAD_R]);

  // Row layout, bottom to top: axis -> one-scale loss bars -> Row C ->
  // Row B -> Row group A (h sub-rows). Extra headroom above row A for the
  // formula line and the interaction badge (audit feedback: both used to
  // collide with the section title).
  // Each label has its own band, clear of the bars above and below it:
  // the typeset labels (sub/superscripts on Delta, the sum's limits) are
  // taller than the plain-text ones this spacing was first set for.
  const axisY = 290;
  const lossBarBaseline = axisY - 6;
  const lossBarMaxH = 20;
  const lossLabelY = lossBarBaseline - lossBarMaxH - 6;
  const rowCY = lossLabelY - 11; // row C bar: [rowCY - 6, rowCY]
  const rowCLabelY = rowCY - 13;
  const rowBY = rowCLabelY - 12; // row B bars: [rowBY - 6, rowBY]
  const rowAUnit = 12;
  const rowATop = rowBY - 28 - schedule.h * rowAUnit;

  g.append('line').attr('x1', x(0)).attr('x2', x(domainEnd)).attr('y1', axisY).attr('y2', axisY)
    .attr('stroke', cssVar('--border'));

  // Unit ticks at EVERY scale (minor), plus labelled major ticks at k and
  // every multiple of h relative to k -- "k", "k+h", "k+2h", ... -- never
  // bare numbers.
  for (let r = 0; r <= domainEnd; r += 1) {
    g.append('line').attr('x1', x(r)).attr('x2', x(r)).attr('y1', axisY).attr('y2', axisY + (r % schedule.h === 0 ? 4 : 2))
      .attr('stroke', cssVar('--text-faint')).attr('stroke-width', r % schedule.h === 0 ? 1 : 0.5);
  }
  const majorTicks = [[0, 'k']];
  for (let m = 1; m * schedule.h <= domainEnd && m <= 4; m += 1) {
    majorTicks.push([m * schedule.h, m === 1 ? 'k+h' : `k+${m}h`]);
  }
  if (showAll) {
    majorTicks.push([schedule.nStar, 'n_i'], [schedule.nStar + schedule.L, 'n_i+L'], [schedule.nStar + 2 * schedule.L, 'n_i+2L']);
  }
  for (const [pos, label] of majorTicks) {
    if (pos > domainEnd) continue;
    d3TexLabel(g, {
      x: x(pos), y: axisY + 15, anchor: 'middle', size: 8, fill: cssVar('--text-faint'), clamp: [0, width],
    }, `$${label}$`, label);
    if (label === 'n_i+L') {
      g.append('text').attr('x', x(pos)).attr('y', axisY + 26).attr('text-anchor', 'middle')
        .attr('font-size', 7.5).attr('font-style', 'italic').attr('fill', cssVar('--text-faint'))
        .text('next grid starts here');
    }
  }

  // One-scale loss bars: schematic heights, one tall bar inside the
  // obstruction interval. Labelled Delta_{r,r+1}^q, not left to the
  // caption alone.
  const nCols = domainEnd;
  const lossHeights = new Array(nCols).fill(0).map((_v, r) => {
    if (showAll && r >= schedule.obstruction[0] && r < schedule.obstruction[1]) {
      const mid = Math.floor((schedule.obstruction[0] + schedule.obstruction[1]) / 2);
      return r === mid ? 1 : 0.35;
    }
    return 0.28 + 0.1 * Math.abs(Math.sin(r * 1.7));
  });
  drawColumnBars(g, x, lossBarBaseline, lossBarMaxH, lossHeights, cssVar('--text-faint'), 0.55);
  d3TexLabel(g, {
    x: PAD_L, y: lossLabelY, size: 7.5, fill: cssVar('--text-faint'),
  }, '$\\Delta_{r,r+1}^{\\qq}$\u2002(schematic heights)', 'Δ_{r,r+1}^q  (schematic heights)');

  // Row C: the full-span loss charged once in the partial-change estimate
  // -- the full explanation is drawn, not just left to a hover title.
  let rowCRect = null;
  if (showAll) {
    rowCRect = g.append('rect')
      .attr('x', x(0)).attr('y', rowCY - 6).attr('width', x(schedule.axisEnd) - x(0)).attr('height', 6)
      .attr('fill', roleColor('update')).attr('data-role', 'C');
    d3TexLabel(g, {
      x: PAD_L, y: rowCLabelY, size: 7.5, fill: cssVar('--text-dim'),
    }, '$\\Delta_{k_i,n_i+2L}^{\\qq_i}$: the full loss in the partial-change estimate, charged once, when this geometry is left by a partial change',
    'Δ^{q_i}_{k_i,n_i+2L}: the full loss in the partial-change estimate, charged once, when this geometry is left by a partial change');
  }

  // Row B: startup + obstruction intervals (disjoint). BOTH are gated on
  // showAll: the synchronized-only toggle must hide all of row B, not just
  // the obstruction half (audit feedback: the startup interval used to
  // stay drawn -- and counted -- in that view).
  let startupRect = null;
  let obstructionRect = null;
  if (showAll) {
    startupRect = g.append('rect')
      .attr('x', x(schedule.startup[0])).attr('y', rowBY - 6)
      .attr('width', x(Math.min(schedule.startup[1], domainEnd)) - x(schedule.startup[0])).attr('height', 6)
      .attr('fill', roleColor('startup')).attr('data-role', 'B');
    startupRect.append('title').text('startup interval after a change of geometry');
    const hatchUrl = ensureHatchPattern(svg, 'obstruction4');
    obstructionRect = g.append('rect')
      .attr('x', x(schedule.obstruction[0])).attr('y', rowBY - 6)
      .attr('width', x(schedule.obstruction[1]) - x(schedule.obstruction[0])).attr('height', 6)
      .attr('fill', hatchUrl).attr('stroke', roleColor('obstruction4')).attr('data-role', 'B');
    obstructionRect.append('title').text('obstruction interval');
    d3TexLabel(g, {
      x: PAD_L, y: rowBY - 12, size: 7.5, fill: cssVar('--text-faint'),
    }, 'length-$h$/$H$ intervals after a change, length-$2L$ obstructions: disjoint', 'length-h/H intervals after a change, length-2L obstructions: disjoint');
  }

  // Row group A: staircase segments, alternating tint by step.
  const rowARects = [];
  for (const segs of rowA.segmentsByStep) {
    if (!showAll && segs[0].stepIdx >= 2) continue; // toggle: only first two steps
    for (const seg of segs) {
      const y = rowATop + (schedule.h - 1 - seg.row) * rowAUnit;
      const rect = g.append('rect')
        .attr('x', x(seg.from)).attr('y', y).attr('width', Math.max(1, x(seg.to) - x(seg.from)))
        .attr('height', rowAUnit - 2)
        .attr('fill', roleColor('contraction')).attr('fill-opacity', seg.stepIdx % 2 === 0 ? 0.95 : 0.4)
        // A thin background-colour seam around every segment so two
        // adjacent steps' touching segments (e.g. step k's row ending
        // exactly where step k+1's row begins) always show a visible
        // boundary, instead of blending into one long bar when their
        // tints are close (audit feedback: "adjacent segments of
        // successive steps merge visually into long blue bars").
        .attr('stroke', cssVar('--surface')).attr('stroke-width', 0.75)
        .attr('data-from', seg.from).attr('data-to', seg.to).attr('data-step', seg.stepIdx);
      rowARects.push(rect);
    }
  }
  // One dashed guide per step BOUNDARY (where one step's staircase ends
  // and the next begins), spanning the full row-A height: makes the
  // per-step grouping unambiguous even where two steps' touching segments
  // share a similar tint (see the seam/opacity fix above).
  const shownSteps = schedule.steps.filter((_n, i) => showAll || i < 2);
  for (let i = 1; i < shownSteps.length; i += 1) {
    const boundaryX = x(shownSteps[i]);
    g.append('line').attr('x1', boundaryX).attr('x2', boundaryX)
      .attr('y1', rowATop - 2).attr('y2', rowATop + schedule.h * rowAUnit)
      .attr('stroke', cssVar('--text-faint')).attr('stroke-dasharray', '2,2').attr('stroke-width', 0.75);
  }
  d3TexLabel(g, {
    x: PAD_L, y: rowATop - 12, size: 8, fill: cssVar('--text-dim'),
  }, '$\\widehat\\Delta_h^{\\qq}(n)=\\sum_{a=n+1}^{n+h}\\Delta_{a-h,a}^{\\qq}$', 'Δˆ_h^q(n) = Σ_{a=n+1}^{n+h} Δ_{a-h,a}^q');

  // Legend: the shared case-role markers this row scheme draws from.
  const legendY = 30;
  const legendItems = [['startup', 'startup'], ['contraction', 'synchronized loss (A)'], ['update', 'partial-change loss (C)']];
  let lx = PAD_L;
  for (const [role, label] of legendItems) {
    drawCaseMarker(g, svg, role, lx + 5, legendY, 5);
    g.append('text').attr('x', lx + 13).attr('y', legendY + 3).attr('font-size', 7.5)
      .attr('fill', cssVar('--text-dim')).text(label);
    lx += 13 + label.length * 4.3 + 12;
  }

  if (!showAll) {
    // Toggle view: bracket + formula for the synchronized-loss bound.
    const m0 = schedule.h;
    const K = 2;
    const braceFrom = m0 + 1 - schedule.h;
    const braceTo = m0 + K * schedule.h;
    const bY = axisY + 34;
    g.append('path')
      .attr('d', `M ${x(braceFrom)} ${bY} L ${x(braceFrom)} ${bY + 6} L ${x(braceTo)} ${bY + 6} L ${x(braceTo)} ${bY}`)
      .attr('fill', 'none').attr('stroke', cssVar('--text-faint'));
    d3TexLabel(g, {
      x: (x(braceFrom) + x(braceTo)) / 2, y: bY + 20, anchor: 'middle', size: 8.5, fill: cssVar('--text'),
    }, '$\\sum_{k=0}^{1}\\widehat\\Delta_h^{\\qq}(m_0+kh)\\leq h\\Delta_{m_0+1-h,m_0+2h}^{\\qq}$,\u2002$m_0=k+h$',
    'Σ_{k=0}^{1} Δˆ_h^q(m0+kh) ≤ h Δ_{m0+1-h,m0+2h}^q,  m0=k+h');
  }

  // Interaction: hover/focus a unit column -> highlight A/B/C (including
  // the containing B/C intervals, not just A segments) and the column
  // itself, and show a badge with every stated bound (A<=h, B<=1, C<=1,
  // total<=h+2 -- not just the total). Columns are real, focusable,
  // labelled elements (keyboard access + screen readers, not hover-only).
  const badge = g.append('g').attr('class', 'ledger-badge').style('display', 'none');
  const badgeRect = badge.append('rect').attr('rx', 4).attr('fill', cssVar('--surface')).attr('stroke', cssVar('--border'));
  // The badge's text is redrawn on every highlight (a typeset label is a
  // foreignObject, not a <text> whose content can be swapped).
  const badgeTextG = badge.append('g');

  function countsAt(r) {
    const a = rowA.coverage[r] || 0;
    const inStartup = showAll && r >= schedule.startup[0] && r < schedule.startup[1];
    const inObstruction = showAll && r >= schedule.obstruction[0] && r < schedule.obstruction[1];
    const b = (inStartup || inObstruction) ? 1 : 0;
    const c = showAll ? 1 : 0;
    return {
      a, b, c, total: a + b + c, inStartup, inObstruction,
    };
  }

  const selectionRect = g.insert('rect', ':first-child').attr('class', 'ledger-selection')
    .attr('y', rowATop - 4).attr('height', axisY - rowATop + 4)
    .attr('fill', cssVar('--accent')).attr('fill-opacity', 0.08).attr('stroke', cssVar('--text')).attr('stroke-dasharray', '2,2')
    .style('display', 'none');

  function highlight(r) {
    for (const rect of rowARects) {
      const from = Number(rect.attr('data-from'));
      const to = Number(rect.attr('data-to'));
      const inside = r >= from && r < to;
      rect.attr('stroke', inside ? cssVar('--text') : null).attr('stroke-width', inside ? 1.5 : null);
    }
    const counts = countsAt(r);
    if (startupRect) startupRect.attr('stroke', counts.inStartup ? cssVar('--text') : null).attr('stroke-width', counts.inStartup ? 1.5 : null);
    if (obstructionRect) obstructionRect.attr('stroke-width', counts.inObstruction ? 2 : 1);
    if (rowCRect) rowCRect.attr('stroke', showAll ? cssVar('--text') : null).attr('stroke-width', showAll ? 1 : null);
    selectionRect.attr('x', x(r)).attr('width', Math.max(1, x(r + 1) - x(r))).style('display', null);
    const text = `A:${counts.a} (≤h)  B:${counts.b} (≤1)  C:${counts.c} (≤1)  total:${counts.total} (≤h+2)`;
    badgeTextG.selectAll('*').remove();
    const badgeNode = d3TexLabel(badgeTextG, {
      x: 0, y: 0, size: 9, fill: cssVar('--text'), plain: true,
    }, `A: ${counts.a} ($\\leq h$)\u2003B: ${counts.b} ($\\leq1$)\u2003C: ${counts.c} ($\\leq1$)\u2003total: ${counts.total} ($\\leq h+2$)`, text);
    // jsdom (the headless renderer used by the audit-snapshot pipeline and
    // this figure's own tests) does not implement SVGElement.getBBox(), so
    // the badge box is sized from an estimated character width rather than
    // a measured bounding box -- approximate, but portable everywhere this
    // figure actually runs. A typeset badge reports its measured width.
    const estWidth = badgeNode.hcpTexBox ? badgeNode.hcpTexBox.w : text.length * 5.2;
    badgeRect.attr('x', -5).attr('y', -10).attr('width', estWidth + 10).attr('height', 16);
    badge.attr('transform', `translate(${Math.min(Math.max(x(r), PAD_R), width - PAD_R - estWidth - 20)},${rowATop - 34})`);
    badge.style('display', null);
  }

  const defaultCol = rowA.coverage.indexOf(schedule.h);
  const cols = g.append('g').attr('class', 'ledger-columns');
  for (let r = 0; r < domainEnd; r += 1) {
    const counts = countsAt(r);
    const colRect = cols.append('rect')
      .attr('x', x(r)).attr('y', rowATop - 4).attr('width', Math.max(1, x(r + 1) - x(r)))
      .attr('height', axisY - rowATop + 4)
      .attr('fill', 'transparent').attr('tabindex', 0).attr('role', 'button')
      .attr('aria-label', `scale ${r}: A=${counts.a} (≤h) B=${counts.b} (≤1) C=${counts.c} (≤1) total=${counts.total} (≤h+2)`)
      .on('pointerenter focus', () => highlight(r))
      .on('pointerleave blur', () => { if (r !== defaultCol) highlight(defaultCol); });
    void colRect;
  }
  if (defaultCol >= 0) highlight(defaultCol);

  // In the synchronized-bound view the bracket and its formula sit below
  // the axis (bY + 20 = axisY + 54): leave room for them, or they run into
  // panel (b)'s title.
  return axisY + (showAll ? 40 : 66);
}

function gridPath(x, y, points) {
  return points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p[0])} ${y(p[1])}`).join(' ');
}

function drawPanelB(g, y0) {
  g.append('text').attr('x', PAD_L).attr('y', y0 + 12).attr('font-size', 12).attr('font-weight', 600)
    .attr('fill', cssVar('--text')).text('Telescoping across changes of geometry');

  const width = VB_W;
  const plotTop = y0 + 40;
  const plotH = 150;
  const plotBottom = plotTop + plotH;
  const PAD_L_B = 56; // wider than PAD_L: room for the y-axis label + the
  // "log det <= d log(24Pi)" bracket text, which used to clip past x=0.

  const grids = [
    {
      role: 'grid-0', color: cssVar('--text-faint'), dash: null, range: [0, 14], points: [[0, 10], [4, 9.3], [6, 7.6], [6.3, 6.9], [14, 6.8]],
    },
    {
      role: 'grid-1', color: cssVar('--accent'), dash: '5,2', range: [12, 26], points: [[12, 7.05], [18, 5.6], [26, 4.0]],
    },
    {
      role: 'grid-2', color: cssVar('--accent-2'), dash: '2,2', range: [24, 34], points: [[24, 4.2], [30, 3.8], [34, 3.6]],
    },
  ];

  const x = d3.scaleLinear().domain([0, 34]).range([PAD_L_B, width - 150]);
  const y = d3.scaleLinear().domain([0, 10.5]).range([plotBottom, plotTop]);

  // Axis lines + labels (scale on x, log det on y) and numeric y-ticks.
  g.append('line').attr('x1', x(0)).attr('x2', x(0)).attr('y1', plotTop - 6).attr('y2', plotBottom).attr('stroke', cssVar('--border'));
  for (const t of d3.ticks(0, 10, 5)) {
    g.append('line').attr('x1', x(0) - 3).attr('x2', x(0)).attr('y1', y(t)).attr('y2', y(t)).attr('stroke', cssVar('--text-faint'));
    g.append('text').attr('x', x(0) - 5).attr('y', y(t) + 3).attr('text-anchor', 'end').attr('font-size', 7)
      .attr('fill', cssVar('--text-faint')).text(t);
  }
  d3TexLabel(g, {
    x: PAD_L_B - 44,
    y: (plotTop + plotBottom) / 2,
    size: 8,
    fill: cssVar('--text-faint'),
    transform: `rotate(-90, ${PAD_L_B - 44}, ${(plotTop + plotBottom) / 2})`,
  }, '$\\log\\det\\bfAhom_{r,\\qq}$', 'log det A_r^q');
  d3TexLabel(g, {
    x: (x(0) + x(34)) / 2, y: plotBottom + 26, anchor: 'middle', size: 8, fill: cssVar('--text-faint'), plain: true,
  }, 'scale $r$', 'scale r');

  // Floor and axis.
  g.append('line').attr('x1', x(0)).attr('x2', x(34)).attr('y1', y(0)).attr('y2', y(0)).attr('stroke', cssVar('--border'));
  d3TexLabel(g, {
    x: x(34) + 4, y: y(0) + 3, size: 8, fill: cssVar('--text-faint'), plain: true,
  }, '$\\det\\geq1$', 'det ≥ 1');

  // n_0, Id identification at the very start of grid 0.
  d3TexLabel(g, {
    x: x(0) + 3, y: y(10) - 8, size: 7.5, fill: cssVar('--text-faint'),
  }, '$n_0,\\Id$', 'n_0, Id');

  for (const grid of grids) {
    g.append('path').attr('d', gridPath(x, y, grid.points)).attr('fill', 'none')
      .attr('stroke', grid.color).attr('stroke-width', 2)
      .attr('stroke-dasharray', grid.dash || null)
      .append('title').text(grid.role);
  }

  // Dotted connectors at each change: left by L, slightly up. Each one
  // now gets its OWN endpoint markers + n_i+2L/n_i+L labels and a small
  // "L" bracket spanning the leftward shift -- audit feedback: neither
  // change was labelled, so the prescribed leftward-by-L restart was not
  // clearly communicated, and the connectors were hard to pick out from
  // the curves themselves at the small vertical separation shown.
  for (let i = 0; i < grids.length - 1; i += 1) {
    const oldGrid = grids[i];
    const newGrid = grids[i + 1];
    const oldEnd = oldGrid.points[oldGrid.points.length - 1];
    const newStart = newGrid.points[0];
    const sub = grids.length > 2 ? (i === 0 ? 'i' : 'i+1') : 'i';
    g.append('line').attr('x1', x(oldEnd[0])).attr('y1', y(oldEnd[1])).attr('x2', x(newStart[0])).attr('y2', y(newStart[1]))
      .attr('stroke', cssVar('--text')).attr('stroke-width', 1.25).attr('stroke-dasharray', '1.5,2');
    g.append('circle').attr('cx', x(oldEnd[0])).attr('cy', y(oldEnd[1])).attr('r', 2.2).attr('fill', oldGrid.color);
    g.append('circle').attr('cx', x(newStart[0])).attr('cy', y(newStart[1])).attr('r', 2.2).attr('fill', newGrid.color);
    d3TexLabel(g, {
      x: x(oldEnd[0]) + 3, y: y(oldEnd[1]) + 11, size: 6.5, fill: cssVar('--text-dim'), halo: true,
    }, `$n_{${sub}}+2L$`, `n_{${sub}}+2L`);
    d3TexLabel(g, {
      x: x(newStart[0]) - 3, y: y(newStart[1]) + 11, anchor: 'end', size: 6.5, fill: cssVar('--text-dim'), halo: true,
    }, `$n_{${sub}}+L$`, `n_{${sub}}+L`);
    // "L" bracket spanning the leftward shift, just below the connector.
    const bY = Math.max(y(oldEnd[1]), y(newStart[1])) + 24;
    g.append('path')
      .attr('d', `M ${x(newStart[0])} ${bY - 3} L ${x(newStart[0])} ${bY} L ${x(oldEnd[0])} ${bY} L ${x(oldEnd[0])} ${bY - 3}`)
      .attr('fill', 'none').attr('stroke', cssVar('--text-faint'));
    d3TexLabel(g, {
      x: (x(oldEnd[0]) + x(newStart[0])) / 2, y: bY + 9, anchor: 'middle', size: 7, fill: cssVar('--text-faint'), plain: true,
    }, '$L$', 'L');
    if (i === 0) {
      d3TexLabel(g, {
        x: (x(oldEnd[0]) + x(newStart[0])) / 2,
        y: (y(oldEnd[1]) + y(newStart[1])) / 2 - 6,
        anchor: 'middle',
        size: 7.5,
        fill: cssVar('--text-faint'),
        plain: true,
      }, '$\\leq2d\\log(1+\\delta)$ (exaggerated)', '≤ 2d log(1+δ) (exaggerated)');
    }
  }

  // Left bracket from 0 to the start value, with its bound labelled next
  // to it -- previously a bare text label anchored past the left edge of
  // the viewBox, clipping everything but its trailing characters.
  // Well clear of the y-axis tick numbers ("0"/"10", right-anchored at
  // x(0)-5): those can be 2 characters wide, so x(0)-10 used to sit right
  // on top of them (audit feedback).
  const bracketX = x(0) - 26;
  g.append('path')
    .attr('d', `M ${bracketX + 4} ${y(0)} L ${bracketX} ${y(0)} L ${bracketX} ${y(grids[0].points[0][1])} L ${bracketX + 4} ${y(grids[0].points[0][1])}`)
    .attr('fill', 'none').attr('stroke', cssVar('--text-dim'));
  d3TexLabel(g, {
    x: x(0), y: plotTop - 12, size: 7.5, fill: cssVar('--text-dim'),
  }, '$\\log\\det\\bfAhom_{n_0,\\Id}\\leq d\\log(24\\Pi)$', 'log det A_{n_0,Id} ≤ d log(24Π)');

  d3TexLabel(g, {
    x: width - 146, y: plotTop + 10, size: 8, fill: cssVar('--text-dim'), plain: true,
  }, 'sum of drops $\\leq d\\log(24\\Pi)$', 'sum of drops ≤ d log(24Π)');
  d3TexLabel(g, {
    x: width - 146, y: plotTop + 22, size: 8, fill: cssVar('--text-dim'), plain: true,
  }, '$+\\,2Nd\\log(1+\\delta)$;', '+ 2Nd log(1+δ);');
  g.append('text').attr('x', width - 146).attr('y', plotTop + 34).attr('font-size', 8)
    .attr('fill', cssVar('--text-dim'))
    .text('retained decrease pays');
  g.append('text').attr('x', width - 146).attr('y', plotTop + 46).attr('font-size', 8)
    .attr('fill', cssVar('--text-dim'))
    .text('for the jumps.');

  // Must clear the "scale r" x-axis label at plotBottom+26 (it was
  // returning plotBottom+14, clipping that label below the SVG's own
  // viewBox height -- audit feedback).
  return plotBottom + 40;
}

function checkPanelBMustHold() {
  const grids = [
    [[0, 10], [14, 6.8]], [[12, 7.05], [26, 4.0]], [[24, 4.2], [34, 3.6]],
  ];
  for (const [start, end] of grids) {
    assert(end[1] <= start[1], 'each grid curve must be non-increasing');
    assert(end[1] >= 0, 'nothing may go below det >= 1 (log det >= 0)');
  }
}

export function render(el, {
  theme = 'light', params = {}, snapshot = false,
} = {}) {
  try {
    renderInner(el, params, snapshot);
  } catch (err) {
    showAssertionError(el, 'fig.determinant-ledger', err.message);
  }
}

function renderInner(el, params, snapshot) {
  el.innerHTML = '';
  el.classList.add('figure-det-ledger');
  // One column wrapper for the banner, controls and SVG: the mount itself
  // (.figure-mount) is a centring flex ROW, which laid these side by side
  // and shrank the SVG to a sliver.
  const root = document.createElement('div');
  root.className = 'd3-figure';
  root.style.cssText = 'display:flex;flex-direction:column;gap:8px;width:100%;min-width:0;';
  el.appendChild(root);
  checkPanelBMustHold();

  const hParam = (params && params.h) || {
    min: 2, max: 6, step: 1, default: 3,
  };
  const idPrefix = elId(el);

  const controls = document.createElement('div');
  controls.className = 'figure-controls';
  const hCtl = makeSliderControl({
    id: `${idPrefix}-h`,
    label: 'h',
    labelTex: '$h$',
    min: hParam.min,
    max: hParam.max,
    step: hParam.step,
    value: hParam.default,
    formatValue: (v) => `drawn with h=${v}`,
    formatTex: (v) => `drawn with $h=${v}$`,
  });
  const toggleBtn = makeButtonControl({ id: `${idPrefix}-toggle`, label: 'only the synchronized-loss bound' });
  toggleBtn.setAttribute('aria-pressed', 'false');
  controls.append(hCtl.wrap, toggleBtn);
  root.appendChild(controls);

  const svgHost = document.createElement('div');
  root.appendChild(svgHost);

  const state = { h: hParam.default, onlyBound: false };

  function redraw() {
    svgHost.innerHTML = '';
    const svg = d3.select(svgHost).append('svg')
      .attr('width', '100%')
      .attr('role', 'img')
      .attr('aria-label', 'Determinant-loss ledger: how often a one-scale loss is counted, and telescoping across changes of geometry');

    let captionHeight = 0;
    if (snapshot) {
      const capG = svg.append('g');
      captionHeight = drawSnapshotCaption(capG, VB_W, [
        `h (slider ${hParam.min}..${hParam.max} step ${hParam.step}, default ${hParam.default}; drawn with h=${state.h})`,
        `L = ${L_FIXED} (fixed, schematic; 2L is the obstruction/test interval length)`,
        `toggle "only the synchronized-loss bound": ${state.onlyBound ? 'on' : 'off (default)'}`,
      ]);
    }
    const yOff = captionHeight + (captionHeight > 0 ? 8 : 0);
    const body = svg.append('g').attr('transform', `translate(0,${yOff})`);

    const gA = body.append('g').attr('transform', 'translate(0,0)');
    const yAfterA = drawPanelA(gA, svg, state);

    const gB = body.append('g');
    const yAfterB = drawPanelB(gB, yAfterA + 10);

    svg.attr('viewBox', `0 0 ${VB_W} ${yAfterB + yOff}`);
  }

  hCtl.input.addEventListener('input', () => {
    state.h = Number(hCtl.input.value);
    redraw();
  });
  toggleBtn.addEventListener('click', () => {
    state.onlyBound = !state.onlyBound;
    toggleBtn.setAttribute('aria-pressed', String(state.onlyBound));
    toggleBtn.classList.toggle('is-active', state.onlyBound);
    redraw();
  });

  redraw();
}

let idCounter = 0;
const idMap = new WeakMap();
function elId(el) {
  if (!idMap.has(el)) {
    idCounter += 1;
    idMap.set(el, `fig-det-ledger-${idCounter}`);
  }
  return idMap.get(el);
}
