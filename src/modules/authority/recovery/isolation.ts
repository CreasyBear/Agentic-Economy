import type { AccountRef } from '../../principal-account/account/public'
import type { PrincipalRef } from '../../principal-account/principal/public'

export const ISOLATION_CASES = [
  'owner',
  'member',
  'workload',
  'missing_workload',
  'stranger',
  'wrong_account',
  'stale_generation',
] as const

export type IsolationCaseKind = typeof ISOLATION_CASES[number]

export type IsolationDecision =
  | Readonly<{ kind: 'allowed' }>
  | Readonly<{ kind: 'denied'; reason: string; externalState?: string }>

export type IsolationSurface = Readonly<{
  surfaceRef: string
  owningAccountRef: AccountRef
  resourceRef: string
}>

export type IsolationProbe = Readonly<{
  caseKind: IsolationCaseKind
  surfaceRef: string
  resourceRef: string
  actorPrincipalRef?: PrincipalRef
  owningAccountRef: AccountRef
  activeAccountRef: AccountRef
  presentedGeneration: number
  currentGeneration: number
}>

export type IsolationMatrixRow = IsolationProbe & Readonly<{
  decision: IsolationDecision
}>

export type IsolationMatrix = Readonly<{
  surfaceCount: number
  caseCount: number
  rows: readonly IsolationMatrixRow[]
}>

export type IsolationMatrixRequest = Readonly<{
  surfaces: readonly IsolationSurface[]
  actors: Readonly<{
    owner: PrincipalRef
    member: PrincipalRef
    stranger: PrincipalRef
    workload: PrincipalRef
  }>
  wrongAccountRef: AccountRef
  currentGeneration: number
  evaluate(probe: IsolationProbe): Promise<IsolationDecision>
}>

export type IsolationProofErrorCode =
  | 'isolation_account_context_invalid'
  | 'isolation_decision_invalid'
  | 'isolation_generation_invalid'
  | 'isolation_negative_case_allowed'
  | 'isolation_positive_case_denied'
  | 'isolation_surface_inventory_invalid'

export class IsolationProofError extends Error {
  readonly code: IsolationProofErrorCode

  constructor(code: IsolationProofErrorCode) {
    super(code)
    this.name = 'IsolationProofError'
    this.code = code
  }
}

export async function generateIsolationMatrix(request: IsolationMatrixRequest): Promise<IsolationMatrix> {
  assertInventory(request)
  const rows: IsolationMatrixRow[] = []
  for (const surface of request.surfaces) {
    for (const caseKind of ISOLATION_CASES) {
      const probe = probeFor(request, surface, caseKind)
      const decision = freezeDecision(await request.evaluate(probe))
      const positive = caseKind === 'owner' || caseKind === 'member' || caseKind === 'workload'
      if (positive && decision.kind !== 'allowed') {
        throw new IsolationProofError('isolation_positive_case_denied')
      }
      if (!positive && decision.kind !== 'denied') {
        throw new IsolationProofError('isolation_negative_case_allowed')
      }
      rows.push(Object.freeze({ ...probe, decision }))
    }
  }
  return Object.freeze({
    surfaceCount: request.surfaces.length,
    caseCount: rows.length,
    rows: Object.freeze(rows),
  })
}

function assertInventory(request: IsolationMatrixRequest): void {
  if (request.surfaces.length === 0
    || new Set(request.surfaces.map((surface) => surface.surfaceRef)).size !== request.surfaces.length
    || request.surfaces.some((surface) => surface.surfaceRef.length === 0 || surface.resourceRef.length === 0)) {
    throw new IsolationProofError('isolation_surface_inventory_invalid')
  }
  if (request.surfaces.some((surface) => surface.owningAccountRef === request.wrongAccountRef)) {
    throw new IsolationProofError('isolation_account_context_invalid')
  }
  if (!Number.isSafeInteger(request.currentGeneration) || request.currentGeneration < 1) {
    throw new IsolationProofError('isolation_generation_invalid')
  }
  if (new Set(Object.values(request.actors)).size !== 4) {
    throw new IsolationProofError('isolation_account_context_invalid')
  }
}

function probeFor(
  request: IsolationMatrixRequest,
  surface: IsolationSurface,
  caseKind: IsolationCaseKind,
): IsolationProbe {
  const actorPrincipalRef = caseKind === 'missing_workload'
    ? undefined
    : caseKind === 'member'
    ? request.actors.member
    : caseKind === 'workload'
      ? request.actors.workload
      : caseKind === 'stranger'
        ? request.actors.stranger
        : request.actors.owner
  return Object.freeze({
    caseKind,
    surfaceRef: surface.surfaceRef,
    resourceRef: surface.resourceRef,
    ...(actorPrincipalRef === undefined ? {} : { actorPrincipalRef }),
    owningAccountRef: surface.owningAccountRef,
    activeAccountRef: caseKind === 'wrong_account' ? request.wrongAccountRef : surface.owningAccountRef,
    presentedGeneration: caseKind === 'stale_generation'
      ? request.currentGeneration - 1
      : request.currentGeneration,
    currentGeneration: request.currentGeneration,
  })
}

function freezeDecision(decision: IsolationDecision): IsolationDecision {
  if (decision.kind !== 'allowed' && decision.kind !== 'denied') {
    throw new IsolationProofError('isolation_decision_invalid')
  }
  if (decision.kind === 'denied' && decision.reason.length === 0) {
    throw new IsolationProofError('isolation_decision_invalid')
  }
  return decision.kind === 'allowed'
    ? Object.freeze({ kind: 'allowed' })
    : Object.freeze({
        kind: 'denied',
        reason: decision.reason,
        ...(decision.externalState === undefined ? {} : { externalState: decision.externalState }),
      })
}
