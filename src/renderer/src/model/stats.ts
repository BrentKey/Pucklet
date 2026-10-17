import { quantileSorted } from 'd3-array'

// Small, dependency-light statistics for chart summaries.

export const mean = (v: number[]): number => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN)

export function sd(v: number[]): number {
  if (v.length < 2) return 0
  const m = mean(v)
  return Math.sqrt(v.reduce((s, x) => s + (x - m) ** 2, 0) / (v.length - 1))
}

export const sem = (v: number[]): number => (v.length > 1 ? sd(v) / Math.sqrt(v.length) : 0)

// Two-sided 95% critical values of Student's t for df = 1..30.
const T95 = [12.706, 4.303, 3.182, 2.776, 2.571, 2.447, 2.365, 2.306, 2.262, 2.228, 2.201, 2.179, 2.16, 2.145, 2.131, 2.12, 2.11, 2.101, 2.093, 2.086, 2.08, 2.074, 2.069, 2.064, 2.06, 2.056, 2.052, 2.048, 2.045, 2.042]

export function ci95(v: number[]): number {
  if (v.length < 2) return 0
  const df = v.length - 1
  const t = df <= 30 ? T95[df - 1] : df <= 60 ? 2.0 : df <= 120 ? 1.98 : 1.96
  return t * sem(v)
}

export type ErrorKind = 'sd' | 'sem' | 'ci95' | 'none'

export function errorOf(v: number[], kind: ErrorKind): number {
  if (kind === 'sd') return sd(v)
  if (kind === 'sem') return sem(v)
  if (kind === 'ci95') return ci95(v)
  return 0
}

export interface BoxStats {
  q1: number
  median: number
  q3: number
  /** Whiskers: furthest points within 1.5 × IQR of the box (Tukey). */
  lo: number
  hi: number
  outliers: number[]
}

export function boxStats(values: number[]): BoxStats | null {
  if (!values.length) return null
  const s = [...values].sort((a, b) => a - b)
  const q1 = quantileSorted(s, 0.25)!
  const median = quantileSorted(s, 0.5)!
  const q3 = quantileSorted(s, 0.75)!
  const iqr = q3 - q1
  const inside = s.filter((x) => x >= q1 - 1.5 * iqr && x <= q3 + 1.5 * iqr)
  return { q1, median, q3, lo: inside[0], hi: inside[inside.length - 1], outliers: s.filter((x) => x < inside[0] || x > inside[inside.length - 1]) }
}

/** Gaussian kernel density estimate (Silverman's bandwidth) sampled at `steps` points. */
export function kde(values: number[], lo: number, hi: number, steps = 40): [number, number][] {
  if (values.length < 2 || hi <= lo) return []
  const n = values.length
  const s = sd(values) || (hi - lo) / 10
  const h = 1.06 * s * n ** -0.2
  const out: [number, number][] = []
  for (let i = 0; i <= steps; i++) {
    const x = lo + ((hi - lo) * i) / steps
    let d = 0
    for (const v of values) d += Math.exp(-0.5 * ((x - v) / h) ** 2)
    out.push([x, d / (n * h * Math.sqrt(2 * Math.PI))])
  }
  return out
}

export interface Fit {
  slope: number
  intercept: number
  r2: number
}

export function linearFit(xs: number[], ys: number[]): Fit | null {
  const n = Math.min(xs.length, ys.length)
  if (n < 2) return null
  const mx = mean(xs.slice(0, n))
  const my = mean(ys.slice(0, n))
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  if (!sxx) return null
  const slope = sxy / sxx
  return { slope, intercept: my - slope * mx, r2: syy ? (sxy * sxy) / (sxx * syy) : 1 }
}

/** Deterministic jitter in [-1, 1] so points don't move between renders. */
export function jitter(i: number, seed: number): number {
  const x = Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}
