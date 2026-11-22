import { useMemo, useRef, useState, type ChangeEvent } from 'react'
import { Activity, AlertTriangle, ArrowUp, CircleHelp, FileUp, Minus, Save, SlidersHorizontal } from 'lucide-react'
import { AuthOverlay, useAuth, useMutations, useRecordContext } from 'deepspace'
import { Badge, Button, Input, Label, Modal, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, useToast } from '@/components/ui'
import { demoDatasets, type DemoDataset, type DemoWorkload } from '@/data/benchmarks'
import { CSV_LIMITS, importBenchmarkCsv } from '@/lib/benchmark-csv'
import { analyzeWorkload, type ConfidenceInterval, type WorkloadStatus } from '@/lib/benchmark-stats'
import { reportFromDataset, reportSaveError, type ReportData } from '@/lib/reports'

type StatusFilter = 'all' | WorkloadStatus
type Row = DemoWorkload & { baselineMedian: number | null; candidateMedian: number | null; baselineP95: number | null; candidateP95: number | null; change: number | null; confidenceInterval: ConfidenceInterval | null; status: WorkloadStatus; warning: string | null }

const statusMeta = {
  regression: { label: 'Regression', badge: 'destructive' as const, icon: ArrowUp, color: 'text-destructive' },
  investigation: { label: 'Investigate', badge: 'warning' as const, icon: AlertTriangle, color: 'text-warning' },
  'no-clear-regression': { label: 'No clear regression', badge: 'outline' as const, icon: Minus, color: 'text-muted-foreground' },
  'insufficient-data': { label: 'Insufficient data', badge: 'secondary' as const, icon: CircleHelp, color: 'text-muted-foreground' },
}

export default function HomePage() {
  const [datasetId, setDatasetId] = useState(demoDatasets[0].id)
  const [selectedId, setSelectedId] = useState(demoDatasets[0].workloads[0].id)
  const [threshold, setThreshold] = useState(5)
  const [filter, setFilter] = useState<StatusFilter>('all')
  const [imported, setImported] = useState<DemoDataset[]>([])
  const [importError, setImportError] = useState<string | null>(null)
  const [saveOpen, setSaveOpen] = useState(false)
  const [authOpen, setAuthOpen] = useState(false)
  const [reportTitle, setReportTitle] = useState('')
  const [reportDescription, setReportDescription] = useState('')
  const [saving, setSaving] = useState(false)
  const auth = useAuth()
  const reports = useMutations<ReportData>('reports')
  const room = useRecordContext()
  const toast = useToast()
  const fileInput = useRef<HTMLInputElement>(null)
  const datasets = [...demoDatasets, ...imported]
  const dataset = datasets.find((item) => item.id === datasetId) ?? demoDatasets[0]
  const rows: Row[] = useMemo(() => dataset.workloads.map((workload) => {
    return { ...workload, ...analyzeWorkload(workload.baseline, workload.candidate, { threshold, seed: 2027, iterations: 2000 }) }
  }), [dataset, threshold])
  const visibleRows = rows.filter((row) => filter === 'all' || row.status === filter)
  const selected = rows.find((row) => row.id === selectedId) ?? rows[0]
  const regressions = rows.filter((row) => row.status === 'regression').length
  const investigations = rows.filter((row) => row.status === 'investigation').length
  const saveLimitError = reportSaveError(reportFromDataset(dataset, 'Current comparison', '', threshold))

  function changeDataset(nextId: string) {
    const next = datasets.find((item) => item.id === nextId)
    if (!next) return
    setDatasetId(nextId)
    setSelectedId(next.workloads[0].id)
  }

  async function importCsv(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    try {
      const parsed = importBenchmarkCsv(await file.text(), file.name, file.size)
      const next = { ...parsed, id: `${parsed.id}-${imported.length + 1}` }
      setImported((current) => [...current, next]); setDatasetId(next.id); setSelectedId(next.workloads[0].id); setImportError(null); setFilter('all')
    } catch (error) { setImportError(error instanceof Error ? error.message : 'Could not import this CSV file.') }
  }

  function beginSave() {
    if (saveLimitError) { toast.warning('Saving unavailable', saveLimitError); return }
    if (!auth.isSignedIn) { setAuthOpen(true); return }
    setReportTitle(dataset.name.replace(/^Imported · /, ''))
    setReportDescription('')
    setSaveOpen(true)
  }

  async function saveReport() {
    const report = reportFromDataset(dataset, reportTitle, reportDescription, threshold)
    const validationError = reportSaveError(report)
    if (validationError) { toast.error('Cannot save report', validationError); return }
    setSaving(true)
    try { await reports.createConfirmed(report); setSaveOpen(false); toast.success('Report saved', 'The server confirmed your private report.') }
    catch (error) { toast.error('Save failed', error instanceof Error ? error.message : 'The server did not accept this report.') }
    finally { setSaving(false) }
  }

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <div className="mb-2 flex items-center gap-2"><Badge variant={dataset.synthetic ? 'info' : 'success'}>{dataset.synthetic ? 'Synthetic demo data' : 'Local CSV data'}</Badge><span className="text-xs text-muted-foreground">Bootstrap analysis · seed 2027</span></div>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Performance comparison</h1>
          <p className="mt-1 text-sm text-muted-foreground">Review median latency changes across benchmark workloads.</p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:flex-row lg:w-auto">
          <div className="min-w-0 sm:w-[360px]"><label className="mb-1.5 block text-xs font-medium text-muted-foreground" htmlFor="dataset-select">Dataset</label><Select value={datasetId} onValueChange={changeDataset}><SelectTrigger id="dataset-select"><SelectValue /></SelectTrigger><SelectContent>{datasets.map((item) => <SelectItem key={item.id} value={item.id}>{item.name}</SelectItem>)}</SelectContent></Select></div>
          <div className="flex gap-2 sm:self-end"><input ref={fileInput} className="sr-only" type="file" accept=".csv,text/csv" onChange={importCsv} /><Button variant="outline" onClick={() => fileInput.current?.click()}><FileUp />Import CSV</Button><Button onClick={beginSave} disabled={Boolean(saveLimitError) || (auth.isSignedIn && (room.status !== 'connected' || !reports.ready))} title={saveLimitError ?? undefined}><Save />Save</Button></div>
        </div>
      </header>
      {saveLimitError && <div className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">{saveLimitError}</div>}
      {importError && <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm"><AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" /><div><strong>CSV import failed</strong><p className="mt-0.5 text-muted-foreground">{importError}</p><p className="mt-1 text-xs text-muted-foreground">Expected workload,variant,latency_ms · max {CSV_LIMITS.maxBytes.toLocaleString()} bytes and {CSV_LIMITS.maxRows.toLocaleString()} rows.</p></div></div>}

      <section aria-label="Comparison summary" className="mb-6 grid gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Summary label="Baseline" value={dataset.baselineLabel} detail={dataset.context} />
        <Summary label="Candidate" value={dataset.candidateLabel} detail={`${rows.length} workloads`} />
        <Summary label="Regressions" value={String(regressions)} detail={`at ≥ ${threshold}% slower`} tone={regressions ? 'text-destructive' : 'text-success'} />
        <Summary label="Investigations" value={String(investigations)} detail="observed change, uncertain CI" tone={investigations ? 'text-warning' : 'text-foreground'} />
      </section>

      <div className="mb-4 flex flex-col gap-4 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-2 text-sm font-medium"><SlidersHorizontal className="size-4 text-muted-foreground" /> Review controls</div>
        <div className="flex flex-1 flex-col gap-4 sm:max-w-2xl sm:flex-row sm:items-end">
          <div className="flex-1"><div className="mb-1.5 flex justify-between text-xs"><label htmlFor="threshold">Regression threshold</label><output htmlFor="threshold" className="font-mono text-foreground">{threshold}%</output></div><input id="threshold" type="range" min="1" max="15" step="1" value={threshold} onChange={(event) => setThreshold(Number(event.target.value))} className="h-10 w-full accent-[var(--color-primary)]" /></div>
          <div className="sm:w-52"><label className="mb-1.5 block text-xs" htmlFor="status-filter">Status filter</label><Select value={filter} onValueChange={(value) => setFilter(value as StatusFilter)}><SelectTrigger id="status-filter"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All workloads</SelectItem><SelectItem value="regression">Regression</SelectItem><SelectItem value="investigation">Investigate</SelectItem><SelectItem value="no-clear-regression">No clear regression</SelectItem><SelectItem value="insufficient-data">Insufficient data</SelectItem></SelectContent></Select></div>
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,.75fr)]">
        <div className="min-w-0 space-y-6"><LatencyChart rows={visibleRows} selectedId={selected.id} onSelect={setSelectedId} /><BenchmarkTable rows={visibleRows} selectedId={selected.id} onSelect={setSelectedId} /></div>
        <WorkloadDetail workload={selected} baselineLabel={dataset.baselineLabel} candidateLabel={dataset.candidateLabel} threshold={threshold} />
      </div>
      {authOpen && <AuthOverlay onClose={() => setAuthOpen(false)} title="Sign in to save reports" description="Your local analysis stays in this browser until you save it." />}
      <Modal open={saveOpen} onClose={() => !saving && setSaveOpen(false)} size="sm"><Modal.Header><Modal.Title>Save comparison report</Modal.Title><Modal.Description>Measurements are stored privately with your account.</Modal.Description></Modal.Header><Modal.Body className="space-y-4"><div><Label htmlFor="save-title">Title</Label><Input id="save-title" className="mt-1.5" maxLength={200} value={reportTitle} onChange={(event) => setReportTitle(event.target.value)} /></div><div><Label htmlFor="save-description">Description (optional)</Label><Textarea id="save-description" className="mt-1.5" maxLength={2000} value={reportDescription} onChange={(event) => setReportDescription(event.target.value)} /></div><p className="text-xs text-muted-foreground">{dataset.workloads.length} workloads · threshold {threshold}% · original samples preserved</p></Modal.Body><Modal.Footer><Button variant="ghost" disabled={saving} onClick={() => setSaveOpen(false)}>Cancel</Button><Button data-testid="confirm-save-report" loading={saving} disabled={room.status !== 'connected' || !reports.ready || !reportTitle.trim()} onClick={saveReport}>Save report</Button></Modal.Footer></Modal>
    </div>
  )
}

function Summary({ label, value, detail, tone = 'text-foreground' }: { label: string; value: string; detail: string; tone?: string }) {
  return <div className="min-w-0 bg-card p-4"><p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p><p className={`mt-2 truncate text-xl font-semibold ${tone}`}>{value}</p><p className="mt-1 truncate text-xs text-muted-foreground">{detail}</p></div>
}

function LatencyChart({ rows, selectedId, onSelect }: { rows: Row[]; selectedId: string; onSelect: (id: string) => void }) {
  if (rows.length === 0) return <EmptyFiltered />
  const max = Math.max(...rows.flatMap((row) => [row.baselineMedian ?? 0, row.candidateMedian ?? 0]))
  return <section className="rounded-xl border border-border bg-card p-4 sm:p-5" aria-labelledby="chart-title"><div className="mb-5 flex items-start justify-between gap-4"><div><h2 id="chart-title" className="font-semibold">Median latency</h2><p className="text-xs text-muted-foreground">Lower is better · milliseconds</p></div><div className="flex gap-3 text-xs text-muted-foreground"><span><i className="mr-1 inline-block size-2 rounded-sm bg-muted-foreground" />Baseline</span><span><i className="mr-1 inline-block size-2 rounded-sm bg-primary" />Candidate</span></div></div><div className="space-y-5" role="img" aria-label="Baseline and candidate median latency by workload">{rows.map((row) => <button key={row.id} onClick={() => onSelect(row.id)} className={`block w-full rounded-lg p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring ${row.id === selectedId ? 'bg-accent' : 'hover:bg-accent/50'}`}><span className="mb-2 flex justify-between text-xs"><strong className="font-medium">{row.name}</strong><span className={statusMeta[row.status].color}>{formatChange(row.change)}</span></span><Bar label="Baseline" value={row.baselineMedian} max={max} color="bg-muted-foreground" /><Bar label="Candidate" value={row.candidateMedian} max={max} color="bg-primary" /></button>)}</div></section>
}

function Bar({ label, value, max, color }: { label: string; value: number | null; max: number; color: string }) {
  return <span className="mt-1 grid grid-cols-[5rem_1fr_3.5rem] items-center gap-2 text-[11px] text-muted-foreground"><span>{label}</span><span className="h-2 rounded-sm bg-muted"><span className={`block h-full rounded-sm ${color}`} style={{ width: `${((value ?? 0) / max) * 100}%` }} /></span><span className="text-right font-mono">{formatMs(value)}</span></span>
}

function BenchmarkTable({ rows, selectedId, onSelect }: { rows: Row[]; selectedId: string; onSelect: (id: string) => void }) {
  if (rows.length === 0) return null
  return <section className="overflow-hidden rounded-xl border border-border bg-card" aria-labelledby="table-title"><div className="border-b border-border px-5 py-4"><h2 id="table-title" className="font-semibold">Benchmark details</h2><p className="text-xs text-muted-foreground">Median, nearest-rank p95, and 95% bootstrap interval</p></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-5 py-3 font-medium">Workload</th><th className="px-4 py-3 font-medium">Baseline med / p95</th><th className="px-4 py-3 font-medium">Candidate med / p95</th><th className="px-4 py-3 font-medium">Change (95% CI)</th><th className="px-5 py-3 font-medium">Status</th></tr></thead><tbody>{rows.map((row) => { const meta = statusMeta[row.status]; const Icon = meta.icon; return <tr key={row.id} onClick={() => onSelect(row.id)} className={`cursor-pointer border-t border-border hover:bg-accent/50 ${row.id === selectedId ? 'bg-accent' : ''}`}><th className="px-5 py-3 font-medium">{row.name}<span className="block whitespace-nowrap text-xs font-normal text-muted-foreground">{row.baseline.length} baseline · {row.candidate.length} candidate</span></th><td className="px-4 py-3 font-mono text-xs">{formatMs(row.baselineMedian)} / {formatMs(row.baselineP95)}</td><td className="px-4 py-3 font-mono text-xs">{formatMs(row.candidateMedian)} / {formatMs(row.candidateP95)}</td><td className={`px-4 py-3 font-mono text-xs font-medium ${meta.color}`}>{formatChange(row.change)}<span className="block whitespace-nowrap font-normal text-muted-foreground">{formatInterval(row.confidenceInterval)}</span></td><td className="px-5 py-3"><Badge variant={meta.badge}><Icon className="mr-1 size-3" />{meta.label}</Badge></td></tr>})}</tbody></table></div></section>
}

function WorkloadDetail({ workload, baselineLabel, candidateLabel, threshold }: { workload: Row; baselineLabel: string; candidateLabel: string; threshold: number }) {
  const meta = statusMeta[workload.status]
  return <aside className="h-fit rounded-xl border border-border bg-card p-5 xl:sticky xl:top-6" aria-labelledby="detail-title"><div className="flex items-start justify-between gap-3"><div><p className="mb-1 text-xs uppercase tracking-wider text-muted-foreground">Selected workload</p><h2 id="detail-title" className="text-lg font-semibold">{workload.name}</h2><p className="mt-1 text-sm text-muted-foreground">{workload.description}</p></div><Badge variant={meta.badge}>{meta.label}</Badge></div><div className="my-5 rounded-lg border border-border bg-background p-4"><div className="flex items-end justify-between"><span className="text-xs text-muted-foreground">Median change</span><strong className={`font-mono text-2xl ${meta.color}`}>{formatChange(workload.change)}</strong></div><div className="mt-3 grid grid-cols-2 gap-3 border-t border-border pt-3 text-xs"><div><span className="text-muted-foreground">95% bootstrap CI</span><strong className="mt-1 block font-mono">{formatInterval(workload.confidenceInterval)}</strong></div><div><span className="text-muted-foreground">Samples</span><strong className="mt-1 block font-mono">{workload.baseline.length} / {workload.candidate.length}</strong></div></div>{workload.warning && <p className="mt-3 text-xs text-warning">{workload.warning}</p>}<p className="mt-3 text-xs leading-relaxed text-muted-foreground">Regression means the CI lower bound exceeds {threshold}%. Investigate means only the observed median change exceeds it. No clear regression is not proof of safety; bootstrap intervals describe these samples and do not prove causation.</p></div><MeasurementList label={`Baseline · median ${formatMs(workload.baselineMedian)} · p95 ${formatMs(workload.baselineP95)}`} version={baselineLabel} values={workload.baseline} /><div className="my-4 border-t border-border" /><MeasurementList label={`Candidate · median ${formatMs(workload.candidateMedian)} · p95 ${formatMs(workload.candidateP95)}`} version={candidateLabel} values={workload.candidate} /></aside>
}

function MeasurementList({ label, version, values }: { label: string; version: string; values: readonly number[] }) {
  return <div><div className="mb-2 flex items-center justify-between gap-3"><h3 className="text-sm font-medium">{label}</h3><span className="max-w-32 truncate font-mono text-[10px] text-muted-foreground">{version}</span></div><div className="flex flex-wrap gap-1.5">{values.map((value, index) => <span key={index} className="rounded border border-border bg-muted/50 px-2 py-1 font-mono text-xs">{value.toFixed(2)}</span>)}</div></div>
}

function EmptyFiltered() { return <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-border bg-card p-8 text-center"><div><Activity className="mx-auto mb-3 size-6 text-muted-foreground" /><h2 className="font-medium">No workloads match this filter</h2><p className="mt-1 text-sm text-muted-foreground">Choose another status or adjust the threshold.</p></div></div> }
function formatMs(value: number | null) { return value === null ? '—' : `${value.toFixed(2)} ms` }
function formatChange(value: number | null) { return value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%` }
function formatInterval(value: ConfidenceInterval | null) { return value ? `${formatChange(value.lower)} to ${formatChange(value.upper)}` : 'Not available' }
