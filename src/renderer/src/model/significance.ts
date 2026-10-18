import { column, isNum, numbers } from './data'
import { anovaTukey, formatP, holm, kruskalDunn, mannWhitney, pairedT, stars, welchT } from './tests'
import type { ChartObj, ChartStats, StatTest } from './types'

// Applies a chart's statistics setting to its data: which test, which pairs, what to draw.

export const DEFAULT_STATS: ChartStats = { test: 'none', compare: 'all', pairs: [], display: 'stars', hideNs: false }

export const STAT_TESTS: { value: StatTest; label: string }[] = [
  { value: 'none', label: 'None' },
  { value: 'auto', label: 'Automatic' },
  { value: 'welch', label: "Welch's t-test" },
  { value: 'paired', label: 'Paired t-test' },
  { value: 'mannwhitney', label: 'Mann–Whitney U' },
  { value: 'anova', label: 'One-way ANOVA + Tukey' },
  { value: 'kruskal', label: "Kruskal–Wallis + Dunn's" }
]

const STAT_KINDS = new Set(['bar', 'dot', 'box', 'violin'])

export const supportsStats = (o: ChartObj): boolean => STAT_KINDS.has(o.kind)

export interface Comparison {
  i: number
  j: number
  label: string
  p: number
}

export interface Analysis {
  /** Name of the test used, e.g. "Welch's t-test". */
  test: string
  /** Omnibus result for ANOVA / Kruskal–Wallis. */
  omnibus?: string
  /** How pairwise p-values were adjusted, if at all. */
  adjust?: string
  rows: Comparison[]
  warning?: string
}

export function comparisonPairs(s: ChartStats, k: number): [number, number][] {
  const out: [number, number][] = []
  if (s.compare === 'first') for (let j = 1; j < k; j++) out.push([0, j])
  else if (s.compare === 'custom') {
    for (const [a, b] of s.pairs) {
      const i = Math.min(a, b)
      const j = Math.max(a, b)
      if (i !== j && i >= 0 && j < k && !out.some((p) => p[0] === i && p[1] === j)) out.push([i, j])
    }
  } else for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) out.push([i, j])
  return out
}

const fmt = (v: number, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : 'n/a')

const cache = new Map<string, Analysis | null>()

/** Runs the chart's statistics setting; null when there is nothing to test. */
export function analyze(o: ChartObj): Analysis | null {
  const s = o.stats
  if (!s || s.test === 'none' || !supportsStats(o) || o.data.columns.length < 2) return null
  const key = JSON.stringify([o.data, s.test, s.compare, s.pairs])
  if (cache.has(key)) return cache.get(key)!
  const result = run(o, s)
  if (cache.size > 200) cache.clear()
  cache.set(key, result)
  return result
}

function run(o: ChartObj, s: ChartStats): Analysis | null {
  const t = o.data
  const k = t.columns.length
  const groups = t.columns.map((_, i) => numbers(column(t, i)))
  const pairs = comparisonPairs(s, k)
  if (!pairs.length) return null
  const name = (i: number) => t.columns[i] || `Group ${i + 1}`
  const row = (i: number, j: number, p: number): Comparison => ({ i, j, label: `${name(i)} vs ${name(j)}`, p })
  const test = s.test === 'auto' ? (k === 2 ? 'welch' : 'anova') : s.test
  const label = STAT_TESTS.find((x) => x.value === test)!.label

  if (test === 'anova' || test === 'kruskal') {
    const r = test === 'anova' ? anovaTukey(groups, pairs) : kruskalDunn(groups, pairs)
    if (!r) return { test: label, rows: [], warning: 'Not enough data: each group needs values and some spread.' }
    const omnibus =
      test === 'anova' ? `F(${(r.df as number[]).join(', ')}) = ${fmt(r.statistic)}, ${formatP(r.p)}` : `H(${r.df}) = ${fmt(r.statistic)}, ${formatP(r.p)}`
    return { test: label, omnibus, adjust: test === 'anova' ? 'Tukey HSD' : "Dunn's, Holm-adjusted", rows: r.pairs.map((x) => row(x.i, x.j, x.p)) }
  }

  // Two-sample tests, one per pair.
  const raw: Comparison[] = []
  let skipped = false
  for (const [i, j] of pairs) {
    let r = null
    if (test === 'paired') {
      const a: number[] = []
      const b: number[] = []
      for (const rw of t.rows) {
        if (isNum(rw[i] ?? null) && isNum(rw[j] ?? null)) (a.push(rw[i] as number), b.push(rw[j] as number))
      }
      r = pairedT(a, b)
    } else if (test === 'mannwhitney') r = mannWhitney(groups[i], groups[j])
    else r = welchT(groups[i], groups[j])
    if (r) raw.push(row(i, j, r.p))
    else skipped = true
  }
  const many = raw.length > 1
  const adj = many ? holm(raw.map((r) => r.p)) : raw.map((r) => r.p)
  return {
    test: label,
    adjust: many ? 'Holm-adjusted' : undefined,
    rows: raw.map((r, n) => ({ ...r, p: adj[n] })),
    warning: skipped ? (test === 'paired' ? 'Some pairs need at least two complete rows with differences that vary.' : 'Some groups need at least two values that vary.') : undefined
  }
}

/** The text drawn on a bracket. */
export function bracketText(p: number, display: ChartStats['display']): string {
  if (display === 'p') return formatP(p)
  if (display === 'both') return p < 0.05 ? `${formatP(p)} ${stars(p)}` : formatP(p)
  return stars(p)
}

/** Tab-separated results, for copying into a spreadsheet or a methods section. */
export function resultsText(a: Analysis): string {
  const lines = [`Test\t${a.test}${a.adjust ? ` (${a.adjust})` : ''}`]
  if (a.omnibus) lines.push(`Omnibus\t${a.omnibus}`)
  lines.push('Comparison\tp-value\tSignificance')
  for (const r of a.rows) lines.push(`${r.label}\t${r.p < 0.0001 ? r.p.toExponential(2) : r.p.toPrecision(3)}\t${stars(r.p)}`)
  return lines.join('\n')
}

export interface Bracket {
  i: number
  j: number
  level: number
  text: string
}

/**
 * Stacks brackets so they never overlap: shorter spans first, each one placed one level
 * above every bracket it shares a group with.
 */
export function layoutBrackets(rows: Comparison[], s: ChartStats): Bracket[] {
  const shown = rows.filter((r) => !(s.hideNs && r.p >= 0.05)).sort((a, b) => a.j - a.i - (b.j - b.i) || a.i - b.i)
  const placed: Bracket[] = []
  for (const r of shown) {
    const below = placed.filter((b) => !(b.j < r.i || r.j < b.i))
    const level = below.length ? Math.max(...below.map((b) => b.level)) + 1 : 0
    placed.push({ i: r.i, j: r.j, level, text: bracketText(r.p, s.display) })
  }
  return placed
}
