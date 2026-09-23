// A figure's own "MUST HOLD" self-checks (content/figures/*.yaml design
// briefs: "assert in tests"): each figure module calls `invariant` on the
// numeric facts its brief asserts must hold for every slider setting, so a
// bug that would silently draw something false throws instead. The
// render-test files additionally sweep several parameter settings through
// `render()` specifically to exercise these checks.

export function invariant(cond, msg) {
  if (!cond) throw new Error(`figure invariant violated: ${msg}`);
}

export function approxEqual(a, b, tol = 1e-6) {
  return Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
}
