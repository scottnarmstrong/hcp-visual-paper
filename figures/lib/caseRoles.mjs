// Shared colour/shape roles for the scale-selection case diagrams --
// fig.selection-alternatives (TikZ), fig.counting-scales and
// fig.determinant-ledger (D3) -- each spec's "Colour roles" section
// requires these stay IDENTICAL across the three figures. The TikZ figure
// maps the same roles onto its own sentinel-colour names
// (scripts/lib/tikzColors.mjs); the table below is the D3 side of that one
// shared mapping (kept in sync by eye, same as scripts/lib/figureSnapshot's
// THEME_COLORS -- both are small, reviewed tables rather than generated):
//
//   role          TikZ sentinel      CSS token          shape
//   startup       (none; slate)      --text-faint       open square
//   contraction   hcpSeriesBlue      --series-blue      filled circle
//   update        hcpAccent2         --accent-2         filled triangle (left)
//   obstruction4  hcpAccentStrong    --accent-strong     filled diamond
//   obstruction5  hcpAccentStrong    --accent-strong     hatched diamond
//   testfail      hcpAccentStrong    --accent-strong     open diamond
//   stop          hcpText            --text             star
//   threshold     hcpTextFaint       --text-faint       dashed line
//
// contraction is genuinely blue (not the warm --accent every other role in
// this family draws from): audit feedback found orange contraction marks
// indistinguishable from the obstruction role.
//
// Never rely on colour alone (both specs): every role also carries its own
// shape, so obstruction4/obstruction5/testfail sharing a colour is fine --
// they are still told apart by fill/hatch/outline.

export const CASE_ROLES = Object.freeze({
  startup: { token: '--text-faint', shape: 'square-open', label: 'startup' },
  contraction: { token: '--series-blue', shape: 'circle', label: 'contraction' },
  update: { token: '--accent-2', shape: 'triangle-left', label: 'geometry update' },
  obstruction4: { token: '--accent-strong', shape: 'diamond', label: 'determinant obstruction' },
  obstruction5: { token: '--accent-strong', shape: 'diamond-hatch', label: 'determinant obstruction' },
  testfail: { token: '--accent-strong', shape: 'diamond-open', label: 'failed test' },
  stop: { token: '--text', shape: 'star', label: 'stop' },
  threshold: { token: '--text-faint', shape: 'dashed', label: 'threshold' },
});

export function roleColor(role) {
  const r = CASE_ROLES[role];
  if (!r) throw new Error(`unknown case role: ${role}`);
  return `var(${r.token})`;
}

let hatchCounter = 0;

/** Ensure a diagonal-hatch <pattern> exists in `svg`'s <defs> for `role`,
 * returning its url(#id). Idempotent per (svg, role) pair. */
export function ensureHatchPattern(svg, role = 'obstruction5') {
  const key = `hcp-hatch-${role}`;
  let defs = svg.select('defs');
  if (defs.empty()) defs = svg.insert('defs', ':first-child');
  let pattern = defs.select(`#${key}`);
  if (pattern.empty()) {
    hatchCounter += 1;
    pattern = defs.append('pattern')
      .attr('id', key)
      .attr('patternUnits', 'userSpaceOnUse')
      .attr('width', 6).attr('height', 6)
      .attr('patternTransform', `rotate(${45 + (hatchCounter % 2) * 0})`);
    pattern.append('rect').attr('width', 6).attr('height', 6).attr('fill', 'none');
    pattern.append('line')
      .attr('x1', 0).attr('y1', 0).attr('x2', 0).attr('y2', 6)
      .attr('stroke', roleColor(role)).attr('stroke-width', 2);
  }
  return `url(#${key})`;
}

/**
 * Draw the shape for `role` centred at (cx, cy) with characteristic size
 * `size` (roughly a radius, in px) into D3 selection `parent`. Returns the
 * appended element. `svg` (the root <svg> selection) is needed to register
 * the hatch pattern the first time a hatched shape is drawn.
 */
export function drawCaseMarker(parent, svg, role, cx, cy, size = 6) {
  const r = CASE_ROLES[role];
  if (!r) throw new Error(`unknown case role: ${role}`);
  const color = roleColor(role);
  const g = parent.append('g').attr('class', `case-marker case-marker--${role}`);
  switch (r.shape) {
    case 'square-open': {
      g.append('rect')
        .attr('x', cx - size).attr('y', cy - size).attr('width', size * 2).attr('height', size * 2)
        .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 1.5);
      break;
    }
    case 'circle': {
      g.append('circle').attr('cx', cx).attr('cy', cy).attr('r', size).attr('fill', color);
      break;
    }
    case 'triangle-left': {
      const pts = [[cx + size, cy - size], [cx + size, cy + size], [cx - size, cy]];
      g.append('polygon').attr('points', pts.map((p) => p.join(',')).join(' ')).attr('fill', color);
      break;
    }
    case 'diamond': {
      const pts = [[cx, cy - size], [cx + size, cy], [cx, cy + size], [cx - size, cy]];
      g.append('polygon').attr('points', pts.map((p) => p.join(',')).join(' ')).attr('fill', color);
      break;
    }
    case 'diamond-hatch': {
      const fillUrl = ensureHatchPattern(svg, role);
      const pts = [[cx, cy - size], [cx + size, cy], [cx, cy + size], [cx - size, cy]];
      g.append('polygon').attr('points', pts.map((p) => p.join(',')).join(' '))
        .attr('fill', fillUrl).attr('stroke', color).attr('stroke-width', 1);
      break;
    }
    case 'diamond-open': {
      const pts = [[cx, cy - size], [cx + size, cy], [cx, cy + size], [cx - size, cy]];
      g.append('polygon').attr('points', pts.map((p) => p.join(',')).join(' '))
        .attr('fill', 'none').attr('stroke', color).attr('stroke-width', 1.5);
      break;
    }
    case 'star': {
      const spikes = 5;
      const outer = size * 1.15;
      const inner = size * 0.5;
      const pts = [];
      for (let i = 0; i < spikes * 2; i += 1) {
        const rad = i % 2 === 0 ? outer : inner;
        const ang = (Math.PI * i) / spikes - Math.PI / 2;
        pts.push([cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]);
      }
      g.append('polygon').attr('points', pts.map((p) => p.join(',')).join(' ')).attr('fill', color);
      break;
    }
    default:
      throw new Error(`unhandled case-marker shape: ${r.shape}`);
  }
  return g;
}
