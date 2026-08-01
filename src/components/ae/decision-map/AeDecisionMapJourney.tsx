import { useEffect, useMemo, useRef, useState } from 'react'
import { useDecisionMapActions } from '@/modules/decision-map/decision-map-client'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import type { DecisionMapChoiceInput, DecisionMapConstraintChangeInput, DecisionMapSnapshot } from '@/modules/decision-map/public'

const STALE_REFUSAL = 'That choice belongs to an earlier version. I haven’t applied it. Load the latest map and choose again.'

type ValueRecord = Readonly<Record<string, unknown>>
type ViewAssumption = Readonly<{ id: string; label: string; value: string; source: string }>
type ViewOption = Readonly<{ id: string; label: string; summary?: string }>
type ViewNode = Readonly<{
  id: string
  kind: string
  label: string
  summary?: string
  status: string
  parentId?: string
  dependsOn: readonly string[]
  constraintRefs: readonly string[]
  options: readonly ViewOption[]
  recommendedOptionId?: string
  reason?: string
  unlocks: readonly string[]
  parkTrigger?: string
}>
type ViewRecord = Readonly<Record<string, unknown>>
type SnapshotView = Readonly<{
  projectId?: string
  threadId?: string
  generation: number
  revision: number
  goalText: string
  summary: string
  assumptions: readonly ViewAssumption[]
  nodes: readonly ViewNode[]
  decisionRecords: readonly ViewRecord[]
  operationRecords: readonly ViewRecord[]
  lastChangeReport?: ViewRecord
}>
type MutationState = Readonly<{
  kind: 'choice' | 'constraint'
  action: 'lock' | 'park' | 'adjust'
  status: 'pending' | 'acknowledged' | 'stale' | 'error'
  decisionId?: string | undefined
  choice?: string | undefined
  trigger?: string | undefined
  message?: string | undefined
}>
type EditorState = Readonly<{ assumptionId: string; value: string }>

export type AeDecisionMapJourneyProps = Readonly<{
  snapshot: DecisionMapSnapshot
  recordChoice?: (input: DecisionMapChoiceInput) => Promise<unknown>
  recordConstraintChange?: (input: DecisionMapConstraintChangeInput) => Promise<unknown>
  onAcknowledgedSnapshot?: (snapshot: DecisionMapSnapshot) => void
}>
type AeDecisionMapJourneyViewProps = Omit<AeDecisionMapJourneyProps, 'recordChoice' | 'recordConstraintChange'> & Readonly<{
  recordChoice: (input: DecisionMapChoiceInput) => Promise<unknown>
  recordConstraintChange: (input: DecisionMapConstraintChangeInput) => Promise<unknown>
}>

export function AeDecisionMapJourney(props: AeDecisionMapJourneyProps) {
  const recordChoice = props.recordChoice
  const recordConstraintChange = props.recordConstraintChange
  if (recordChoice !== undefined && recordConstraintChange !== undefined) return <AeDecisionMapJourneyView snapshot={props.snapshot} recordChoice={recordChoice} recordConstraintChange={recordConstraintChange} {...(props.onAcknowledgedSnapshot === undefined ? {} : { onAcknowledgedSnapshot: props.onAcknowledgedSnapshot })} />
  return <AeDecisionMapJourneyWithServerActions {...props} />
}

function AeDecisionMapJourneyWithServerActions(props: AeDecisionMapJourneyProps) {
  const actions = useDecisionMapActions()
  return <AeDecisionMapJourneyView snapshot={props.snapshot} recordChoice={props.recordChoice ?? actions.recordChoice} recordConstraintChange={props.recordConstraintChange ?? actions.recordConstraintChange} {...(props.onAcknowledgedSnapshot === undefined ? {} : { onAcknowledgedSnapshot: props.onAcknowledgedSnapshot })} />
}

function AeDecisionMapJourneyView({ snapshot, recordChoice: submitChoiceServer, recordConstraintChange: submitConstraintChangeServer, onAcknowledgedSnapshot }: AeDecisionMapJourneyViewProps) {
  const [acknowledgedSnapshot, setAcknowledgedSnapshot] = useState<DecisionMapSnapshot>()
  const activeSnapshot = acknowledgedSnapshot ?? snapshot
  const view = useMemo(() => projectSnapshot(activeSnapshot), [activeSnapshot])
  const [editor, setEditor] = useState<EditorState>()
  const [mutation, setMutation] = useState<MutationState>()
  const [mapOpen, setMapOpen] = useState(false)
  const operationKeysRef = useRef(new Map<string, string>())
  const frontier = useMemo(() => selectFrontier(view.nodes), [view.nodes])
  const stale = isSnapshotStale(view, frontier)
  const pending = mutation?.status === 'pending'
  const decisionChoice = frontier === undefined ? undefined : recommendedChoice(frontier)

  useEffect(() => {
    if (acknowledgedSnapshot !== undefined && snapshotVersionAtLeast(snapshot, acknowledgedSnapshot)) {
      setAcknowledgedSnapshot(undefined)
    }
  }, [acknowledgedSnapshot, snapshot])

  function openEditor(assumptionId?: string) {
    const assumption = view.assumptions.find((item) => item.id === assumptionId) ?? view.assumptions[0]
    if (assumption === undefined) return
    setMutation(undefined)
    setEditor({ assumptionId: assumption.id, value: assumption.value })
  }

  async function submitConstraintChange() {
    if (editor === undefined) return
    const operationKey = operationKeyFor(operationKeysRef.current, `constraint:${editor.assumptionId}:${editor.value}`, view)
    const input = {
      ...identityInput(view), expectedGeneration: view.generation, expectedRevision: view.revision,
      assumptionId: editor.assumptionId, value: editor.value, operationKey,
    } as DecisionMapConstraintChangeInput
    setMutation({ kind: 'constraint', action: 'adjust', status: 'pending' })
    try {
      const result = await submitConstraintChangeServer(input)
      const acknowledged = acknowledgedSnapshotFromResult(result)
      if (acknowledged !== undefined) {
        setAcknowledgedSnapshot(acknowledged)
        onAcknowledgedSnapshot?.(acknowledged)
      }
      if (isStaleResult(result)) setMutation({ kind: 'constraint', action: 'adjust', status: 'stale', message: STALE_REFUSAL })
      else if (acknowledged !== undefined || isAcknowledgedResult(result)) {
        setEditor(undefined)
        setMutation({ kind: 'constraint', action: 'adjust', status: 'acknowledged', message: 'Your decision map was updated.' })
      } else setMutation({ kind: 'constraint', action: 'adjust', status: 'error', message: resultMessage(result) })
    } catch (error) {
      if (isStaleResult(error)) setMutation({ kind: 'constraint', action: 'adjust', status: 'stale', message: STALE_REFUSAL })
      else setMutation({ kind: 'constraint', action: 'adjust', status: 'error', message: errorMessage(error) })
    }
  }

  async function submitChoice(action: 'lock' | 'park') {
    if (frontier === undefined || stale || pending) return
    const operationKey = operationKeyFor(operationKeysRef.current, `choice:${frontier.id}:${action}`, view)
    const input = {
      ...identityInput(view), expectedGeneration: view.generation, expectedRevision: view.revision,
      decisionId: frontier.id, choice: action, operationKey,
    } as DecisionMapChoiceInput
    setMutation({ kind: 'choice', action, status: 'pending', decisionId: frontier.id, choice: decisionChoice })
    try {
      const result = await submitChoiceServer(input)
      const acknowledged = acknowledgedSnapshotFromResult(result)
      if (acknowledged !== undefined) {
        setAcknowledgedSnapshot(acknowledged)
        onAcknowledgedSnapshot?.(acknowledged)
      }
      if (isStaleResult(result)) setMutation({ kind: 'choice', action, status: 'stale', decisionId: frontier.id, choice: decisionChoice, message: STALE_REFUSAL })
      else if (acknowledged !== undefined || isAcknowledgedResult(result)) {
        const trigger = frontier.parkTrigger ?? 'the next decision-ready update'
        setMutation({ kind: 'choice', action, status: 'acknowledged', decisionId: frontier.id, choice: decisionChoice, trigger, message: action === 'lock' ? `Locked: ${decisionChoice ?? frontier.label}.` : `Parked until ${trigger}.` })
      } else setMutation({ kind: 'choice', action, status: 'error', decisionId: frontier.id, choice: decisionChoice, message: resultMessage(result) })
    } catch (error) {
      if (isStaleResult(error)) setMutation({ kind: 'choice', action, status: 'stale', decisionId: frontier.id, choice: decisionChoice, message: STALE_REFUSAL })
      else setMutation({ kind: 'choice', action, status: 'error', decisionId: frontier.id, choice: decisionChoice, message: errorMessage(error) })
    }
  }

  const statusMessage = mutation?.message
  return (
    <section aria-labelledby="decision-map-title" className="grid w-full gap-5">
      <div className="grid gap-1">
        <p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">Decision map</p>
        <h2 id="decision-map-title" className="text-2xl font-semibold tracking-tight text-foreground">{view.goalText}</h2>
      </div>
      <AeDecisionMapReflection view={view} editor={editor} pending={pending === true} onOpenEditor={openEditor} onEditorChange={(value) => setEditor((current) => current === undefined ? current : { ...current, value })} onSubmitEditor={() => void submitConstraintChange()} onCancelEditor={() => setEditor(undefined)} />
      {view.lastChangeReport === undefined ? null : <AeDecisionMapRipple report={view.lastChangeReport} nodes={view.nodes} />}
      <div aria-live="polite" aria-atomic="true" aria-busy={pending || undefined} className="min-h-6 text-sm text-muted-foreground">{statusMessage ?? (pending ? 'Saving this decision…' : '')}</div>
      {mutation?.status === 'stale' ? <p role="alert" className="rounded-md border border-destructive/50 bg-card px-4 py-3 text-sm text-foreground">{STALE_REFUSAL}</p> : null}
      {mutation?.status === 'error' ? <p role="alert" className="rounded-md border border-destructive/50 bg-card px-4 py-3 text-sm text-foreground">{statusMessage ?? 'The decision could not be saved. Nothing changed.'}</p> : null}
      <div className="grid gap-1"><h3 className="text-lg font-semibold text-foreground">The decisions that matter</h3><p className="text-sm text-muted-foreground">One current frontier at a time.</p></div>
      {frontier === undefined ? <Card className="border border-border bg-card"><CardHeader><CardTitle>The next decision is not ready yet.</CardTitle><CardDescription>We’re checking the details now. Nothing has been locked.</CardDescription></CardHeader></Card> : <AeDecisionMapFrontier node={frontier} stale={stale} pending={pending === true} success={mutation?.status === 'acknowledged' && mutation.kind === 'choice' && mutation.decisionId === frontier.id ? mutation : undefined} onLock={() => void submitChoice('lock')} onAdjust={() => openEditor()} onPark={() => void submitChoice('park')} />}
      <Collapsible open={mapOpen} onOpenChange={setMapOpen}>
        <CollapsibleTrigger asChild><Button type="button" variant="outline" className="min-h-11 w-full justify-between sm:w-auto"><span>{mapOpen ? 'Hide the whole plan' : 'See the whole plan'}</span><span aria-hidden="true">{mapOpen ? '−' : '+'}</span></Button></CollapsibleTrigger>
        <CollapsibleContent className="grid gap-5 pt-4"><AeDecisionMapDisclosure nodes={view.nodes} /><AeDecisionMapTrail records={view.decisionRecords} operations={view.operationRecords} /></CollapsibleContent>
      </Collapsible>
      <p className="text-xs text-muted-foreground">This updates your decision map only.</p>
    </section>
  )
}

function AeDecisionMapReflection({ view, editor, pending, onOpenEditor, onEditorChange, onSubmitEditor, onCancelEditor }: Readonly<{ view: SnapshotView; editor: EditorState | undefined; pending: boolean; onOpenEditor: (assumptionId?: string) => void; onEditorChange: (value: string) => void; onSubmitEditor: () => void; onCancelEditor: () => void }>) {
  return (
    <Card className="border border-border bg-card">
      <CardHeader><CardTitle>Here’s what I heard.</CardTitle><CardDescription>Tell me what I’ve got wrong.</CardDescription></CardHeader>
      <CardContent className="grid gap-5">
        <p className="text-base leading-7 text-foreground">{view.summary}</p>
        <div className="grid gap-3"><div className="grid gap-1"><h3 className="text-sm font-semibold text-foreground">I’m assuming</h3><p className="text-sm text-muted-foreground">Change anything that isn’t right.</p></div>
          {view.assumptions.length === 0 ? <p className="text-sm text-muted-foreground">No assumptions are waiting for your review.</p> : <ul aria-label="Assumptions" className="m-0 grid list-none gap-2 p-0">{view.assumptions.map((assumption) => <li key={assumption.id} className="grid gap-2 rounded-md border border-border p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="grid gap-1"><span className="font-medium text-foreground">{assumption.label}: {assumption.value}</span><Badge variant="outline" className="justify-self-start">{assumptionSourceLabel(assumption.source)}</Badge></div><Button type="button" variant="outline" className="min-h-11 w-full sm:w-auto" disabled={pending} onClick={() => onOpenEditor(assumption.id)}>Adjust</Button></li>)}</ul>}
        </div>
        {editor === undefined ? null : <form className="grid gap-3 rounded-md border border-border bg-background p-4" onSubmit={(event) => { event.preventDefault(); onSubmitEditor() }}><label htmlFor="decision-map-assumption" className="grid gap-2 text-sm font-medium text-foreground">Change this assumption</label><input id="decision-map-assumption" value={editor.value} disabled={pending} onChange={(event) => onEditorChange(event.currentTarget.value)} className="min-h-11 w-full rounded-md border border-border bg-card px-3 py-2 text-base text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:outline-2 focus-visible:outline-offset-2" /><p className="text-sm text-muted-foreground">This updates your decision map only.</p><div className="flex flex-col gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="ghost" className="min-h-11" disabled={pending} onClick={onCancelEditor}>Cancel</Button><Button type="submit" variant="secondary" className="min-h-11" disabled={pending || editor.value.trim().length === 0} aria-busy={pending || undefined}>{pending ? 'Saving' : 'Save adjustment'}</Button></div></form>}
      </CardContent>
    </Card>
  )
}
function AeDecisionMapFrontier({ node, stale, pending, success, onLock, onAdjust, onPark }: Readonly<{ node: ViewNode; stale: boolean; pending: boolean; success: MutationState | undefined; onLock: () => void; onAdjust: () => void; onPark: () => void }>) {
  const recommended = recommendedOption(node)
  return (
    <Card className="border border-border bg-card">
      <CardHeader><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div className="grid gap-1"><p className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">RECOMMENDED NEXT</p><CardTitle>{recommended?.label ?? node.label}</CardTitle></div><Badge variant={stale ? 'destructive' : 'secondary'}>{stale ? 'Needs updating' : node.status}</Badge></div><CardDescription>{node.reason ?? 'The next decision is ready for your call.'}</CardDescription></CardHeader>
      <CardContent className="grid gap-5"><div className="grid gap-2 sm:grid-cols-2"><div className="rounded-md border border-border p-3"><p className="text-sm font-semibold text-foreground">Why now</p><p className="mt-1 text-sm text-muted-foreground">{node.reason ?? 'This is the current frontier decision.'}</p></div><div className="rounded-md border border-border p-3"><p className="text-sm font-semibold text-foreground">This unlocks</p>{node.unlocks.length === 0 ? <p className="mt-1 text-sm text-muted-foreground">The next step in your plan.</p> : <ul className="m-0 mt-1 grid list-disc gap-1 pl-5 text-sm text-muted-foreground">{node.unlocks.map((unlock) => <li key={unlock}>{unlock}</li>)}</ul>}</div></div><div className="grid gap-2"><p className="text-sm font-semibold text-foreground">Options</p><ul aria-label="Recommendation options" className="m-0 grid list-none gap-2 p-0">{node.options.map((option) => <li key={option.id} className="rounded-md border border-border p-3"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div className="grid gap-1"><span className="font-medium text-foreground">{option.label}</span>{option.summary === undefined ? null : <span className="text-sm text-muted-foreground">{option.summary}</span>}</div>{option.id === node.recommendedOptionId ? <Badge>Recommended</Badge> : null}</div></li>)}</ul></div>{success?.action === 'lock' ? <p role="status" className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">Locked: {success.choice ?? recommended?.label ?? node.label}.</p> : null}{success?.action === 'park' ? <p role="status" className="rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground">Parked until {success.trigger ?? node.parkTrigger ?? 'the next update'}.</p> : null}</CardContent>
      <CardFooter className="flex flex-col gap-2 sm:flex-row sm:justify-end"><Button type="button" variant="default" className="min-h-11 w-full sm:w-auto" disabled={stale || pending || success !== undefined} onClick={onLock}>Lock this in</Button><Button type="button" variant="secondary" className="min-h-11 w-full sm:w-auto" disabled={pending} onClick={onAdjust}>Adjust</Button><Button type="button" variant="ghost" className="min-h-11 w-full sm:w-auto" disabled={stale || pending || success !== undefined} onClick={onPark}>Park for now</Button></CardFooter>
    </Card>
  )
}
function AeDecisionMapRipple({ report, nodes }: Readonly<{ report: ViewRecord; nodes: readonly ViewNode[] }>) {
  const labels = new Map<string, string>(nodes.map((node): [string, string] => [node.id, node.label]))
  const summary = textValue(report, ['changedDetail', 'summary', 'headline', 'message'])
  const changedCount = numberValue(report, ['changedCount', 'affectedCount', 'count'])
  const lines: readonly [string, string | undefined][] = [['Still holds', listText(report, ['preservedNodeIds', 'preserved', 'preservedDecisions', 'survivingLocks'], labels)], ['Needs updating', listText(report, ['affectedNodeIds', 'staleStudies', 'affected', 'stale'], labels)], ['Back in play', listText(report, ['reopenedNodeIds', 'reopened', 'reopenedDecisions', 'backInPlay'], labels)], ['Cost', textValue(report, ['costDelta', 'costChange'])], ['Timing', textValue(report, ['timingDelta', 'timingChange'])]]
  const visibleLines = lines.filter(([, value]) => value !== undefined)
  if (summary === undefined && visibleLines.length === 0) return null
  return <Card className="border border-border bg-card" role="status"><CardHeader><CardTitle>{summary ?? `This change affects ${changedCount ?? visibleLines.length} things.`}</CardTitle><CardDescription>The updated assumption is reflected below. Locked decisions are shown honestly.</CardDescription></CardHeader><CardContent><ul aria-label="Change ripple" className="m-0 grid list-none gap-2 p-0">{visibleLines.map(([label, value]) => <li key={label} className="grid gap-1 rounded-md border border-border p-3 sm:grid-cols-[10rem_minmax(0,1fr)]"><span className="font-medium text-foreground">{label}</span><span className="text-sm text-muted-foreground">{value}</span></li>)}</ul></CardContent></Card>
}

function AeDecisionMapDisclosure({ nodes }: Readonly<{ nodes: readonly ViewNode[] }>) {
  return <section aria-labelledby="decision-map-disclosure-title" className="grid gap-3"><div className="grid gap-1"><h3 id="decision-map-disclosure-title" className="text-lg font-semibold text-foreground">The whole decision map</h3><p className="text-sm text-muted-foreground">A read-only view of what is decided, waiting, and still open.</p></div><ol aria-label="Decision map areas and decisions" className="m-0 grid list-none gap-3 p-0">{nodes.map((node) => <li key={node.id}><Card className="border border-border bg-card"><CardHeader className="p-4"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><CardTitle className="text-base">{node.label}</CardTitle><Badge variant="outline">{node.status}</Badge></div>{node.summary === undefined ? null : <CardDescription>{node.summary}</CardDescription>}</CardHeader>{node.options.length === 0 ? null : <CardContent className="p-4 pt-0"><ul aria-label={`Options for ${node.label}`} className="m-0 grid list-disc gap-1 pl-5 text-sm text-muted-foreground">{node.options.map((option) => <li key={option.id}>{option.label}{option.summary === undefined ? '' : ` — ${option.summary}`}</li>)}</ul></CardContent>}</Card></li>)}</ol></section>
}

function AeDecisionMapTrail({ records, operations }: Readonly<{ records: readonly ViewRecord[]; operations: readonly ViewRecord[] }>) {
  const items = [...records, ...operations]
  if (items.length === 0) return null
  return <section aria-labelledby="decision-map-trail-title" className="grid gap-3"><div className="grid gap-1"><h3 id="decision-map-trail-title" className="text-lg font-semibold text-foreground">Decision trail</h3><p className="text-sm text-muted-foreground">A record of choices and changes acknowledged by the map.</p></div><ol className="m-0 grid list-none gap-2 p-0">{items.map((record, index) => { const action = textValue(record, ['action', 'choice', 'kind', 'type']) ?? 'Map update'; const label = textValue(record, ['label', 'summary', 'decisionId', 'assumptionId']) ?? 'Decision map update'; const at = textValue(record, ['at', 'createdAt', 'updatedAt']); return <li key={`${action}:${label}:${index}`}><Card className="border border-border bg-card p-4"><p className="font-medium text-foreground">{label}</p><p className="mt-1 text-sm text-muted-foreground">{action}{at === undefined ? '' : ` · ${at}`}</p></Card></li> })}</ol></section>
}
function projectSnapshot(snapshot: DecisionMapSnapshot): SnapshotView {
  const raw = snapshot as unknown as ValueRecord
  const assumptions = arrayValue(raw.assumptions).map((item, index) => {
    const record = asRecord(item)
    return {
      id: stringValue(record, ['id']) ?? `assumption-${index + 1}`,
      label: stringValue(record, ['label', 'name']) ?? 'Assumption',
      value: displayValue(record?.value),
      source: stringValue(record, ['source', 'basis']) ?? 'assumed',
    }
  })
  const nodes = arrayValue(raw.nodes).map((item, index) => projectNode(item, index))
  const projectId = stringValue(raw, ['projectId'])
  const threadId = stringValue(raw, ['threadId'])
  const lastChangeReport = asRecord(raw.lastChangeReport)
  return {
    ...(projectId === undefined ? {} : { projectId }),
    ...(threadId === undefined ? {} : { threadId }),
    generation: numberValue(raw, ['generation']) ?? 0,
    revision: numberValue(raw, ['revision']) ?? 0,
    goalText: stringValue(raw, ['goalText', 'goal', 'title']) ?? 'Your project',
    summary: stringValue(raw, ['summary', 'reflection', 'heard'])
      ?? stringValue(raw, ['goalText', 'goal'])
      ?? 'I’m holding this as the current shape of your request.',
    assumptions,
    nodes,
    decisionRecords: arrayValue(raw.decisionRecords).map(asRecord).filter(isRecord),
    operationRecords: arrayValue(raw.operationRecords).map(asRecord).filter(isRecord),
    ...(lastChangeReport === undefined ? {} : { lastChangeReport }),
  }
}
function projectNode(value: unknown, index: number): ViewNode {
  const record = asRecord(value)
  const options = arrayValue(record?.options).map((item, optionIndex) => {
    const option = asRecord(item)
    const summary = stringValue(option, ['summary', 'description'])
    return {
      id: stringValue(option, ['id']) ?? `option-${index + 1}-${optionIndex + 1}`,
      label: stringValue(option, ['label', 'name']) ?? 'Option',
      ...(summary === undefined ? {} : { summary }),
    }
  })
  const summary = stringValue(record, ['summary', 'description'])
  const parentId = stringValue(record, ['parentId'])
  const recommendedOptionId = stringValue(record, ['recommendedOptionId', 'recommendationId'])
  const reason = stringValue(record, ['reason', 'whyNow', 'rationale'])
  const parkTrigger = stringValue(record, ['parkTrigger', 'revisitTrigger'])
  return {
    id: stringValue(record, ['id']) ?? `node-${index + 1}`,
    kind: stringValue(record, ['kind']) ?? 'decision',
    label: stringValue(record, ['label', 'title', 'name']) ?? 'Decision',
    ...(summary === undefined ? {} : { summary }),
    status: stringValue(record, ['status', 'state']) ?? 'open',
    ...(parentId === undefined ? {} : { parentId }),
    dependsOn: stringArrayValue(record, ['dependsOn']),
    constraintRefs: stringArrayValue(record, ['constraintRefs']),
    options,
    ...(recommendedOptionId === undefined ? {} : { recommendedOptionId }),
    ...(reason === undefined ? {} : { reason }),
    unlocks: stringArrayValue(record, ['unlocks', 'unlock']),
    ...(parkTrigger === undefined ? {} : { parkTrigger }),
  }
}

function recommendedChoice(node: ViewNode): string | undefined { return recommendedOption(node)?.label }
function recommendedOption(node: ViewNode): ViewOption | undefined { return node.options.find((option) => option.id === node.recommendedOptionId) ?? node.options[0] }
function selectFrontier(nodes: readonly ViewNode[]): ViewNode | undefined { return nodes.find((node) => node.kind === 'decision' && node.status.toLowerCase() === 'ready') }
function isSnapshotStale(view: SnapshotView, frontier: ViewNode | undefined): boolean { if (frontier?.status.toLowerCase() === 'stale') return true; return booleanValue(view.lastChangeReport, ['stale', 'requiresRefresh', 'generationStale']) === true }
function identityInput(view: SnapshotView): { projectId?: string; threadId?: string } { return { ...(view.projectId === undefined ? {} : { projectId: view.projectId }), ...(view.threadId === undefined ? {} : { threadId: view.threadId }) } }
function snapshotVersionAtLeast(candidate: DecisionMapSnapshot, baseline: DecisionMapSnapshot): boolean { return candidate.generation > baseline.generation || candidate.generation === baseline.generation && candidate.revision >= baseline.revision }
function operationKeyFor(keys: Map<string, string>, action: string, view: SnapshotView): string {
  const scope = `${view.threadId ?? view.projectId ?? 'map'}:${view.generation}:${view.revision}`
  const lookup = `${scope}:${action}`
  const existing = keys.get(lookup)
  if (existing !== undefined) return existing
  const key = `decision-map:${shortToken(lookup)}`
  keys.set(lookup, key)
  return key
}
function shortToken(value: string): string { let hash = 2166136261; for (let index = 0; index < value.length; index += 1) hash = Math.imul(hash ^ value.charCodeAt(index), 16777619); return (hash >>> 0).toString(16) }
function acknowledgedSnapshotFromResult(result: unknown): DecisionMapSnapshot | undefined {
  const record = asRecord(result)
  if (record?.version === 'decisionMap_v1' && typeof record.generation === 'number') return result as DecisionMapSnapshot
  const candidate = record?.snapshot ?? record?.acknowledgedSnapshot ?? record?.map
  return isRecord(candidate) ? candidate as DecisionMapSnapshot : undefined
}
function isAcknowledgedResult(result: unknown): boolean {
  if (acknowledgedSnapshotFromResult(result) !== undefined) return true
  const kind = stringValue(asRecord(result), ['kind', 'status', 'outcome'])?.toLowerCase()
  return kind === 'applied' || kind === 'acknowledged' || kind === 'recorded' || kind === 'replayed' || kind === 'saved' || kind === 'ok'
}
function isStaleResult(result: unknown): boolean {
  const kind = stringValue(asRecord(result), ['kind', 'status', 'outcome', 'code', 'reason'])?.toLowerCase() ?? ''
  const message = result instanceof Error ? result.message.toLowerCase() : ''
  return kind.includes('stale') || kind.includes('conflict') || kind.includes('generation') || kind.includes('revision') || message.includes('stale') || message.includes('generation') || message.includes('revision')
}
function resultMessage(result: unknown): string { return stringValue(asRecord(result), ['message', 'reason', 'error']) ?? 'The decision could not be saved. Nothing changed.' }
function errorMessage(error: unknown): string { return error instanceof Error ? error.message : 'The decision could not be saved. Nothing changed.' }
function textValue(record: ViewRecord, keys: readonly string[]): string | undefined { const direct = stringValue(record, keys); if (direct !== undefined) return direct; for (const key of keys) { const value = record[key]; if (typeof value === 'number' || typeof value === 'boolean') return String(value) } return undefined }
function assumptionSourceLabel(source: string): string { const normalized = source.toLowerCase(); return normalized === 'person' || normalized === 'provided' || normalized === 'stated' || normalized === 'supplied' ? 'You said' : 'Assumed' }
function asRecord(value: unknown): ValueRecord | undefined { return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as ValueRecord : undefined }
function isRecord(value: unknown): value is ValueRecord { return typeof value === 'object' && value !== null && !Array.isArray(value) }
function arrayValue(value: unknown): readonly unknown[] { return Array.isArray(value) ? value : [] }
function stringValue(record: ValueRecord | undefined, keys: readonly string[]): string | undefined { if (record === undefined) return undefined; for (const key of keys) { const value = record[key]; if (typeof value === 'string' && value.trim().length > 0) return value } return undefined }
function numberValue(record: ValueRecord | undefined, keys: readonly string[]): number | undefined { if (record === undefined) return undefined; for (const key of keys) { const value = record[key]; if (typeof value === 'number' && Number.isFinite(value)) return value } return undefined }
function booleanValue(record: ValueRecord | undefined, keys: readonly string[]): boolean | undefined { if (record === undefined) return undefined; for (const key of keys) { if (typeof record[key] === 'boolean') return record[key] as boolean } return undefined }
function stringArrayValue(record: ValueRecord | undefined, keys: readonly string[]): readonly string[] { if (record === undefined) return []; for (const key of keys) { const value = record[key]; if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string') } return [] }
function displayValue(value: unknown): string { if (typeof value === 'string') return value; if (typeof value === 'number' || typeof value === 'boolean') return String(value); if (value === undefined || value === null) return 'not set'; try { return JSON.stringify(value) } catch { return 'not set' } }
function listText(record: ViewRecord, keys: readonly string[], labels?: ReadonlyMap<string, string>): string | undefined { for (const key of keys) { const value = record[key]; if (typeof value === 'string' && value.trim().length > 0) return labels?.get(value) ?? value; if (Array.isArray(value)) { const text = value.map((item) => typeof item === 'string' ? labels?.get(item) ?? item : displayValue(asRecord(item)?.label ?? item)).filter(Boolean).join(', '); if (text.length > 0) return text } } return undefined }

export { AeDecisionMapDisclosure, AeDecisionMapFrontier, AeDecisionMapReflection, AeDecisionMapRipple, AeDecisionMapTrail }
