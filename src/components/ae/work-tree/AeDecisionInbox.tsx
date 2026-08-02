import { useEffect, useMemo, useState } from 'react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { formatMoney } from '@/lib/ui/format-money'
import type { DecisionInboxExit, DecisionInboxExitKind, DecisionInboxItem, DecisionInboxProjection } from '@/modules/work-tree/public'

/**
 * Pattern provenance: adapted from ln-dev7/circle (MIT),
 * https://raw.githubusercontent.com/ln-dev7/circle/master/components/common/inbox/inbox.tsx
 * (with issue-line.tsx, issue-preview.tsx, store/notifications-store.ts, and
 * components/common/issues/status-selector.tsx). The donor was fetched from
 * GitHub and its list/preview split is adapted to AE's source-owned projection
 * and Lock/Adjust/Park exits. License: MIT.
 * Primitive/copy pattern follows the WorkTree decision inbox and receipt projection.
 */

/**
 * The person-facing outcome of a Lock/Adjust/Park, as reported by the source.
 * `receipt` is a durable acceptance, `refusal` is a fenced no-op, and `unknown`
 * is an unconfirmed write the person must re-read before deciding again.
 */
export type AeDecisionInboxStatus = Readonly<{
  tone: 'receipt' | 'refusal' | 'unknown'
  message: string
  detail?: string
}>

export type AeDecisionInboxProps = Readonly<{
  projection: DecisionInboxProjection
  /** The exit currently in flight; the whole exit group is inert while set. */
  pendingExit?: DecisionInboxExitKind
  status?: AeDecisionInboxStatus
  onLock: (item: DecisionInboxItem, exit: DecisionInboxExit) => void
  onAdjust: (item: DecisionInboxItem, exit: DecisionInboxExit) => void
  onPark: (item: DecisionInboxItem, exit: DecisionInboxExit) => void
}>

export function AeDecisionInbox({ projection, pendingExit, status, onLock, onAdjust, onPark }: AeDecisionInboxProps) {
  const [selectedKey, setSelectedKey] = useState<string | undefined>(projection.items[0] === undefined ? undefined : itemKey(projection.items[0]))
  useEffect(() => {
    if (projection.items.some((item) => itemKey(item) === selectedKey)) return
    setSelectedKey(projection.items[0] === undefined ? undefined : itemKey(projection.items[0]))
  }, [projection.items, selectedKey])

  const selectedItem = useMemo(
    () => projection.items.find((item) => itemKey(item) === selectedKey) ?? projection.items[0],
    [projection.items, selectedKey],
  )

  return (
    <section aria-labelledby="decision-inbox-title" className="grid w-full gap-5">
      <div className="grid gap-1">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Decision inbox</p>
        <h2 id="decision-inbox-title" className="text-2xl font-semibold tracking-tight text-foreground">The decisions that matter</h2>
        <p className="text-sm text-muted-foreground">One current frontier at a time.</p>
      </div>

      <Card className="border border-border bg-card" role="status" aria-live="polite">
        <CardContent className="min-h-14 p-4">
          <span className="text-sm font-semibold text-foreground">{projection.nextDecision}</span>
        </CardContent>
      </Card>

      {pendingExit === undefined && status === undefined ? null : (
        <Card
          className={status?.tone === 'refusal' ? 'border border-destructive/50 bg-card' : 'border border-border bg-card'}
          role={status?.tone === 'refusal' ? 'alert' : 'status'}
          aria-live={status?.tone === 'refusal' ? 'assertive' : 'polite'}
          aria-busy={pendingExit !== undefined}
        >
          <CardContent className="grid gap-1 p-4">
            {pendingExit === undefined ? null : (
              <span className="text-sm font-semibold text-foreground">{PENDING_COPY[pendingExit]}</span>
            )}
            {status === undefined ? null : (
              <>
                <span className="text-sm font-semibold text-foreground">{status.message}</span>
                {status.detail === undefined ? null : (
                  <span className="text-sm text-muted-foreground">{status.detail}</span>
                )}
              </>
            )}
          </CardContent>
        </Card>
      )}

      {selectedItem === undefined ? (
        <Card className="border border-border bg-card">
          <CardHeader>
            <CardTitle>The next decision is not ready yet.</CardTitle>
            <CardDescription>We’re checking the details now. Nothing has been locked.</CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(14rem,22rem)_minmax(0,1fr)]">
          <Card className="border border-border bg-card">
            <CardHeader className="p-4">
              <CardTitle className="text-base">Waiting now</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <ol aria-label="Decisions waiting" className="m-0 grid list-none gap-1 p-2">
                {projection.items.map((item) => (
                  <li key={itemKey(item)}>
                    <Button
                      type="button"
                      variant={itemKey(item) === itemKey(selectedItem) ? 'secondary' : 'ghost'}
                      aria-pressed={itemKey(item) === itemKey(selectedItem)}
                      className="h-auto min-h-14 w-full justify-start px-3 py-2 text-left"
                      onClick={() => setSelectedKey(itemKey(item))}
                    >
                      <span className="grid min-w-0 flex-1 gap-1">
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate font-medium">{item.title}</span>
                          <Badge variant="outline" className="shrink-0">{item.status}</Badge>
                        </span>
                        <span className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                          <span className="truncate">{item.description ?? 'The next decision is ready for your call.'}</span>
                          {item.moneyYes ? <span className="shrink-0">Money yes</span> : null}
                        </span>
                      </span>
                    </Button>
                  </li>
                ))}
              </ol>
            </CardContent>
          </Card>

          <DecisionInboxDetail item={selectedItem} pendingExit={pendingExit} onLock={onLock} onAdjust={onAdjust} onPark={onPark} />
        </div>
      )}
    </section>
  )
}

function DecisionInboxDetail({ item, pendingExit, onLock, onAdjust, onPark }: Readonly<{
  item: DecisionInboxItem
  pendingExit: DecisionInboxExitKind | undefined
  onLock: AeDecisionInboxProps['onLock']
  onAdjust: AeDecisionInboxProps['onAdjust']
  onPark: AeDecisionInboxProps['onPark']
}>) {
  // One exit at a time: a second click while a decision is in flight would race
  // the fence it was read against.
  const deciding = pendingExit !== undefined
  return (
    <Card className="border border-border bg-card">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="grid gap-1">
            <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">RECOMMENDED NEXT</p>
            <CardTitle>{item.title}</CardTitle>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={item.status === 'ready' ? 'secondary' : 'outline'}>{item.status}</Badge>
            {item.moneyYes ? <Badge variant="outline">Money yes</Badge> : null}
          </div>
        </div>
        <CardDescription>{item.description ?? 'The next decision is ready for your call.'}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-5">
        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-border p-3">
            <p className="text-sm font-semibold text-foreground">Why now</p>
            <p className="mt-1 text-sm text-muted-foreground">{formatTiming(item)}</p>
          </div>
          <div className="rounded-md border border-border p-3">
            <p className="text-sm font-semibold text-foreground">This unlocks</p>
            <p className="mt-1 text-sm text-muted-foreground">The next step in your plan.</p>
          </div>
        </div>
        <DimensionSummary item={item} />
      </CardContent>
      <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="default" disabled={deciding} aria-busy={pendingExit === 'lock'} className="min-h-11 w-full sm:w-auto" onClick={() => onLock(item, item.exits.lock)}>Lock this in</Button>
        <Button type="button" variant="secondary" disabled={deciding} aria-busy={pendingExit === 'adjust'} className="min-h-11 w-full sm:w-auto" onClick={() => onAdjust(item, item.exits.adjust)}>Adjust</Button>
        <Button type="button" variant="ghost" disabled={deciding} aria-busy={pendingExit === 'park'} className="min-h-11 w-full sm:w-auto" onClick={() => onPark(item, item.exits.park)}>Park for now</Button>
      </CardFooter>
    </Card>
  )
}

function DimensionSummary({ item }: Readonly<{ item: DecisionInboxItem }>) {
  const rows: readonly [string, string][] = [
    ['Timing', formatTiming(item)],
    ['Cost', formatCost(item)],
    ['Resource', item.resource === undefined ? 'Not set' : item.resource.owner],
    ['Effort', item.effort?.humanMinutes === undefined ? 'Not set' : `${item.effort.humanMinutes} min`],
    ['Scope', formatScope(item)],
  ]
  return (
    <dl className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
      {rows.map(([label, value]) => (
        <div key={label} className="rounded-md border border-border p-3">
          <dt className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</dt>
          <dd className="mt-1 text-sm text-foreground">{value}</dd>
        </div>
      ))}
    </dl>
  )
}

function formatTiming(item: DecisionInboxItem): string {
  const timing = item.timing
  if (timing === undefined) return 'Timing still open'
  if (timing.certainty === 'fixed') return timing.date === undefined ? 'Fixed date not set' : timing.date
  if (timing.certainty === 'window') {
    return timing.window === undefined ? 'Window not set' : `${timing.window.earliest} – ${timing.window.latest}`
  }
  return timing.leadTimeDays === undefined ? 'Timing still open' : `${timing.leadTimeDays} business days`
}

function formatCost(item: DecisionInboxItem): string {
  const cost = item.cost
  if (cost === undefined) return 'No cost set'
  const amount = cost.committedMinor ?? cost.estimateMinor ?? cost.envelopeMinor
  if (amount === undefined) return 'Cost still open'
  return `${formatMoney(cost.currency, amount)}${cost.envelopeMinor === undefined ? '' : ` of ${formatMoney(cost.currency, cost.envelopeMinor)} envelope`}`
}

function formatScope(item: DecisionInboxItem): string {
  const scope = item.scope
  if (scope === undefined) return 'Scope still open'
  if (scope.criteria === undefined) return scope.acceptance
  const accepted = scope.criteria.filter((criterion) => criterion.accepted).length
  return `${accepted}/${scope.criteria.length} accepted`
}

const PENDING_COPY: Readonly<Record<DecisionInboxExitKind, string>> = {
  lock: 'Locking this in…',
  adjust: 'Sending your adjustment…',
  park: 'Parking this decision…',
}


function itemKey(item: DecisionInboxItem): string {
  return `${item.treeId}:${item.nodeId}`
}