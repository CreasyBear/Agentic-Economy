import { useEffect, useRef, useState } from 'react'
import { useRouter } from '@tanstack/react-router'
import { Button } from '@/components/arc/button/button'
import { Input } from '@/components/arc/input/input'
import { BillingHistory } from '@/components/arc/blocks/billing-overview/billing-overview'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { formatUtcTimestamp } from '@/lib/ui/format-time'
import { downloadJson } from '@/lib/export/csv-export'
import { createOwnerMonthlyUsageDraftServer, readOwnerMonthlyUsageDraftServer } from '@/lib/server/monthly-usage-draft.functions'
import { monthlyDraftIntentSchema, readFrozenMonthlyDraft } from '@/modules/capability-execution/monthly-usage-draft'
import { activityReturnSearch } from '@/lib/call-recovery/activity-return-scope'
import type { ActivityReturnScope } from '@/lib/call-recovery/activity-return-scope'
import { ActivityReconciliation } from './ActivityReconciliation'
function priorMonth() { const now = new Date(); return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)).toISOString().slice(0, 7) }
export function ActivityMonthlyDraft({returnScope, draftRef}: {returnScope: ActivityReturnScope; draftRef?: string}) {
  const router = useRouter()
  const requestGeneration = useRef(0), selectedDraft = useRef<string | undefined>(undefined)
  const [month, setMonth] = useState(priorMonth), [pending, setPending] = useState(false)
  const [frozen, setFrozen] = useState<ReturnType<typeof readFrozenMonthlyDraft> | null>(null), [message, setMessage] = useState('')
  useEffect(() => { const generationRef = requestGeneration; return () => {generationRef.current++} }, [])
  function selectDraft(next: string | undefined) {
    void router.navigate({to: '/activity', search: {...activityReturnSearch(returnScope), draftRef: next}, replace: true})
  }
  useEffect(() => {
    if (draftRef === undefined) {requestGeneration.current++; selectedDraft.current = undefined; setFrozen(null); setPending(false); setMessage(''); return}
    if (selectedDraft.current === draftRef) return
    selectedDraft.current = undefined
    const generation = ++requestGeneration.current
    let active = true
    setPending(true); setMessage('Reading frozen monthly draft…'); setFrozen(null)
    void readOwnerMonthlyUsageDraftServer({data: {draftRef}}).then(result => {
      if (!active || requestGeneration.current !== generation) return
      if (result.kind !== 'available') {setMessage('The saved monthly draft is unavailable for this account.'); return}
      const next = readFrozenMonthlyDraft(result.snapshotJson, result.snapshotDigest)
      selectedDraft.current = next.snapshot.draftRef; setMonth(next.snapshot.month); setFrozen(next); setMessage(`Monthly draft revision ${next.snapshot.revision} is ready.`)
    }).catch(() => {if (active && requestGeneration.current === generation) setMessage('The saved monthly draft could not be read.')})
      .finally(() => {if (active && requestGeneration.current === generation) setPending(false)})
    return () => {active = false}
  }, [draftRef])
  async function create(revision: number) {
    if (pending || !monthlyDraftIntentSchema.safeParse({month, revision}).success) return
    const generation = ++requestGeneration.current
    setPending(true); setMessage('Preparing monthly draft…')
    try {
      const result = await createOwnerMonthlyUsageDraftServer({data: {month, revision}})
      if (requestGeneration.current !== generation) return
      if (result.kind !== 'available') { setMessage('The monthly draft is unavailable. Retry the same revision, or choose a smaller supported month.'); return }
      const next = readFrozenMonthlyDraft(result.snapshotJson, result.snapshotDigest)
      selectedDraft.current = next.snapshot.draftRef; setFrozen(next); selectDraft(next.snapshot.draftRef); setMessage(`Monthly draft revision ${next.snapshot.revision} is ready.`)
    } catch { if (requestGeneration.current === generation) setMessage('The monthly draft could not be read. Retry the same revision.') }
    finally { if (requestGeneration.current === generation) setPending(false) }
  }
  return <BillingHistory title="Monthly usage drafts" description="Account evidence for a closed UTC month. Each revision preserves its source facts and does not issue an invoice or change money.">
    <div className="flex flex-wrap items-end gap-3">
      <Input label="Closed UTC month" type="month" value={month} max={priorMonth()} disabled={pending} onChange={event => {setMonth(event.target.value); selectedDraft.current = undefined; setFrozen(null); setMessage(''); selectDraft(undefined)}} />
      <Button type="button" variant="secondary" disabled={pending || !monthlyDraftIntentSchema.shape.month.safeParse(month).success} aria-busy={pending || undefined} onClick={() => void create(frozen?.snapshot.revision ?? 1)}>{pending ? 'Preparing…' : frozen === null ? 'Prepare monthly draft' : 'Read same draft'}</Button>
      {frozen === null ? null : <Button type="button" variant="secondary" disabled={pending || frozen.snapshot.revision >= 100} onClick={() => void create(frozen.snapshot.revision + 1)}>Create supplement</Button>}
    </div>
    <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{message}</p>
    {frozen === null ? null : <>
      <AeFactList facts={[{label: 'UTC month / revision', value: `${frozen.snapshot.month} / ${frozen.snapshot.revision}`},
        {label: 'Financial source environment', value: frozen.snapshot.sourceIdentity.environment},
        {label: 'Ledger recorded through (UTC)', value: formatUtcTimestamp(frozen.snapshot.ledgerSnapshotAt)},
        {label: 'Call facts and measurement heads captured (UTC)', value: formatUtcTimestamp(frozen.snapshot.sourcesCapturedAt)},
        {label: 'Historical deliveries measured in this month', value: String(frozen.snapshot.measurements.length)},
        {label: 'Deliveries supported at source capture', value: String(frozen.snapshot.measurements.filter(row => row.evidence.kind === 'available' && row.evidence.currentQuantityUnits === '1').length)},
        {label: 'Historical measurements with unknown current support', value: String(frozen.snapshot.measurements.filter(row => row.evidence.kind === 'available' && row.evidence.currentQuantityUnits === null).length)},
        {label: 'Immutable snapshot digest', value: frozen.snapshotDigest, mono: true}]} />
      <Button type="button" variant="secondary" onClick={() => downloadJson(`monthly-usage-draft-${month}-r${frozen.snapshot.revision}.json`, frozen.snapshot)}>Download frozen evidence JSON</Button>
      <details><summary>Inspect the frozen reconciliation</summary><ActivityReconciliation result={frozen.reconciliation} retryPending={pending} onRetry={() => void create(frozen.snapshot.revision)} returnScope={{...returnScope, returnDraftRef: frozen.snapshot.draftRef}} sourceFactsCapturedAt={frozen.snapshot.sourcesCapturedAt} /></details>
    </>}
    <p className="text-xs text-muted-foreground">Automatic monthly scheduling is inactive. Drafts support at most 300 financial entries, Calls and measurements, with a 250 KB snapshot. Larger months are currently unavailable.</p>
  </BillingHistory>
}
