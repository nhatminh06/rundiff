import type { DemoDataset, DemoWorkload } from '@/data/benchmarks'

export const CSV_LIMITS = { maxBytes: 1_000_000, maxRows: 10_000 } as const
export class CsvImportError extends Error { constructor(message: string, public readonly row?: number) { super(row ? `Row ${row}: ${message}` : message) } }

export function importBenchmarkCsv(text: string, fileName: string, byteSize = new TextEncoder().encode(text).byteLength): DemoDataset {
  if (byteSize > CSV_LIMITS.maxBytes) throw new CsvImportError(`File exceeds the ${CSV_LIMITS.maxBytes.toLocaleString()} byte limit.`)
  const records = parseCsv(text)
  if (records.length === 0) throw new CsvImportError('The CSV file is empty.')
  if (records.length - 1 > CSV_LIMITS.maxRows) throw new CsvImportError(`File exceeds the ${CSV_LIMITS.maxRows.toLocaleString()} data-row limit.`)
  const header = records[0].map((field, index) => index === 0 ? field.replace(/^\uFEFF/, '').trim() : field.trim())
  if (header.join(',') !== 'workload,variant,latency_ms') throw new CsvImportError('Header must be exactly: workload,variant,latency_ms', 1)
  const grouped = new Map<string, { baseline: number[]; candidate: number[] }>()
  records.slice(1).forEach((fields, index) => {
    const row = index + 2
    if (fields.length !== 3) throw new CsvImportError(`Expected 3 fields, received ${fields.length}.`, row)
    const workload = fields[0].trim()
    const variant = fields[1].trim()
    const latencyText = fields[2].trim()
    if (!workload) throw new CsvImportError('Workload is required.', row)
    if (variant !== 'baseline' && variant !== 'candidate') throw new CsvImportError('Variant must be baseline or candidate.', row)
    if (!latencyText) throw new CsvImportError('Latency is required.', row)
    const latency = Number(latencyText)
    if (!Number.isFinite(latency) || latency <= 0) throw new CsvImportError('Latency must be a finite number greater than zero.', row)
    const variants = grouped.get(workload) ?? { baseline: [], candidate: [] }
    variants[variant].push(latency)
    grouped.set(workload, variants)
  })
  if (grouped.size === 0) throw new CsvImportError('The CSV has no measurement rows.')
  const workloads: DemoWorkload[] = [...grouped].map(([name, variants]) => {
    if (variants.baseline.length === 0 || variants.candidate.length === 0) throw new CsvImportError(`Workload “${name}” must include both baseline and candidate measurements.`)
    return { id: name, name, description: 'Imported benchmark workload', baseline: variants.baseline, candidate: variants.candidate }
  })
  return { id: `imported-${fileName}`, name: `Imported · ${fileName}`, context: 'Local browser session · CSV import', baselineLabel: 'baseline', candidateLabel: 'candidate', workloads, synthetic: false }
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let quoted = false; let closedQuote = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (quoted) { if (char === '"' && text[index + 1] === '"') { field += '"'; index += 1 } else if (char === '"') { quoted = false; closedQuote = true } else field += char }
    else if (closedQuote && char !== ',' && char !== '\n' && char !== '\r') throw new CsvImportError('Unexpected character after closing quote.', rows.length + 1)
    else if (char === '"' && field === '') quoted = true
    else if (char === ',') { row.push(field); field = ''; closedQuote = false }
    else if (char === '\n' || char === '\r') { if (char === '\r' && text[index + 1] === '\n') index += 1; row.push(field); field = ''; closedQuote = false; if (row.some((value) => value !== '')) rows.push(row); row = [] }
    else field += char
  }
  if (quoted) throw new CsvImportError('Unclosed quoted field.', rows.length + 1)
  row.push(field); if (row.some((value) => value !== '')) rows.push(row)
  return rows
}
