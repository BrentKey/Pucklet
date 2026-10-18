import { mean } from './stats'

// Statistical tests for charts. Everything here is written from the textbook definitions;
// distribution functions use the regularized incomplete beta / gamma functions.

// ---------------------------------------------------------------------------------------
// Special functions

const LANCZOS = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313, -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7]

/** ln Γ(x) for x > 0 (Lanczos approximation, g = 7). */
export function lgamma(x: number): number {
  if (x < 0.5) return Math.log(Math.PI / Math.abs(Math.sin(Math.PI * x))) - lgamma(1 - x)
  x -= 1
  let a = LANCZOS[0]
  const t = x + 7.5
  for (let i = 1; i < 9; i++) a += LANCZOS[i] / (x + i)
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a)
}

const EPS = 1e-15
const TINY = 1e-300

/** Continued fraction for the incomplete beta function (modified Lentz). */
function betaFraction(a: number, b: number, x: number): number {
  let c = 1
  let d = 1 - ((a + b) * x) / (a + 1)
  if (Math.abs(d) < TINY) d = TINY
  d = 1 / d
  let h = d
  for (let m = 1; m <= 1000; m++) {
    const m2 = 2 * m
    // Even step.
    let num = (m * (b - m) * x) / ((a + m2 - 1) * (a + m2))
    d = 1 + num * d
    if (Math.abs(d) < TINY) d = TINY
    c = 1 + num / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    h *= d * c
    // Odd step.
    num = (-(a + m) * (a + b + m) * x) / ((a + m2) * (a + m2 + 1))
    d = 1 + num * d
    if (Math.abs(d) < TINY) d = TINY
    c = 1 + num / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < EPS) break
  }
  return h
}

/** Regularized incomplete beta I_x(a, b). */
export function ibeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1
  const lnFront = lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x)
  // The fraction converges fastest on this side of the mean; use symmetry otherwise.
  if (x < (a + 1) / (a + b + 2)) return (Math.exp(lnFront) * betaFraction(a, b, x)) / a
  return 1 - (Math.exp(lnFront) * betaFraction(b, a, 1 - x)) / b
}

/** Regularized upper incomplete gamma Q(a, x) = Γ(a, x) / Γ(a). */
export function gammaQ(a: number, x: number): number {
  if (x <= 0) return 1
  const lnFront = a * Math.log(x) - x - lgamma(a)
  if (x < a + 1) {
    // Series for P(a, x).
    let sum = 1 / a
    let term = sum
    for (let n = 1; n < 1000; n++) {
      term *= x / (a + n)
      sum += term
      if (Math.abs(term) < Math.abs(sum) * EPS) break
    }
    return 1 - sum * Math.exp(lnFront)
  }
  // Continued fraction for Q(a, x) (modified Lentz).
  let b = x + 1 - a
  let c = 1 / TINY
  let d = 1 / b
  let h = d
  for (let i = 1; i < 1000; i++) {
    const an = -i * (i - a)
    b += 2
    d = an * d + b
    if (Math.abs(d) < TINY) d = TINY
    c = b + an / c
    if (Math.abs(c) < TINY) c = TINY
    d = 1 / d
    const del = d * c
    h *= del
    if (Math.abs(del - 1) < EPS) break
  }
  return Math.exp(lnFront) * h
}

/** Upper tail of the standard normal, P(Z > z). */
export function normalSf(z: number): number {
  if (z < 0) return 1 - normalSf(-z)
  return 0.5 * gammaQ(0.5, (z * z) / 2)
}

export const normalCdf = (z: number): number => normalSf(-z)

/** Upper tail of Student's t, P(T > t). */
export function tSf(t: number, df: number): number {
  const tail = 0.5 * ibeta(df / (df + t * t), df / 2, 0.5)
  return t >= 0 ? tail : 1 - tail
}

/** Upper tail of the F distribution, P(F > f). */
export function fSf(f: number, d1: number, d2: number): number {
  if (f <= 0) return 1
  return ibeta(d2 / (d2 + d1 * f), d2 / 2, d1 / 2)
}

/** Upper tail of the chi-squared distribution. */
export const chi2Sf = (x: number, df: number): number => gammaQ(df / 2, x / 2)

// Gauss–Legendre nodes and weights (computed once by Newton iteration on P_n).
function gaussLegendre(n: number): { x: number[]; w: number[] } {
  const x: number[] = []
  const w: number[] = []
  for (let i = 1; i <= n; i++) {
    let z = Math.cos((Math.PI * (i - 0.25)) / (n + 0.5))
    let dp = 0
    for (let it = 0; it < 100; it++) {
      let p0 = 1
      let p1 = z
      for (let k = 2; k <= n; k++) {
        const p2 = ((2 * k - 1) * z * p1 - (k - 1) * p0) / k
        p0 = p1
        p1 = p2
      }
      dp = (n * (z * p1 - p0)) / (z * z - 1)
      const dz = p1 / dp
      z -= dz
      if (Math.abs(dz) < 1e-15) break
    }
    x.push(z)
    w.push(2 / ((1 - z * z) * dp * dp))
  }
  return { x, w }
}

const GL = gaussLegendre(16)

/** ∫ fn over [a, b] split into `parts` panels of 16-point Gauss–Legendre. */
function integrate(fn: (x: number) => number, a: number, b: number, parts: number): number {
  const h = (b - a) / parts
  let total = 0
  for (let p = 0; p < parts; p++) {
    const mid = a + h * (p + 0.5)
    for (let i = 0; i < GL.x.length; i++) total += GL.w[i] * fn(mid + (h / 2) * GL.x[i])
  }
  return (total * h) / 2
}

// Quadrature over z for the range distribution, with φ(z) and Φ(z) worked out once.
const RANGE_Z = (() => {
  const z: number[] = []
  const w: number[] = []
  const parts = 6
  const h = 17 / parts
  for (let p = 0; p < parts; p++) {
    const mid = -8.5 + h * (p + 0.5)
    GL.x.forEach((x, i) => {
      const zi = mid + (h / 2) * x
      z.push(zi)
      w.push(((GL.w[i] * h) / 2) * (Math.exp(-0.5 * zi * zi) / Math.sqrt(2 * Math.PI)))
    })
  }
  return { z, w, cdf: z.map((zi) => normalCdf(zi)) }
})()

/** CDF of the range of k standard normals: k ∫ φ(z) [Φ(z) − Φ(z − w)]^(k−1) dz. */
function rangeCdf(w: number, k: number): number {
  if (w <= 0) return 0
  const { z, w: wt, cdf } = RANGE_Z
  let total = 0
  for (let i = 0; i < z.length; i++) total += wt[i] * Math.pow(cdf[i] - normalCdf(z[i] - w), k - 1)
  return k * total
}

/** Upper tail of the studentized range distribution, P(Q > q) for k groups and df error degrees of freedom. */
export function ptukeySf(q: number, k: number, df: number): number {
  if (q <= 0) return 1
  if (!Number.isFinite(df) || df > 5000) return Math.max(0, 1 - rangeCdf(q, k))
  // Q = R / s with s = sqrt(χ²_df / df); integrate over the density of s.
  const lnC = (df / 2) * Math.log(df) - lgamma(df / 2) - (df / 2 - 1) * Math.LN2
  const dens = (s: number) => (s <= 0 ? 0 : Math.exp(lnC + (df - 1) * Math.log(s) - (df * s * s) / 2))
  const spread = 12 / Math.sqrt(2 * df)
  const lo = Math.max(0, 1 - spread)
  const hi = 1 + spread
  const p = integrate((s) => dens(s) * (1 - rangeCdf(q * s, k)), lo, hi, 8)
  return Math.min(1, Math.max(0, p))
}

// ---------------------------------------------------------------------------------------
// Tests

export interface TestResult {
  statistic: number
  p: number
  df?: number | [number, number]
}

function variance(v: number[]): number {
  const m = mean(v)
  return v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1)
}

/** Welch's unequal-variance t-test, two-sided. */
export function welchT(a: number[], b: number[]): TestResult | null {
  if (a.length < 2 || b.length < 2) return null
  const va = variance(a) / a.length
  const vb = variance(b) / b.length
  const se = Math.sqrt(va + vb)
  if (!se) return null
  const t = (mean(a) - mean(b)) / se
  const df = (va + vb) ** 2 / (va ** 2 / (a.length - 1) + vb ** 2 / (b.length - 1))
  return { statistic: t, df, p: Math.min(1, 2 * tSf(Math.abs(t), df)) }
}

/** Paired t-test on matched pairs, two-sided. */
export function pairedT(a: number[], b: number[]): TestResult | null {
  const d = a.map((x, i) => x - b[i])
  if (d.length < 2) return null
  const se = Math.sqrt(variance(d) / d.length)
  if (!se) return null
  const t = mean(d) / se
  const df = d.length - 1
  return { statistic: t, df, p: Math.min(1, 2 * tSf(Math.abs(t), df)) }
}

/** Average ranks (1-based) of the pooled values, plus the tie groups' sizes. */
function rank(values: number[]): { ranks: number[]; ties: number[] } {
  const order = values.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0])
  const ranks = new Array<number>(values.length)
  const ties: number[] = []
  for (let i = 0; i < order.length; ) {
    let j = i
    while (j + 1 < order.length && order[j + 1][0] === order[i][0]) j++
    const r = (i + j) / 2 + 1
    for (let k = i; k <= j; k++) ranks[order[k][1]] = r
    if (j > i) ties.push(j - i + 1)
    i = j + 1
  }
  return { ranks, ties }
}

/** Number of ways each U value occurs for samples of size m and n (no ties). */
function uFrequencies(m: number, n: number): number[] {
  // f[i][j] = counts of U for i x-values and j y-values; built row by row.
  let prev: number[][] = Array.from({ length: n + 1 }, () => [1])
  for (let i = 1; i <= m; i++) {
    const cur: number[][] = [[1]]
    for (let j = 1; j <= n; j++) {
      // U(i, j) = U(i−1, j) shifted by j  +  U(i, j−1).
      const a = prev[j]
      const b = cur[j - 1]
      const out = new Array<number>(i * j + 1).fill(0)
      a.forEach((c, u) => (out[u + j] += c))
      b.forEach((c, u) => (out[u] += c))
      cur.push(out)
    }
    prev = cur
  }
  return prev[n]
}

/**
 * Mann–Whitney U test, two-sided. The statistic is U for the first sample. Uses the exact
 * distribution for small samples without ties, otherwise the normal approximation with tie
 * and continuity corrections.
 */
export function mannWhitney(a: number[], b: number[], method: 'auto' | 'exact' | 'normal' = 'auto'): TestResult | null {
  const m = a.length
  const n = b.length
  if (!m || !n) return null
  const { ranks, ties } = rank([...a, ...b])
  const r1 = ranks.slice(0, m).reduce((s, r) => s + r, 0)
  const u1 = r1 - (m * (m + 1)) / 2
  const exact = method === 'exact' || (method === 'auto' && !ties.length && m < 50 && n < 50)
  if (exact) {
    const freq = uFrequencies(m, n)
    const total = freq.reduce((s, c) => s + c, 0)
    const uMax = Math.max(u1, m * n - u1)
    let upper = 0
    for (let u = Math.ceil(uMax); u < freq.length; u++) upper += freq[u]
    return { statistic: u1, p: Math.min(1, (2 * upper) / total) }
  }
  const N = m + n
  const tieTerm = ties.reduce((s, t) => s + t ** 3 - t, 0)
  const sigma = Math.sqrt(((m * n) / 12) * (N + 1 - tieTerm / (N * (N - 1))))
  if (!sigma) return { statistic: u1, p: 1 }
  const z = (Math.max(u1, m * n - u1) - (m * n) / 2 - 0.5) / sigma
  return { statistic: u1, p: Math.min(1, 2 * normalSf(z)) }
}

export interface Pairwise {
  i: number
  j: number
  statistic: number
  p: number
}

export interface OmnibusResult extends TestResult {
  pairs: Pairwise[]
}

const allPairs = (k: number): [number, number][] => {
  const out: [number, number][] = []
  for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) out.push([i, j])
  return out
}

/** One-way ANOVA with Tukey HSD (Tukey–Kramer for unequal sizes) on the requested pairs. */
export function anovaTukey(groups: number[][], pairs: [number, number][] = allPairs(groups.length)): OmnibusResult | null {
  const gs = groups.filter((g) => g.length)
  const k = gs.length
  const N = gs.reduce((s, g) => s + g.length, 0)
  if (k < 2 || N - k < 1) return null
  const grand = gs.flat().reduce((s, x) => s + x, 0) / N
  const ssb = gs.reduce((s, g) => s + g.length * (mean(g) - grand) ** 2, 0)
  const ssw = gs.reduce((s, g) => s + g.reduce((t, x) => t + (x - mean(g)) ** 2, 0), 0)
  const dfb = k - 1
  const dfw = N - k
  const mse = ssw / dfw
  if (!mse) return null
  const F = ssb / dfb / mse
  const out: Pairwise[] = []
  for (const [i, j] of pairs) {
    const a = groups[i]
    const b = groups[j]
    if (!a?.length || !b?.length) continue
    const q = Math.abs(mean(a) - mean(b)) / Math.sqrt((mse / 2) * (1 / a.length + 1 / b.length))
    out.push({ i, j, statistic: q, p: ptukeySf(q, k, dfw) })
  }
  return { statistic: F, df: [dfb, dfw], p: fSf(F, dfb, dfw), pairs: out }
}

/** Kruskal–Wallis H test (tie-corrected) with Dunn's post-hoc test, Holm-adjusted over the requested pairs. */
export function kruskalDunn(groups: number[][], pairs: [number, number][] = allPairs(groups.length)): OmnibusResult | null {
  const sizes = groups.map((g) => g.length)
  const k = sizes.filter((n) => n > 0).length
  const N = sizes.reduce((s, n) => s + n, 0)
  if (k < 2 || N < 3) return null
  const { ranks, ties } = rank(groups.flat())
  const meanRank: number[] = []
  let at = 0
  for (const n of sizes) {
    meanRank.push(n ? ranks.slice(at, at + n).reduce((s, r) => s + r, 0) / n : NaN)
    at += n
  }
  const tieTerm = ties.reduce((s, t) => s + t ** 3 - t, 0)
  const correction = 1 - tieTerm / (N ** 3 - N)
  if (!correction) return null
  const h = ((12 / (N * (N + 1))) * sizes.reduce((s, n, i) => (n ? s + n * meanRank[i] ** 2 : s), 0) - 3 * (N + 1)) / correction
  const a = (N * (N + 1)) / 12 - tieTerm / (12 * (N - 1))
  const raw: Pairwise[] = []
  for (const [i, j] of pairs) {
    if (!sizes[i] || !sizes[j]) continue
    const z = (meanRank[i] - meanRank[j]) / Math.sqrt(a * (1 / sizes[i] + 1 / sizes[j]))
    raw.push({ i, j, statistic: z, p: Math.min(1, 2 * normalSf(Math.abs(z))) })
  }
  const adj = holm(raw.map((r) => r.p))
  return { statistic: h, df: k - 1, p: chi2Sf(h, k - 1), pairs: raw.map((r, n) => ({ ...r, p: adj[n] })) }
}

/** Holm–Bonferroni step-down adjustment. */
export function holm(ps: number[]): number[] {
  const m = ps.length
  const order = ps.map((p, i) => [p, i]).sort((a, b) => a[0] - b[0])
  const out = new Array<number>(m)
  let run = 0
  order.forEach(([p, i], r) => {
    run = Math.max(run, Math.min(1, (m - r) * p))
    out[i] = run
  })
  return out
}

/** Significance stars: * < 0.05, ** < 0.01, *** < 0.001, **** < 0.0001. */
export function stars(p: number): string {
  if (p < 0.0001) return '****'
  if (p < 0.001) return '***'
  if (p < 0.01) return '**'
  if (p < 0.05) return '*'
  return 'ns'
}

export function formatP(p: number): string {
  if (!Number.isFinite(p)) return 'p = n/a'
  if (p < 0.0001) return 'p < 0.0001'
  if (p >= 0.1) return `p = ${p.toFixed(2)}`
  return `p = ${p.toPrecision(2).replace(/e.*/, '')}`
}
