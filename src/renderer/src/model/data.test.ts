import { strToU8, zipSync } from 'fflate'
import { describe, expect, it } from 'vitest'
import { guessHeader, guessShape, looksTabular, parseDelimited, parseFile, toCell, toTable } from './data'
import { boxStats, ci95, linearFit, mean, sd, sem } from './stats'

describe('parsing', () => {
  it('reads numbers, text and blanks', () => {
    expect(toCell(' 12.5 ')).toBe(12.5)
    expect(toCell('1,234')).toBe(1234)
    expect(toCell('1e-3')).toBe(0.001)
    expect(toCell('IL-6')).toBe('IL-6')
    expect(toCell('')).toBeNull()
    expect(toCell('12 mM')).toBe('12 mM')
  })

  it('parses CSV and TSV, trimming empty edges', () => {
    expect(parseDelimited('a,b\n1,2\n3,4\n\n')).toEqual([['a', 'b'], [1, 2], [3, 4]])
    expect(parseDelimited('x\ty\t\n1\t2\t\n')).toEqual([['x', 'y'], [1, 2]])
    expect(looksTabular('a\tb\n1\t2')).toBe(true)
    expect(looksTabular('just some text')).toBe(false)
  })

  it('detects headers and the data layout', () => {
    const groups = parseDelimited('Control,Drug\n1,2\n3,4')
    expect(guessHeader(groups)).toBe(true)
    expect(guessShape(toTable(groups, true))).toBe('groups')
    expect(guessHeader(parseDelimited('1,2\n3,4'))).toBe(false)
    expect(guessShape(toTable(parseDelimited('Tissue,WT,KO\nLiver,1,2\nHeart,3,4'), true))).toBe('categories')
    expect(guessShape(toTable(parseDelimited('Time,A,B\n0,1,2\n1,2,3\n2,4,5'), true))).toBe('xy')
    // Ragged rows are padded, missing headers are named.
    expect(toTable([[1, 2, 3], [4]], false)).toEqual({ columns: ['Column 1', 'Column 2', 'Column 3'], rows: [[1, 2, 3], [4, null, null]] })
  })

  it('reads every sheet of an Excel workbook', async () => {
    // A minimal .xlsx: two sheets, shared strings for the header text.
    const files = {
      '[Content_Types].xml': strToU8(
        '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/></Types>'
      ),
      '_rels/.rels': strToU8(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'
      ),
      'xl/workbook.xml': strToU8(
        '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Assay" sheetId="1" r:id="rId1"/><sheet name="Notes" sheetId="2" r:id="rId2"/></sheets></workbook>'
      ),
      'xl/_rels/workbook.xml.rels': strToU8(
        '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/></Relationships>'
      ),
      'xl/sharedStrings.xml': strToU8(
        '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="3" uniqueCount="3"><si><t>Control</t></si><si><t>Treated</t></si><si><t>ok</t></si></sst>'
      ),
      'xl/worksheets/sheet1.xml': strToU8(
        '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>1.5</v></c><c r="B2"><v>3</v></c></row><row r="3"><c r="A3"><v>2</v></c><c r="B3"><v>4.25</v></c></row></sheetData></worksheet>'
      ),
      'xl/worksheets/sheet2.xml': strToU8(
        '<?xml version="1.0"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"><c r="A1" t="s"><v>2</v></c></row></sheetData></worksheet>'
      )
    }
    const sheets = await parseFile('assay.xlsx', zipSync(files))
    expect(sheets.map((s) => s.name)).toEqual(['Assay', 'Notes'])
    expect(sheets[0].grid).toEqual([['Control', 'Treated'], [1.5, 3], [2, 4.25]])
  })

  it('rejects legacy .xls with a helpful message', async () => {
    await expect(parseFile('old.xls', new Uint8Array([1]))).rejects.toThrow(/xlsx or CSV/)
  })
})

describe('statistics', () => {
  const v = [2, 4, 4, 4, 5, 5, 7, 9]
  it('summarises a group', () => {
    expect(mean(v)).toBe(5)
    expect(sd(v)).toBeCloseTo(2.138, 3)
    expect(sem(v)).toBeCloseTo(0.756, 3)
    expect(ci95(v)).toBeCloseTo(2.365 * sem(v), 6)
    expect(boxStats([1, 2, 3, 4, 100])).toMatchObject({ median: 3, q1: 2, q3: 4, hi: 4, outliers: [100] })
  })
  it('fits a line', () => {
    const fit = linearFit([0, 1, 2, 3], [1, 3, 5, 7])!
    expect(fit.slope).toBeCloseTo(2)
    expect(fit.intercept).toBeCloseTo(1)
    expect(fit.r2).toBeCloseTo(1)
  })
})
