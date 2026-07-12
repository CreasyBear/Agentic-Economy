import { canonicalAuthorityDigest } from './internal/authority-digest'

export const INCIDENT_ACTION_CLASSES = [
  'route',
  'authorize',
  'root_admission',
  'provider_release',
  'data_release',
  'reconcile',
  'cancel',
] as const

export type IncidentActionClass = (typeof INCIDENT_ACTION_CLASSES)[number]

export type IncidentScope = Readonly<{
  networkId?: string
  principalId?: string
  agentId?: string
  bindingId?: string
  capabilityContractId?: string
}>

export type FreezeOrder = Readonly<{
  schemaVersion: 'incident-freeze-order:v1'
  freezeOrderId: string
  incidentId: string
  issuerId: string
  reason: string
  scope: IncidentScope
  blockedActions: readonly IncidentActionClass[]
  epoch: number
  issuedAt: number
  status: 'active' | 'resumed'
  resumedByOrderId?: string
}>

export type ResumeOrder = Readonly<{
  schemaVersion: 'incident-resume-order:v1'
  resumeOrderId: string
  freezeOrderId: string
  approverIds: readonly string[]
  evidenceRefs: readonly string[]
  epoch: number
  issuedAt: number
}>

export type IncidentEvaluation =
  | Readonly<{ kind: 'allowed'; epochDigest: string }>
  | Readonly<{
      kind: 'frozen'
      epochDigest: string
      freezeOrderId: string
      incidentId: string
      reason: string
    }>

export type IssueFreezeInput = Readonly<Omit<FreezeOrder, 'schemaVersion' | 'epoch' | 'status' | 'resumedByOrderId'>>
export type IssueResumeInput = Readonly<Omit<ResumeOrder, 'schemaVersion' | 'epoch'>>

export type IssueFreezeResult =
  | Readonly<{ kind: 'freeze_issued'; order: FreezeOrder; epoch: number }>
  | Readonly<{ kind: 'freeze_refused'; reason: 'freeze_order_conflict' | 'blocked_actions_required' }>

export type IssueResumeResult =
  | Readonly<{ kind: 'resume_issued'; order: ResumeOrder; epoch: number }>
  | Readonly<{
      kind: 'resume_refused'
      reason:
        | 'freeze_order_not_found'
        | 'freeze_order_not_active'
        | 'resume_order_conflict'
        | 'independent_approval_required'
        | 'resume_evidence_required'
    }>

export type IncidentControlTestHarness = Readonly<{
  evaluate: (scope: IncidentScope, action: IncidentActionClass) => Promise<IncidentEvaluation>
  issueFreeze: (input: IssueFreezeInput) => Promise<IssueFreezeResult>
  issueResume: (input: IssueResumeInput) => Promise<IssueResumeResult>
}>

export type IncidentEvaluator = Readonly<{
  evaluate: (scope: IncidentScope, action: IncidentActionClass) => Promise<IncidentEvaluation>
  claimRecovery?: (input: Readonly<{
    recoveryGrantId: string
    lane: 'reconcile' | 'canary'
    scope: IncidentScope
    operationRef: string
    usedAt: number
    canaryExecution?: Readonly<{
      quoteId: string; quoteDigest: string; authorizationRef: string; requestDigest: string
      bindingId: string; capabilityContractId: string; maximumSpendMinor: number
      currency: string; allowedDataFields: readonly string[]
    }>
  }>) => Promise<Readonly<{ kind: 'recovery_authorized'; replay: boolean }> | Readonly<{ kind: 'recovery_refused'; reason: string }>>
}>

/** Test-only incident fixture. Production incident authority lives in Convex authenticated mutations. */
export function createIncidentControlTestHarness(): IncidentControlTestHarness {
  const freezes = new Map<string, FreezeOrder>()
  const resumes = new Map<string, ResumeOrder>()
  const epochs = new Map<string, number>()

  return Object.freeze({
    evaluate: async (scope, action) => {
      const matchingEpochs = [...epochs.entries()]
        .filter(([scopeKey]) => scopeMatches(parseScopeKey(scopeKey), scope))
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([scopeKey, epoch]) => ({ scopeKey, epoch }))
      const epochDigest = canonicalAuthorityDigest({ incidentEpochs: matchingEpochs })
      const active = [...freezes.values()]
        .filter((order) => order.status === 'active' && order.blockedActions.includes(action) && scopeMatches(order.scope, scope))
        .sort((left, right) => right.epoch - left.epoch || left.freezeOrderId.localeCompare(right.freezeOrderId))[0]
      return active === undefined
        ? { kind: 'allowed', epochDigest }
        : {
            kind: 'frozen', epochDigest, freezeOrderId: active.freezeOrderId,
            incidentId: active.incidentId, reason: active.reason,
          }
    },
    issueFreeze: async (input) => {
      const existing = freezes.get(input.freezeOrderId)
      if (existing !== undefined) {
        const same = canonicalAuthorityDigest(freezeMaterial(existing)) === canonicalAuthorityDigest(freezeMaterial(input))
        return same
          ? { kind: 'freeze_issued', order: existing, epoch: existing.epoch }
          : { kind: 'freeze_refused', reason: 'freeze_order_conflict' }
      }
      if (input.blockedActions.length === 0) return { kind: 'freeze_refused', reason: 'blocked_actions_required' }
      const key = incidentScopeKey(input.scope)
      const epoch = (epochs.get(key) ?? 0) + 1
      const order = freezeOrder(input, epoch)
      epochs.set(key, epoch)
      freezes.set(order.freezeOrderId, order)
      return { kind: 'freeze_issued', order, epoch }
    },
    issueResume: async (input) => {
      const existing = resumes.get(input.resumeOrderId)
      if (existing !== undefined) {
        const same = canonicalAuthorityDigest(resumeMaterial(existing)) === canonicalAuthorityDigest(resumeMaterial(input))
        return same
          ? { kind: 'resume_issued', order: existing, epoch: existing.epoch }
          : { kind: 'resume_refused', reason: 'resume_order_conflict' }
      }
      const freeze = freezes.get(input.freezeOrderId)
      if (freeze === undefined) return { kind: 'resume_refused', reason: 'freeze_order_not_found' }
      if (freeze.status !== 'active') return { kind: 'resume_refused', reason: 'freeze_order_not_active' }
      if (new Set(input.approverIds).size < 2) return { kind: 'resume_refused', reason: 'independent_approval_required' }
      if (input.evidenceRefs.length === 0) return { kind: 'resume_refused', reason: 'resume_evidence_required' }
      const key = incidentScopeKey(freeze.scope)
      const epoch = (epochs.get(key) ?? freeze.epoch) + 1
      const order = Object.freeze({
        ...input,
        schemaVersion: 'incident-resume-order:v1' as const,
        approverIds: Object.freeze([...new Set(input.approverIds)].sort()),
        evidenceRefs: Object.freeze([...new Set(input.evidenceRefs)].sort()),
        epoch,
      })
      resumes.set(order.resumeOrderId, order)
      freezes.set(freeze.freezeOrderId, Object.freeze({ ...freeze, status: 'resumed', resumedByOrderId: order.resumeOrderId }))
      epochs.set(key, epoch)
      return { kind: 'resume_issued', order, epoch }
    },
  })
}

export function createAllowingIncidentEvaluator(): IncidentEvaluator {
  const allowedDigest = canonicalAuthorityDigest({ incidentEpochs: [] })
  return Object.freeze({
    evaluate: async () => ({ kind: 'allowed' as const, epochDigest: allowedDigest }),
  })
}

function freezeOrder(input: IssueFreezeInput, epoch: number): FreezeOrder {
  return Object.freeze({
    ...input,
    schemaVersion: 'incident-freeze-order:v1',
    scope: Object.freeze({ ...input.scope }),
    blockedActions: Object.freeze([...new Set(input.blockedActions)].sort()),
    epoch,
    status: 'active',
  })
}

function scopeMatches(selector: IncidentScope, candidate: IncidentScope): boolean {
  return Object.entries(selector).every(([field, value]) => Reflect.get(candidate, field) === value)
}

export function incidentScopeKey(scope: IncidentScope): string {
  return JSON.stringify(Object.fromEntries(Object.entries(scope).sort(([left], [right]) => left.localeCompare(right))))
}

export function incidentMatchingScopeKeys(scope: IncidentScope): readonly string[] {
  const entries = Object.entries(scope).filter((entry): entry is [string, string] => entry[1] !== undefined)
  const keys: string[] = []
  for (let mask = 0; mask < 2 ** entries.length; mask += 1) {
    const selector = Object.fromEntries(entries.filter((_entry, index) => (mask & (1 << index)) !== 0))
    keys.push(incidentScopeKey(selector))
  }
  return Object.freeze([...new Set(keys)].sort())
}

function parseScopeKey(key: string): IncidentScope {
  return JSON.parse(key) as IncidentScope
}

function freezeMaterial(order: IssueFreezeInput | FreezeOrder) {
  return {
    freezeOrderId: order.freezeOrderId, incidentId: order.incidentId, issuerId: order.issuerId,
    reason: order.reason, scope: order.scope, blockedActions: [...order.blockedActions].sort(), issuedAt: order.issuedAt,
  }
}

function resumeMaterial(order: IssueResumeInput | ResumeOrder) {
  return {
    resumeOrderId: order.resumeOrderId, freezeOrderId: order.freezeOrderId,
    approverIds: [...order.approverIds].sort(), evidenceRefs: [...order.evidenceRefs].sort(), issuedAt: order.issuedAt,
  }
}
