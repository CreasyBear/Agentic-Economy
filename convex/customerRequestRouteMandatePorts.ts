import {
  type RouteMandate,
} from '@/modules/customer-request/route-mandate'
import type {
  AuthenticatedRequestResult,
  IssueEvidence,
  OpenCurrentRouteGenerationResult,
  PersistIssueInput,
  RouteMandateMutationPorts,
  ServiceAuthorization,
} from '@/modules/customer-request/route-mandate-mutation'

import type { MutationCtx, QueryCtx } from './_generated/server'
import { unlistedCustomerRequestTables } from './customerRequestUnlisted'

export type CustomerRequestServiceAssertion = ServiceAuthorization['assertion']

export type CurrentRouteMandateState =
  | { kind: 'active'; mandate: RouteMandate; networkId: string }
  | { kind: 'none' | 'not_found' }
  | { kind: 'revoked'; mandateRef: string; revocationRef: string }
  | { kind: 'superseded'; mandateRef: string; revocationRef?: string }
  | { kind: 'expired'; mandateRef: string }

export function routeMandateMutationPorts(
  _ctx: MutationCtx | QueryCtx,
): RouteMandateMutationPorts {
  return {
    now: () => Date.now(),
    authenticateOwnerForMutation: unlistedCustomerRequestTables,
    authenticateOwner: unlistedCustomerRequestTables,
    loadIssueCommand: unlistedCustomerRequestTables,
    verifyIssueCommandReplay: unlistedCustomerRequestTables,
    openCurrentRouteGeneration: unlistedCustomerRequestTables,
    routePlanGenerationGraphStatus: unlistedCustomerRequestTables,
    loadMandateHead: unlistedCustomerRequestTables,
    loadIssueByMandateRef: unlistedCustomerRequestTables,
    loadRevocationByMandateRef: unlistedCustomerRequestTables,
    assertReplacementIntegrity: unlistedCustomerRequestTables,
    persistIssue: unlistedCustomerRequestTables,
    loadRevocationCommand: unlistedCustomerRequestTables,
    verifyRevocationCommandReplay: unlistedCustomerRequestTables,
    assertHeadMatchesIssue: unlistedCustomerRequestTables,
    commitCustomerRevocation: unlistedCustomerRequestTables,
    loadHistory: unlistedCustomerRequestTables,
  }
}

export async function persistRouteMandateIssue(
  _ctx: MutationCtx,
  ..._rest: unknown[]
): Promise<{ kind: 'issued'; mandate: ReturnType<typeof writableMandate> } | { kind: 'active_mandate_exists' }> {
  return unlistedCustomerRequestTables()
}

export async function authenticateRequestOwnerForMutation(
  _ctx: MutationCtx,
  ..._rest: unknown[]
): Promise<AuthenticatedRequestResult> {
  return unlistedCustomerRequestTables()
}

export async function authenticateRequestOwnerForServiceOperation(
  _ctx: MutationCtx,
  ..._rest: unknown[]
): Promise<AuthenticatedRequestResult> {
  return unlistedCustomerRequestTables()
}

export async function authenticateRequestOwner(
  _ctx: MutationCtx | QueryCtx,
  ..._rest: unknown[]
): Promise<AuthenticatedRequestResult> {
  return unlistedCustomerRequestTables()
}

export async function readCurrentRouteMandateState(
  _ctx: MutationCtx | QueryCtx,
  ..._rest: unknown[]
): Promise<CurrentRouteMandateState> {
  return unlistedCustomerRequestTables()
}

export async function readCurrentRouteMandateStateForPrincipal(
  _ctx: MutationCtx | QueryCtx,
  ..._rest: unknown[]
): Promise<CurrentRouteMandateState> {
  return unlistedCustomerRequestTables()
}

export async function openCurrentRouteGeneration(
  _ctx: MutationCtx | QueryCtx,
  ..._rest: unknown[]
): Promise<OpenCurrentRouteGenerationResult> {
  return unlistedCustomerRequestTables()
}

export function writableMandate(value: RouteMandate) {
  return {
    ...value,
    principal: { ...value.principal },
    authorization: { ...value.authorization },
    request: { ...value.request },
    route: {
      ...value.route,
      steps: value.route.steps.map((step) => ({
        ...step,
        contractRef: { ...step.contractRef },
        price: { ...step.price },
        dataScope: step.dataScope.map((scope: RouteMandate['route']['steps'][number]['dataScope'][number]) => ({
          ...scope,
          recipient: { ...scope.recipient },
          purposes: [...scope.purposes],
        })),
        effects: step.effects.map((effect) => ({ ...effect })),
        evidence: step.evidence.map((evidence) => ({ ...evidence })),
        cancellation: { ...step.cancellation, evidenceRefs: [...step.cancellation.evidenceRefs] },
        recovery: { ...step.recovery },
      })),
      maximumTotalSpend: { ...value.route.maximumTotalSpend },
      fallback: {
        ...value.route.fallback,
        alternatives: value.route.fallback.alternatives.map((alternative) => ({ ...alternative })),
      },
    },
  }
}

void (null as unknown as PersistIssueInput)
void (null as unknown as IssueEvidence)
