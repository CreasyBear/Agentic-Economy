import type { Doc } from '../../../_generated/dataModel'
import { beginLeaseEffectHandler } from '../../capabilitySupply/providerConnections/leases'

const OPAQUE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u
const DIGEST = /^sha256:[0-9a-f]{64}$/u
const SECRET_REF = /^sec_[0-9a-f]{32}$/u
export const SECRET_GENERATION = /^sgn_[0-9a-f]{32}$/u
const MAX_TICKET_LIFETIME_MS = 30_000
const MIN_TICKET_LIFETIME_MS = 500

export type IssueArgs = {
  ticketRef: string
  commandId: string
  journalTokenDigest: string
  requestDigest: string
  invocationDigest: string
  operationKeyDigest: string
  callRef: string
  toolRef: string
  attemptRef: string
  effectGeneration: number
  leaseRef: string
  providerRef: string
  adapterId: string
  authorityDigest: string
  grantedScopes: string[]
  grantedResources: string[]
  readinessValidUntil: number
  readinessDigest?: string
  signingSecretRef: string
  paymentSecretRef?: string
  requestedExpiresAt: number
}

export type CanonicalTicket = {
  version: 'provider-consequence:v1'
  ticketRef: string
  effectRef: string
  requestDigest: string
  invocationDigest: string
  issuedAt: number
  expiresAt: number
  callRef: string
  toolRef: string
  leaseRef: string
  connectionRef: string
  authorityGeneration: number
  providerRef: string
  adapterId: string
  authorityDigest: string
  grantedScopes: string[]
  grantedResources: string[]
  readinessValidUntil: number
  readinessDigest?: string
  owningAccountRef: string
  activeAccountRef: string
  actorPrincipalRef: string
  grantRef: string
  grantGeneration: number
  secret: { secretRef: string; activeGeneration: string; pointerRevision: number }
  paymentSecret?: { secretRef: string; activeGeneration: string; pointerRevision: number }
}

export function unavailable(reason: string) {
  return { kind: 'unavailable' as const, reason }
}

export function exactStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}


export function ticketFromRow(row: Doc<'providerConsequenceJournal'>): CanonicalTicket {
  return {
    version: 'provider-consequence:v1',
    ticketRef: row.ticketRef,
    effectRef: row.effectRef,
    requestDigest: row.requestDigest,
    invocationDigest: row.invocationDigest,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    callRef: row.callRef,
    toolRef: row.toolRef,
    leaseRef: row.leaseRef,
    connectionRef: row.connectionRef,
    authorityGeneration: row.authorityGeneration,
    providerRef: row.providerRef,
    adapterId: row.adapterId,
    authorityDigest: row.authorityDigest,
    grantedScopes: [...row.grantedScopes],
    grantedResources: [...row.grantedResources],
    readinessValidUntil: row.readinessValidUntil,
    ...(row.readinessDigest === undefined ? {} : { readinessDigest: row.readinessDigest }),
    owningAccountRef: row.owningAccountRef,
    activeAccountRef: row.activeAccountRef,
    actorPrincipalRef: row.actorPrincipalRef,
    grantRef: row.grantRef,
    grantGeneration: row.grantGeneration,
    secret: {
      secretRef: row.secretRef,
      activeGeneration: row.secretGeneration,
      pointerRevision: row.secretPointerRevision,
    },
    ...(row.paymentSecretRef === undefined
      || row.paymentSecretGeneration === undefined
      || row.paymentSecretPointerRevision === undefined
      ? {}
      : { paymentSecret: {
          secretRef: row.paymentSecretRef,
          activeGeneration: row.paymentSecretGeneration,
          pointerRevision: row.paymentSecretPointerRevision,
        } }),
  }
}

export function matchesIssueIdentity(row: Doc<'providerConsequenceJournal'>, args: IssueArgs): boolean {
  return row.commandId === args.commandId
    && row.requestDigest === args.requestDigest
    && row.invocationDigest === args.invocationDigest
    && row.operationKeyDigest === args.operationKeyDigest
    && row.callRef === args.callRef
    && row.toolRef === args.toolRef
    && row.attemptRef === args.attemptRef
    && row.effectGeneration === args.effectGeneration
    && row.leaseRef === args.leaseRef
    && row.providerRef === args.providerRef
    && row.adapterId === args.adapterId
    && row.authorityDigest === args.authorityDigest
    && exactStrings(row.grantedScopes, args.grantedScopes)
    && exactStrings(row.grantedResources, args.grantedResources)
    && row.readinessValidUntil === args.readinessValidUntil
    && row.readinessDigest === args.readinessDigest
    && row.signingSecretRef === args.signingSecretRef
    && row.paymentSecretRef === args.paymentSecretRef
}

export function matchesExistingEffect(
  row: Doc<'providerConsequenceJournal'>,
  args: IssueArgs,
  admission: Extract<Awaited<ReturnType<typeof beginLeaseEffectHandler>>, { kind: 'admitted' }>,
  customerPointer: Doc<'secretPointers'>,
  signingPointer: Doc<'secretPointers'>,
  paymentPointer: Doc<'secretPointers'> | null,
): boolean {
  return row.commandId === args.commandId
    && row.requestDigest === args.requestDigest
    && row.invocationDigest === args.invocationDigest
    && row.operationKeyDigest === args.operationKeyDigest
    && row.callRef === args.callRef
    && row.toolRef === args.toolRef
    && row.attemptRef === args.attemptRef
    && row.effectGeneration === args.effectGeneration
    && row.leaseRef === args.leaseRef
    && row.connectionRef === admission.connectionRef
    && row.authorityGeneration === admission.authorityGeneration
    && row.providerRef === args.providerRef
    && row.adapterId === args.adapterId
    && row.authorityDigest === args.authorityDigest
    && exactStrings(row.grantedScopes, args.grantedScopes)
    && exactStrings(row.grantedResources, args.grantedResources)
    && row.readinessValidUntil === args.readinessValidUntil
    && row.readinessDigest === args.readinessDigest
    && row.owningAccountRef === admission.owningAccountRef
    && row.activeAccountRef === admission.activeAccountRef
    && row.actorPrincipalRef === admission.actorPrincipalRef
    && row.grantRef === admission.grantRef
    && row.grantGeneration === admission.grantGeneration
    && row.secretRef === customerPointer.secretRef
    && row.secretGeneration === customerPointer.activeGeneration
    && row.secretPointerRevision === customerPointer.revision
    && row.signingSecretRef === signingPointer.secretRef
    && row.signingSecretGeneration === signingPointer.activeGeneration
    && row.signingSecretPointerRevision === signingPointer.revision
    && row.signingAccountRef === signingPointer.owningAccountRef
    && row.paymentSecretRef === paymentPointer?.secretRef
    && row.paymentSecretGeneration === paymentPointer?.activeGeneration
    && row.paymentSecretPointerRevision === paymentPointer?.revision
    && row.paymentAccountRef === paymentPointer?.owningAccountRef
}

export function canonicalIssueInput(args: IssueArgs): boolean {
  return OPAQUE_REF.test(args.ticketRef)
    && OPAQUE_REF.test(args.commandId)
    && DIGEST.test(args.journalTokenDigest)
    && DIGEST.test(args.requestDigest)
    && DIGEST.test(args.invocationDigest)
    && DIGEST.test(args.operationKeyDigest)
    && OPAQUE_REF.test(args.callRef)
    && OPAQUE_REF.test(args.toolRef)
    && OPAQUE_REF.test(args.attemptRef)
    && Number.isSafeInteger(args.effectGeneration)
    && args.effectGeneration >= 1
    && OPAQUE_REF.test(args.leaseRef)
    && OPAQUE_REF.test(args.providerRef)
    && OPAQUE_REF.test(args.adapterId)
    && DIGEST.test(args.authorityDigest)
    && args.grantedScopes.length > 0
    && args.grantedScopes.every((value) => OPAQUE_REF.test(value))
    && args.grantedResources.length > 0
    && args.grantedResources.every((value) => OPAQUE_REF.test(value))
    && Number.isSafeInteger(args.readinessValidUntil)
    && (args.readinessDigest === undefined || DIGEST.test(args.readinessDigest))
    && SECRET_REF.test(args.signingSecretRef)
    && (args.adapterId === 'x402-fetch:v2'
      ? args.paymentSecretRef !== undefined && SECRET_REF.test(args.paymentSecretRef)
      : args.paymentSecretRef === undefined)
    && Number.isSafeInteger(args.requestedExpiresAt)
}
