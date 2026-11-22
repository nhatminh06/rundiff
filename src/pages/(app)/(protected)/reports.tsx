import { useMemo, useState } from 'react'
import { AlertTriangle, FileText, Trash2, UserPlus, X } from 'lucide-react'
import { useAuth, useMutations, useQuery, useRecordContext, useUsers, type RecordData } from 'deepspace'
import { useSearchParams } from 'react-router-dom'
import { Badge, Button, Input, Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Textarea, useToast } from '@/components/ui'
import { analyzeWorkload } from '@/lib/benchmark-stats'
import { type ReportData } from '@/lib/reports'

export default function ReportsPage() {
  const { records, status, error: queryError } = useQuery<ReportData>('reports', { orderBy: 'updatedAt', orderDir: 'desc', limit: 50 })
  const mutations = useMutations<ReportData>('reports')
  const toast = useToast()
  const room = useRecordContext()
  const auth = useAuth()
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [searchParams] = useSearchParams()
  const selected = records.find((record) => record.recordId === selectedId) ?? records[0] ?? null

  async function updateReport(patch: Partial<ReportData>, successTitle = 'Report updated', successDetail = 'The server confirmed your changes.') {
    if (!selected) return
    setBusy(true)
    try { await mutations.putConfirmed(selected.recordId, patch); toast.success(successTitle, successDetail) }
    catch (error) { toast.error('Update failed', messageOf(error)) }
    finally { setBusy(false) }
  }

  async function deleteReport() {
    if (!selected || !window.confirm(`Delete “${selected.data.title}”? This cannot be undone.`)) return
    setBusy(true)
    try { await mutations.removeConfirmed(selected.recordId); setSelectedId(null); toast.success('Report deleted', 'The server confirmed the deletion.') }
    catch (error) { toast.error('Delete failed', messageOf(error)) }
    finally { setBusy(false) }
  }

  return <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8"><div className="mb-6"><h1 className="text-2xl font-semibold tracking-tight">Saved reports</h1><p className="mt-1 text-sm text-muted-foreground">Private comparisons you own or review.</p></div>
    {room.status !== 'connected' && <div role="status" className="mb-4 rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-warning">Reports are offline. Viewing cached data is safe, but changes are disabled until the connection returns.</div>}
    {status === 'loading' && <StateCard title="Loading reports…" detail="Connecting to your private report store." />}
    {status === 'error' && <StateCard title="Could not load reports" detail={queryError ?? 'Check your connection and try again.'} error />}
    {status === 'ready' && records.length === 0 && <StateCard title="No saved reports" detail="Analyze a demo or imported CSV on the dashboard, then save it here." />}
    {import.meta.env.DEV && searchParams.get('testRecordId') && <MutationProbe recordId={searchParams.get('testRecordId')!} />}
    {status === 'ready' && records.length > 0 && selected && <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]"><ReportList records={records} selectedId={selected.recordId} onSelect={setSelectedId} /><ReportEditor key={`${selected.recordId}-${selected.updatedAt}`} record={selected} ready={room.status === 'connected' && mutations.ready && !busy} isOwner={selected.createdBy === auth.userId} canEdit={selected.createdBy === auth.userId || room.roomRole === 'admin'} onUpdate={updateReport} onDelete={deleteReport} /></div>}
  </div>
}

function ReportList({ records, selectedId, onSelect }: { records: RecordData<ReportData>[]; selectedId: string; onSelect: (id: string) => void }) {
  return <aside className="h-fit overflow-hidden rounded-xl border border-border bg-card"><div className="border-b border-border px-4 py-3 text-xs font-medium uppercase tracking-wider text-muted-foreground">Available reports · {records.length}</div>{records.map((record) => <button key={record.recordId} data-record-id={record.recordId} onClick={() => onSelect(record.recordId)} className={`block w-full border-b border-border px-4 py-3 text-left last:border-0 hover:bg-accent ${selectedId === record.recordId ? 'bg-accent' : ''}`}><strong className="block truncate text-sm">{record.data.title}</strong><span className="mt-1 block text-xs text-muted-foreground">{record.data.samples.length} workloads · updated {new Date(record.updatedAt).toLocaleDateString()}</span></button>)}</aside>
}

/** Direct confirmed-mutation probe for Playwright RBAC tests; production builds remove this branch. */
function MutationProbe({ recordId }: { recordId: string }) {
  const mutations = useMutations<ReportData>('reports')
  const room = useRecordContext()
  const [result, setResult] = useState('idle')
  async function attempt(action: 'update' | 'delete' | 'share' | 'invalid') {
    setResult('pending')
    try { if (action === 'update') await mutations.putConfirmed(recordId, { title: 'Unauthorized update' }); else if (action === 'share') await mutations.putConfirmed(recordId, { reviewers: ['forged-reviewer'] }); else if (action === 'invalid') await mutations.putConfirmed(recordId, { title: 'x'.repeat(201) }); else await mutations.removeConfirmed(recordId); setResult('accepted') }
    catch (error) { setResult(`rejected: ${messageOf(error)}`) }
  }
  return <div data-testid="mutation-probe" className="mb-6 flex flex-wrap items-center gap-2 rounded-lg border border-border p-3"><Button disabled={room.status !== 'connected' || !mutations.ready} onClick={() => attempt('update')}>Probe update</Button><Button disabled={room.status !== 'connected' || !mutations.ready} onClick={() => attempt('delete')}>Probe delete</Button><Button disabled={room.status !== 'connected' || !mutations.ready} onClick={() => attempt('share')}>Probe sharing</Button><Button disabled={room.status !== 'connected' || !mutations.ready} onClick={() => attempt('invalid')}>Probe invalid</Button><output className="ml-3" data-testid="mutation-probe-result">{result}</output></div>
}

function ReportEditor({ record, ready, isOwner, canEdit, onUpdate, onDelete }: { record: RecordData<ReportData>; ready: boolean; isOwner: boolean; canEdit: boolean; onUpdate: (patch: Partial<ReportData>, successTitle?: string, successDetail?: string) => Promise<void>; onDelete: () => Promise<void> }) {
  const [title, setTitle] = useState(record.data.title)
  const [description, setDescription] = useState(record.data.description)
  const [threshold, setThreshold] = useState(record.data.threshold)
  const analyses = useMemo(() => record.data.samples.map((workload) => ({ workload, analysis: analyzeWorkload(workload.baseline, workload.candidate, { threshold: record.data.threshold, seed: 2027, iterations: 2000 }) })), [record.data])
  const reviewStatus = record.data.reviewStatus ?? 'pending'
  return <main className="min-w-0 space-y-6"><section className="rounded-xl border border-border bg-card p-5"><div className="mb-4 flex items-center justify-between gap-3"><div><h2 className="font-semibold">Report details</h2><p className="text-xs text-muted-foreground">{isOwner ? 'You own this report.' : 'Shared with you as a read-only reviewer.'}</p></div><Badge variant={reviewStatus === 'accepted' ? 'success' : reviewStatus === 'investigate' ? 'warning' : 'outline'}>{reviewStatus}</Badge></div><div className="grid gap-4 sm:grid-cols-2"><div><Label htmlFor="report-title">Title</Label><Input id="report-title" className="mt-1.5" maxLength={200} value={title} disabled={!canEdit} onChange={(event) => setTitle(event.target.value)} /></div><div><Label htmlFor="report-threshold">Regression threshold (%)</Label><Input id="report-threshold" className="mt-1.5" type="number" min="0" max="100" step="0.5" value={threshold} disabled={!canEdit} onChange={(event) => setThreshold(Number(event.target.value))} /></div><div className="sm:col-span-2"><Label htmlFor="report-description">Description</Label><Textarea id="report-description" className="mt-1.5" maxLength={2000} value={description} disabled={!canEdit} onChange={(event) => setDescription(event.target.value)} /></div>{isOwner && <div><Label htmlFor="review-status">Review status</Label><Select value={reviewStatus} onValueChange={(value) => onUpdate({ reviewStatus: value as ReportData['reviewStatus'] }, 'Review status updated', 'Reviewers received the change in realtime.')}><SelectTrigger id="review-status" className="mt-1.5" disabled={!ready}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="pending">Pending</SelectItem><SelectItem value="accepted">Accepted</SelectItem><SelectItem value="investigate">Investigate</SelectItem></SelectContent></Select></div>}</div>{canEdit && <div className="mt-4 flex flex-wrap justify-between gap-3"><Button variant="destructive" disabled={!ready} onClick={onDelete}><Trash2 />Delete</Button><Button disabled={!ready || !title.trim() || !Number.isFinite(threshold) || threshold < 0} onClick={() => onUpdate({ title: title.trim(), description: description.trim(), threshold })}>Save changes</Button></div>}</section>
    {isOwner && <SharingPanel record={record} ready={ready} onUpdate={onUpdate} />}
    <section className="overflow-hidden rounded-xl border border-border bg-card"><div className="border-b border-border px-5 py-4"><h2 className="font-semibold">Recalculated analysis</h2><p className="text-xs text-muted-foreground">Derived now from the persisted original measurements.</p></div><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead className="bg-muted/40 text-xs text-muted-foreground"><tr><th className="px-5 py-3">Workload</th><th className="px-4 py-3">Samples</th><th className="px-4 py-3">Median change</th><th className="px-4 py-3">95% CI</th><th className="px-5 py-3">Result</th></tr></thead><tbody>{analyses.map(({ workload, analysis }) => <tr key={workload.id} className="border-t border-border"><th className="px-5 py-3 font-medium">{workload.name}</th><td className="px-4 py-3 font-mono text-xs">{workload.baseline.length} / {workload.candidate.length}</td><td className="px-4 py-3 font-mono text-xs">{formatChange(analysis.change)}</td><td className="px-4 py-3 font-mono text-xs">{analysis.confidenceInterval ? `${formatChange(analysis.confidenceInterval.lower)} to ${formatChange(analysis.confidenceInterval.upper)}` : 'Unavailable'}</td><td className="px-5 py-3"><Badge variant={analysis.status === 'regression' ? 'destructive' : analysis.status === 'investigation' ? 'warning' : 'outline'}>{analysis.status.replaceAll('-', ' ')}</Badge></td></tr>)}</tbody></table></div></section>
  </main>
}

function SharingPanel({ record, ready, onUpdate }: { record: RecordData<ReportData>; ready: boolean; onUpdate: (patch: Partial<ReportData>, successTitle?: string, successDetail?: string) => Promise<void> }) {
  const { users, usersLoaded } = useUsers()
  const [invitee, setInvitee] = useState('')
  const reviewers = record.data.reviewers ?? []
  const candidates = users.filter((user) => user.id !== record.createdBy && user.role === 'member' && !reviewers.includes(user.id))
  const nameOf = (id: string) => users.find((user) => user.id === id)?.name ?? 'Unknown member'
  async function invite() {
    if (!invitee) return
    await onUpdate({ reviewers: [...reviewers, invitee] }, 'Reviewer invited', `${nameOf(invitee)} now has read-only access.`)
    setInvitee('')
  }
  return <section className="rounded-xl border border-border bg-card p-5"><h2 className="font-semibold">Review access</h2><p className="mt-1 text-xs text-muted-foreground">Invite registered members to read this report. Reviewers cannot edit or delete it.</p><div className="mt-4 flex flex-col gap-2 sm:flex-row"><Select value={invitee} onValueChange={setInvitee}><SelectTrigger aria-label="Invite reviewer" disabled={!ready || !usersLoaded || candidates.length === 0}><SelectValue placeholder={candidates.length ? 'Select a member' : 'No members available'} /></SelectTrigger><SelectContent>{candidates.map((user) => <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>)}</SelectContent></Select><Button disabled={!ready || !invitee} onClick={invite}><UserPlus />Grant access</Button></div><div className="mt-4 space-y-2">{reviewers.length === 0 ? <p className="text-sm text-muted-foreground">No reviewers invited.</p> : reviewers.map((id) => <div key={id} className="flex items-center justify-between rounded-lg border border-border px-3 py-2"><span className="text-sm">{nameOf(id)}</span><Button size="sm" variant="ghost" disabled={!ready} aria-label={`Revoke ${nameOf(id)}`} onClick={() => onUpdate({ reviewers: reviewers.filter((reviewer) => reviewer !== id) }, 'Reviewer removed', `${nameOf(id)} no longer has access.`)}><X />Revoke</Button></div>)}</div></section>
}

function StateCard({ title, detail, error = false }: { title: string; detail: string; error?: boolean }) { return <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-border bg-card p-8 text-center"><div>{error ? <AlertTriangle className="mx-auto mb-3 size-6 text-destructive" /> : <FileText className="mx-auto mb-3 size-6 text-muted-foreground" />}<h2 className="font-medium">{title}</h2><p className="mt-1 text-sm text-muted-foreground">{detail}</p></div></div> }
function formatChange(value: number | null) { return value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%` }
function messageOf(error: unknown) { return error instanceof Error ? error.message : 'The server did not accept this change.' }
