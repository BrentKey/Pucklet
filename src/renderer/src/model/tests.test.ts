import { describe, expect, it } from 'vitest'
import { SAMPLE_GROUPS } from './data'
import { makeChart } from './defaults'
import { analyze, comparisonPairs, DEFAULT_STATS, layoutBrackets, resultsText } from './significance'
import { anovaTukey, chi2Sf, formatP, fSf, holm, ibeta, kruskalDunn, mannWhitney, normalCdf, normalSf, pairedT, ptukeySf, stars, tSf, welchT } from './tests'

// Reference values computed with SciPy 1.18.1 and scikit-posthocs.

const close = (actual: number, expected: number, rel = 1e-6) => expect(Math.abs(actual - expected)).toBeLessThanOrEqual(Math.abs(expected) * rel + 1e-14)

const C = [12.1, 10.8, 13.5, 11.2, 12.9]
const A = [18.4, 20.2, 17.1, 19.6, 21.3]
const B = [24.9, 27.3, 22.8, 26.1, 25.5]
const X = [5.1, 4.9, 6.2, 5.8, 6.0, 5.5, 4.7]
const Y = [6.3, 5.9, 7.1, 6.8, 6.0]
const Z = [5.0, 5.2, 6.4, 5.6, 5.9, 6.1]
const U1 = [1, 2, 2, 3, 4, 4, 4, 5]
const U2 = [3, 4, 5, 5, 6, 6, 7]
const U3 = [2, 3, 3, 8, 9]

describe('distributions', () => {
  it('matches the incomplete beta function', () => {
    close(ibeta(0.3, 2.5, 1.5), 0.08894372317066562)
    close(ibeta(0.05, 0.5, 7), 0.5948684952530259)
  })

  it('matches t, F, normal and chi-squared tails', () => {
    close(tSf(2.5, 7), 0.020496109292876444)
    close(tSf(10, 3), 0.0010641995292070751)
    close(1 - tSf(-1.3, 40), 0.1005212574960813)
    close(fSf(4.2, 2, 15), 0.03560947020660862)
    close(fSf(0.5, 5, 8), 0.769110596374225)
    close(fSf(30, 3, 20), 1.3345705379913494e-7)
    close(normalSf(1.96), 0.024997895148220435)
    close(normalSf(5), 2.8665157187919333e-7)
    close(normalCdf(-0.5), 0.3085375387259869)
    close(normalSf(8), 6.22096057427174e-16, 1e-5)
    close(chi2Sf(5.99, 2), 0.05003662708658629)
    close(chi2Sf(12, 4), 0.01735126523666451)
    close(chi2Sf(0.3, 1), 0.583882420770365)
  })

  it('matches the studentized range distribution', () => {
    close(ptukeySf(3.5, 3, 12), 0.06999548527518362, 1e-5)
    close(ptukeySf(5.2, 4, 8), 0.025822600206883428, 1e-5)
    close(ptukeySf(2.0, 2, 1), 0.39182655203060723, 1e-5)
    close(ptukeySf(4.0, 6, 60), 0.06653203326093127, 1e-5)
    close(ptukeySf(3.0, 5, 1000), 0.21172884324138097, 1e-5)
    close(ptukeySf(7, 3, 5), 0.00985510842830184, 1e-5)
  })
})

describe('tests', () => {
  it("runs Welch's t-test", () => {
    const r = welchT(C, A)!
    close(r.statistic, -8.162492151212733)
    close(r.p, 7.213624639578777e-5)
    const s = welchT(X, Y)!
    close(s.statistic, -3.0376184127042687)
    close(s.df as number, 9.328139167580646)
    close(s.p, 0.013515296221938715)
    expect(welchT([1], [2, 3])).toBeNull()
  })

  it('runs the paired t-test', () => {
    close(pairedT(C, A)!.p, 0.002233047944538733)
    const r = pairedT([1.2, 2.3, 1.9, 3.1, 2.8, 2.2], [1.5, 2.1, 2.6, 3.9, 3.0, 2.9])!
    close(r.statistic, -2.638164307457046)
    close(r.p, 0.04607790001038286)
  })

  it('runs the Mann–Whitney U test', () => {
    const r = mannWhitney(X, Y)!
    expect(r.statistic).toBe(3.5)
    // 6.0 appears in both samples, so the tie forces the normal approximation.
    close(r.p, 0.028074956885900254)
    const x = mannWhitney([5.1, 4.9, 6.2, 5.8, 6.0, 5.5, 4.7, 3.3, 7.4], [6.3, 5.95, 7.1, 6.8, 6.05, 8.2])!
    expect(x.statistic).toBe(8)
    close(x.p, 0.025574425574425574)
    const e = mannWhitney(C, A)!
    expect(e.statistic).toBe(0)
    close(e.p, 0.007936507936507936)
    const t = mannWhitney(U1, U2)!
    expect(t.statistic).toBe(8)
    close(t.p, 0.021920655864769517)
  })

  it('runs one-way ANOVA with Tukey HSD', () => {
    const r = anovaTukey([X, Y, Z])!
    close(r.statistic, 4.689318172166305)
    close(r.p, 0.02618869604207788)
    expect(r.df).toEqual([2, 15])
    const ref = [0.022667170227239963, 0.7097242387875453, 0.10839795447674161]
    r.pairs.forEach((pr, n) => close(pr.p, ref[n], 1e-5))
    const s = anovaTukey([C, A, B])!
    close(s.statistic, 98.33064033512869)
    close(s.p, 3.6177309466544116e-8)
    const ref2 = [1.645776687797529e-5, 2.3900269097154592e-8, 9.97392080925863e-5]
    s.pairs.forEach((pr, n) => close(pr.p, ref2[n], 1e-4))
  })

  it("runs Kruskal–Wallis with Dunn's test", () => {
    const r = kruskalDunn([X, Y, Z])!
    close(r.statistic, 5.964398975722658)
    close(r.p, 0.05068123841477831)
    const ref = [0.04655304077977547, 0.4434616615048247, 0.20365517862883323]
    r.pairs.forEach((pr, n) => close(pr.p, ref[n]))
    const t = kruskalDunn([U1, U2, U3])!
    close(t.statistic, 4.430794992862628)
    close(t.p, 0.10911013473825629)
    const ref2 = [0.10895374979221825, 0.5543171169958983, 0.5543171169958983]
    t.pairs.forEach((pr, n) => close(pr.p, ref2[n]))
  })

  it('adjusts, formats and stars p-values', () => {
    expect(holm([0.01, 0.04, 0.03])).toEqual([0.03, 0.06, 0.06])
    expect([0.2, 0.04, 0.009, 0.0009, 0.00009].map(stars)).toEqual(['ns', '*', '**', '***', '****'])
    expect(formatP(0.00001)).toBe('p < 0.0001')
    expect(formatP(0.0123)).toBe('p = 0.012')
    expect(formatP(0.53)).toBe('p = 0.53')
  })
})

describe('chart statistics', () => {
  const chart = (stats = {}) => ({ ...makeChart('a0', SAMPLE_GROUPS, 0, 0, 'bar'), stats: { ...DEFAULT_STATS, ...stats } })

  it('picks pairs', () => {
    expect(comparisonPairs({ ...DEFAULT_STATS, compare: 'all' }, 3)).toEqual([[0, 1], [0, 2], [1, 2]])
    expect(comparisonPairs({ ...DEFAULT_STATS, compare: 'first' }, 3)).toEqual([[0, 1], [0, 2]])
    expect(comparisonPairs({ ...DEFAULT_STATS, compare: 'custom', pairs: [[2, 0], [0, 2], [1, 1], [1, 5]] }, 3)).toEqual([[0, 2]])
  })

  it('analyses the example chart', () => {
    expect(analyze(chart())).toBeNull()
    const a = analyze(chart({ test: 'auto' }))!
    expect(a.test).toContain('ANOVA')
    expect(a.rows.map((r) => r.label)).toEqual(['Control vs Drug A', 'Control vs Drug B', 'Drug A vs Drug B'])
    expect(a.rows.every((r) => r.p < 0.001)).toBe(true)
    expect(resultsText(a)).toContain('Control vs Drug A\t1.65e-5\t****')
    const w = analyze(chart({ test: 'welch', compare: 'first' }))!
    expect(w.adjust).toBe('Holm-adjusted')
    expect(w.rows).toHaveLength(2)
  })

  it('stacks brackets without overlaps', () => {
    const rows = [
      { i: 0, j: 2, label: '', p: 0.0005 },
      { i: 0, j: 1, label: '', p: 0.2 },
      { i: 1, j: 2, label: '', p: 0.03 },
      { i: 2, j: 3, label: '', p: 0.03 }
    ]
    const b = layoutBrackets(rows, { ...DEFAULT_STATS })
    expect(b.map((x) => [x.i, x.j, x.level, x.text])).toEqual([
      [0, 1, 0, 'ns'],
      [1, 2, 1, '*'],
      [2, 3, 2, '*'],
      [0, 2, 3, '***']
    ])
    expect(layoutBrackets(rows, { ...DEFAULT_STATS, hideNs: true }).map((x) => x.level)).toEqual([0, 1, 2])
  })
})
