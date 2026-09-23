// Minimal real 2x2 matrix / symmetric-eigendecomposition helpers shared by
// the toy-run figures (content/figures/*.yaml "SHARED CONVENTIONS": R(a),
// m(e,a) = R(a) diag(1,e^2) R(a)^T, the shape map U(m) = |m^-1|^(1/2)
// m^(1/2), the rounding Q(m), projective distance, and the distortion
// K(q,q')). A matrix is the plain object {a,b,c,d} for [[a,b],[c,d]]
// (row-major); symmetric matrices used as metrics have b === c.

export function m2(a, b, c, d) { return { a, b, c, d }; }
export function identity2() { return m2(1, 0, 0, 1); }

export function matMul(A, B) {
  return m2(
    A.a * B.a + A.b * B.c, A.a * B.b + A.b * B.d,
    A.c * B.a + A.d * B.c, A.c * B.b + A.d * B.d,
  );
}

export function matVec(A, v) {
  return [A.a * v[0] + A.b * v[1], A.c * v[0] + A.d * v[1]];
}

export function transpose(A) { return m2(A.a, A.c, A.b, A.d); }
export function det2(A) { return A.a * A.d - A.b * A.c; }
export function scaleMat(A, s) { return m2(A.a * s, A.b * s, A.c * s, A.d * s); }

export function inv2(A) {
  const dt = det2(A);
  return m2(A.d / dt, -A.b / dt, -A.c / dt, A.a / dt);
}

/** R D R^T -- a diagonal matrix conjugated by rotation R (or any matrix). */
export function conj(R, D) { return matMul(matMul(R, D), transpose(R)); }

/** Rotation matrix R(a), a in degrees. */
export function rot(aDeg) {
  const t = (aDeg * Math.PI) / 180;
  const c = Math.cos(t);
  const s = Math.sin(t);
  return m2(c, -s, s, c);
}

function normalize(v) {
  const n = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / n, v[1] / n];
}

/**
 * Eigen-decomposition of a SYMMETRIC 2x2 matrix (b and c averaged, so a
 * matrix that is symmetric up to float error still works). Returns
 * `{ lo, hi, vLo, vHi }` with `lo <= hi` and unit eigenvectors `vLo`
 * (paired with `lo`), `vHi` (paired with `hi`, orthogonal to `vLo`).
 */
export function eigSym(A) {
  const bb = (A.b + A.c) / 2;
  const tr = A.a + A.d;
  const df = A.a - A.d;
  const rad = Math.sqrt(df * df + 4 * bb * bb);
  const hi = (tr + rad) / 2;
  const lo = (tr - rad) / 2;
  let vHi;
  if (Math.abs(bb) > 1e-12 || Math.abs(df) > 1e-12) {
    // (A - lo I) has vHi in its column space (rank <= 1); pick whichever
    // column is non-degenerate.
    const col = [A.a - lo, A.c];
    vHi = Math.hypot(col[0], col[1]) > 1e-12 ? normalize(col) : normalize([A.b, A.d - lo]);
  } else {
    vHi = [1, 0];
  }
  const vLo = [-vHi[1], vHi[0]];
  return { lo, hi, vLo, vHi };
}

/** M = l1 v1 v1^T + l2 v2 v2^T, for orthonormal v1, v2. */
function fromEig(l1, v1, l2, v2) {
  const a = l1 * v1[0] * v1[0] + l2 * v2[0] * v2[0];
  const b = l1 * v1[0] * v1[1] + l2 * v2[0] * v2[1];
  const d = l1 * v1[1] * v1[1] + l2 * v2[1] * v2[1];
  return m2(a, b, b, d);
}

export function powSym(A, p) {
  const { lo, hi, vLo, vHi } = eigSym(A);
  // Clamp a tiny float-noise negative eigenvalue (e.g. a mathematically
  // PSD matrix built as a difference of two nearly-equal PD matrices) to
  // zero -- otherwise a fractional power (sqrt, inverse-sqrt) of a
  // negative number is NaN.
  const loC = Math.max(lo, 0);
  const hiC = Math.max(hi, 0);
  return fromEig(loC ** p, vLo, hiC ** p, vHi);
}
export function sqrtSym(A) { return powSym(A, 0.5); }
export function invSqrtSym(A) { return powSym(A, -0.5); }

/** Operator (spectral) norm of a general 2x2 matrix: largest singular
 * value, i.e. sqrt of the largest eigenvalue of A^T A. */
export function opNorm(A) {
  const AtA = matMul(transpose(A), A);
  const { hi } = eigSym(AtA);
  return Math.sqrt(Math.max(hi, 0));
}

/** Operator norm of a SYMMETRIC matrix: largest |eigenvalue|. */
export function opNormSym(A) {
  const { lo, hi } = eigSym(A);
  return Math.max(Math.abs(lo), Math.abs(hi));
}

/** m(e,a) = R(a) diag(1, e^2) R(a)^T: metric of eccentricity e (>=1),
 * orientation a degrees. */
export function metric(e, aDeg) {
  const R = rot(aDeg);
  const D = m2(1, 0, 0, e * e);
  return matMul(matMul(R, D), transpose(R));
}

/** Eccentricity 𝔢(m) = (|m| |m^-1|)^(1/2) = sqrt(hi/lo). */
export function eccentricity(m) {
  const { lo, hi } = eigSym(m);
  return Math.sqrt(hi / lo);
}

/** U(m) = |m^-1|^(1/2) m^(1/2): m^(1/2) normalized so its smaller
 * eigenvalue is exactly 1 (eigenvalues (1, 𝔢(m)), same eigenvectors as m). */
export function shapeU(m) {
  const { lo, hi, vLo, vHi } = eigSym(m);
  return fromEig(1, vLo, Math.sqrt(hi / lo), vHi);
}

/** Q(m) with granularity j*: round each entry of U(m) up to the nearest
 * multiple of 3^-jStar (a tiny -1e-9 tolerance keeps exact multiples
 * fixed, matching the paper's rounding). */
export function roundQ(m, jStar = 2) {
  const U = shapeU(m);
  const scale = 3 ** jStar;
  const r = (x) => Math.ceil(scale * x - 1e-9) / scale;
  const b = r(U.b);
  const c = r(U.c);
  return m2(r(U.a), b, b, r(U.d)); // symmetric by construction (b applied to both off-diagonals)
}

/** Projective distance d_pr([m1],[m2]) = (1/2) log(hi(T)/lo(T)),
 * T = m1^{-1/2} m2 m1^{-1/2}. */
export function projectiveDistance(m1, m2) {
  const iS = invSqrtSym(m1);
  const T = matMul(matMul(iS, m2), iS);
  const { lo, hi } = eigSym(T);
  return 0.5 * Math.log(hi / lo);
}

/** K(p,p') = (1 + |p^-1 p'| + |p'^-1 p|)^4 (operator norms, d = 2 so the
 * exponent is 2d = 4). */
export function distortionK(p, pPrime) {
  const x = opNorm(matMul(inv2(p), pPrime));
  const y = opNorm(matMul(inv2(pPrime), p));
  return (1 + x + y) ** 4;
}

/** Axis lengths/orientation for an SVG <ellipse>, given explicit semi-axis
 * lengths `rMinor` (along `vMinor`) and `rMajor` (along `vMajor`, the same
 * pair `eigSym` returns as `vLo`/`vHi`). */
export function axesFromEig(rMinor, rMajor, vMinor, vMajor) {
  const angleDeg = (Math.atan2(vMajor[1], vMajor[0]) * 180) / Math.PI;
  return { rx: rMajor, ry: rMinor, angleDeg };
}

/** Ellipse {M^(1/2) x : |x| <= 1} of a symmetric positive-definite M, as
 * axis lengths and orientation for an SVG <ellipse>: `rx` along the
 * larger-eigenvalue axis, `angleDeg` its direction. */
export function ellipseOfMatrix(M) {
  const { lo, hi, vLo, vHi } = eigSym(M);
  return axesFromEig(Math.sqrt(Math.max(lo, 0)), Math.sqrt(Math.max(hi, 0)), vLo, vHi);
}

/**
 * Sampled boundary of the ellipse `{ x : centre + a*vMajor + b*vMinor,
 * a^2/rMajor^2 + b^2/rMinor^2 = 1 }`, as `n` points in math space (not yet
 * pixel-mapped). Used instead of an SVG `<ellipse transform="rotate(deg
 * cx cy)">` -- confirmed, empirically and repeatably, to rasterize in the
 * wrong place under this project's audit-snapshot pipeline (ImageMagick's
 * `convert` falling back to its bundled minimal SVG reader, no
 * `rsvg-convert` binary on this machine) whenever enough OTHER elements
 * precede it in the document; a plain multi-point path, like every polygon
 * these figures already draw, has no such failure mode.
 */
export function ellipseBoundary(center, rMinor, rMajor, vMinor, vMajor, n = 64) {
  const pts = [];
  for (let i = 0; i < n; i += 1) {
    const t = (2 * Math.PI * i) / n;
    const a = rMajor * Math.cos(t);
    const b = rMinor * Math.sin(t);
    pts.push([center[0] + a * vMajor[0] + b * vMinor[0], center[1] + a * vMajor[1] + b * vMinor[1]]);
  }
  return pts;
}

/** `ellipseBoundary` for the {M^(1/2)x : |x|<=1} convention. */
export function ellipseBoundaryOfMatrix(M, center = [0, 0], n = 64) {
  const { lo, hi, vLo, vHi } = eigSym(M);
  return ellipseBoundary(center, Math.sqrt(Math.max(lo, 0)), Math.sqrt(Math.max(hi, 0)), vLo, vHi, n);
}

/** The parallelogram that a symmetric or general 2x2 matrix `A` maps the
 * axis-aligned box `center + [-halfSide,halfSide]^2` to (corners in CCW
 * order starting bottom-left). */
export function mapBox(A, center = [0, 0], halfSide = 0.5) {
  const corners = [[-halfSide, -halfSide], [halfSide, -halfSide], [halfSide, halfSide], [-halfSide, halfSide]];
  return corners.map((v) => {
    const p = matVec(A, v);
    return [p[0] + center[0], p[1] + center[1]];
  });
}
