import { internalMutationGeneric, internalQueryGeneric } from 'convex/server'
import { v } from 'convex/values'

import { parseRouteTransportObservationJson } from '@/modules/capability-supply/route-transport-runtime'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import { stableStringify, type StableHashValue } from '@/modules/common/stable-hash'
import { beginLeaseEffectHandler } from './capabilityProviderConnectionLeases'
import type { Doc } from './_generated/dataModel'
import type { MutationCtx, QueryCtx } from './_generated/server'

const OPAQUE_REF = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u
const DIGEST = /^sha256:[0-9a-f]{64}$/u
const SECRET_REF = /^sec_[0-9a-f]{32}$/u
const SECRET_GENERATION = /^sgn_[0-9a-f]{32}$/u
const MAX_TICKET_LIFETIME_MS = 30_000
const MIN_TICKET_LIFETIME_MS = 500

const ticketValue = v.object({
  version: v.literal('provider-consequence:v1'),
  ticketRef: v.string(),
  effectRef: v.string(),
  requestDigest: v.string(),
  invocationDigest: v.string(),
  issuedAt: v.number(),
  expiresAt: v.number(),
  invocationRef: v.string(),
  operationRef: v.string(),
  leaseRef: v.string(),
  canonicalLeaseRef: v.string(),
  canonicalConnectionRef: v.string(),
  canonicalConnectionGeneration: v.number(),
  providerRef: v.string(),
  adapterId: v.string(),
  authorityDigest: v.string(),
  grantedScopes: v.array(v.string()),
  grantedResources: v.array(v.string()),
  readinessValidUntil: v.number(),
  readinessDigest: v.optional(v.string()),
  owningAccountRef: v.string(),
  activeAccountRef: v.string(),
  actorPrincipalRef: v.string(),
  grantRef: v.string(),
  grantGeneration: v.number(),
  secret: v.object({
    secretRef: v.string(),
    activeGeneration: v.string(),
    pointerRevision: v.number(),
  }),
})

const signingSecretValue = v.object({
  secretRef: v.string(),
  activeGeneration: v.string(),
  pointerRevision: v.number(),
})

export const issueProviderConsequenceTicketArgs = {
  ticketRef: v.string(),
  commandId: v.string(),
  journalTokenDigest: v.string(),
  requestDigest: v.string(),
  invocationDigest: v.string(),
  operationKeyDigest: v.string(),
  invocationRef: v.string(),
  operationRef: v.string(),
  attemptRef: v.string(),
  effectGeneration: v.number(),
  leaseRef: v.string(),
  providerRef: v.string(),
  adapterId: v.string(),
  authorityDigest: v.string(),
  grantedScopes: v.array(v.string()),
  grantedResources: v.array(v.string()),
  readinessValidUntil: v.number(),
  readinessDigest: v.optional(v.string()),
  signingSecretRef: v.string(),
  requestedExpiresAt: v.number(),
} as const

export const issueProviderConsequenceTicketResult = v.union(
  v.object({
    kind: v.literal('issued'),
    ticket: ticketValue,
    ticketClaimsDigest: v.string(),
    signingSecret: signingSecretValue,
  }),
  v.object({ kind: v.literal('started'), ticketRef: v.string() }),
  v.object({ kind: v.literal('completed'), ticketRef: v.string(), observationJson: v.string() }),
  v.object({ kind: v.literal('unavailable'), reason: v.string() }),
)

type IssueArgs = {
  ticketRef: string
  commandId: string
  journalTokenDigest: string
  requestDigest: string
  invocationDigest: string
  operationKeyDigest: string
  invocationRef: string
  operationRef: string
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
  requestedExpiresAt: number
}

type CanonicalTicket = {
  version: 'provider-consequence:v1'
  ticketRef: string
  effectRef: string
  requestDigest: string
  invocationDigest: string
  issuedAt: number
  expiresAt: number
  invocationRef: string
  operationRef: string
  leaseRef: string
  canonicalLeaseRef: string
  canonicalConnectionRef: string
  canonicalConnectionGeneration: number
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
}

function unavailable(reason: string) {
  return { kind: 'unavailable' as const, reason }
}

function exactStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function ticketClaimsDigest(ticket: CanonicalTicket): string {
  return canonicalDigest({
    kind: 'provider-consequence-ticket-claims:v1',
    ticket: {
      ...ticket,
      grantedScopes: [...ticket.grantedScopes],
      grantedResources: [...ticket.grantedResources],
      secret: { ...ticket.secret },
    },
  } as StableHashValue)
}

function ticketFromRow(row: Doc<'providerConsequenceJournal'>): CanonicalTicket {
  return {
    version: 'provider-consequence:v1',
    ticketRef: row.ticketRef,
    effectRef: row.effectRef,
    requestDigest: row.requestDigest,
    invocationDigest: row.invocationDigest,
    issuedAt: row.issuedAt,
    expiresAt: row.expiresAt,
    invocationRef: row.invocationRef,
    operationRef: row.operationRef,
    leaseRef: row.leaseRef,
    canonicalLeaseRef: row.canonicalLeaseRef,
    canonicalConnectionRef: row.canonicalConnectionRef,
    canonicalConnectionGeneration: row.canonicalConnectionGeneration,
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
  }
}

function matchesIssueIdentity(row: Doc<'providerConsequenceJournal'>, args: IssueArgs): boolean {
  return row.commandId === args.commandId
    && row.requestDigest === args.requestDigest
    && row.invocationDigest === args.invocationDigest
    && row.operationKeyDigest === args.operationKeyDigest
    && row.invocationRef === args.invocationRef
    && row.operationRef === args.operationRef
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
}

function matchesExistingEffect(
  row: Doc<'providerConsequenceJournal'>,
  args: IssueArgs,
  admission: Extract<Awaited<ReturnType<typeof beginLeaseEffectHandler>>, { kind: 'admitted' }>,
  customerPointer: Doc<'secretPointers'>,
  signingPointer: Doc<'secretPointers'>,
): boolean {
  return row.commandId === args.commandId
    && row.requestDigest === args.requestDigest
    && row.invocationDigest === args.invocationDigest
    && row.operationKeyDigest === args.operationKeyDigest
    && row.invocationRef === args.invocationRef
    && row.operationRef === args.operationRef
    && row.attemptRef === args.attemptRef
    && row.effectGeneration === args.effectGeneration
    && row.leaseRef === args.leaseRef
    && row.canonicalLeaseRef === admission.canonicalLeaseRef
    && row.canonicalConnectionRef === admission.canonicalConnectionRef
    && row.canonicalConnectionGeneration === admission.canonicalConnectionGeneration
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
}

function canonicalIssueInput(args: IssueArgs): boolean {
  return OPAQUE_REF.test(args.ticketRef)
    && OPAQUE_REF.test(args.commandId)
    && DIGEST.test(args.journalTokenDigest)
    && DIGEST.test(args.requestDigest)
    && DIGEST.test(args.invocationDigest)
    && DIGEST.test(args.operationKeyDigest)
    && OPAQUE_REF.test(args.invocationRef)
    && OPAQUE_REF.test(args.operationRef)
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
    && Number.isSafeInteger(args.requestedExpiresAt)
}

export async function issueProviderConsequenceTicketHandler(
  ctx: MutationCtx,
  args: IssueArgs,
  beginEffect: typeof beginLeaseEffectHandler = beginLeaseEffectHandler,
) {
  const now = Date.now()
  if (!canonicalIssueInput(args)) return unavailable('ticket_input_invalid')
  const prior = await ctx.db.query('providerConsequenceJournal')
    .withIndex('by_commandId', (query) => query.eq('commandId', args.commandId)).order('desc').first()
  if (prior !== null && prior.state === 'pending' && prior.expiresAt <= now) {
    await ctx.db.patch(prior._id, { state: 'aborted', abortedAt: now, updatedAt: now })
  } else if (prior !== null && prior.state !== 'aborted') {
    if (!matchesIssueIdentity(prior, args)) return unavailable('effect_journal_identity_mismatch')
    if (prior.state === 'started') return { kind: 'started' as const, ticketRef: prior.ticketRef }
    if (prior.state === 'completed' && prior.observationJson !== undefined) {
      return { kind: 'completed' as const, ticketRef: prior.ticketRef, observationJson: prior.observationJson }
    }
    if (prior.state === 'pending'
      && prior.ticketRef === args.ticketRef
      && prior.journalTokenDigest === args.journalTokenDigest) {
      return {
        kind: 'issued' as const,
        ticket: ticketFromRow(prior),
        ticketClaimsDigest: prior.ticketClaimsDigest,
        signingSecret: {
          secretRef: prior.signingSecretRef,
          activeGeneration: prior.signingSecretGeneration,
          pointerRevision: prior.signingSecretPointerRevision,
        },
      }
    }
    return unavailable('effect_journal_unavailable')
  }
  const [lease, invocation, signingPointer] = await Promise.all([
    ctx.db.query('capabilityProviderConnectionLeases')
      .withIndex('by_leaseRef', (query) => query.eq('leaseRef', args.leaseRef)).unique(),
    ctx.db.query('capabilityOperationInvocations')
      .withIndex('by_invocationRef', (query) => query.eq('invocationRef', args.invocationRef)).unique(),
    ctx.db.query('secretPointers')
      .withIndex('by_secretRef', (query) => query.eq('secretRef', args.signingSecretRef)).unique(),
  ])
  if (lease === null
    || lease.state !== 'active'
    || lease.invocationRef !== args.invocationRef
    || lease.operationRef !== args.operationRef
    || lease.providerRef !== args.providerRef
    || lease.adapterId !== args.adapterId
    || lease.authorityDigest !== args.authorityDigest
    || !exactStrings(lease.grantedScopes, args.grantedScopes)
    || !exactStrings(lease.grantedResources, args.grantedResources)
    || lease.readinessValidUntil !== args.readinessValidUntil
    || lease.readinessDigest !== args.readinessDigest
    || lease.expiresAt <= now) return unavailable('lease_authority_unavailable')
  if (invocation === null
    || invocation.operationRef !== args.operationRef
    || invocation.grantRef !== lease.grantRef
    || invocation.grantGeneration !== lease.grantGeneration
    || invocation.principalId !== lease.actorPrincipalRef
    || invocation.grantExpiresAt <= now
    || invocation.attemptRef !== args.attemptRef) {
    return unavailable('invocation_authority_unavailable')
  }
  const connection = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', lease.connectionRef)).unique()
  if (connection === null
    || connection.lifecycle !== 'active'
    || connection.providerRef !== args.providerRef
    || connection.adapterId !== args.adapterId
    || connection.authorityDigest !== args.authorityDigest
    || connection.canonicalConnectionRef === undefined
    || connection.canonicalConnectionGeneration === undefined
    || connection.secretRef === undefined
    || connection.expiresAt !== undefined && connection.expiresAt <= now) {
    return unavailable('connection_authority_unavailable')
  }
  const customerPointer = await ctx.db.query('secretPointers')
    .withIndex('by_secretRef', (query) => query.eq('secretRef', connection.secretRef as string)).unique()
  if (customerPointer === null
    || signingPointer === null
    || customerPointer.owningAccountRef !== lease.owningAccountRef
    || signingPointer.owningAccountRef === customerPointer.owningAccountRef
    || signingPointer.secretRef === customerPointer.secretRef
    || !SECRET_GENERATION.test(customerPointer.activeGeneration)
    || !SECRET_GENERATION.test(signingPointer.activeGeneration)
    || !Number.isSafeInteger(customerPointer.revision)
    || !Number.isSafeInteger(signingPointer.revision)
    || customerPointer.revision < 1
    || signingPointer.revision < 1) return unavailable('secret_pointer_unavailable')
  const expiresAt = Math.min(
    args.requestedExpiresAt,
    now + MAX_TICKET_LIFETIME_MS,
    lease.expiresAt,
    lease.readinessValidUntil,
    invocation.grantExpiresAt,
  )
  if (expiresAt - now < MIN_TICKET_LIFETIME_MS) return unavailable('ticket_lifetime_unavailable')

  const admission = await beginEffect(ctx, {
    leaseRef: args.leaseRef,
    invocationRef: args.invocationRef,
    operationRef: args.operationRef,
    commandId: args.commandId,
  })
  if (admission.kind !== 'admitted'
    || admission.owningAccountRef !== customerPointer.owningAccountRef
    || admission.activeAccountRef !== admission.owningAccountRef
    || admission.canonicalConnectionRef !== connection.canonicalConnectionRef
    || admission.canonicalConnectionGeneration !== connection.canonicalConnectionGeneration
    || admission.secretRef !== customerPointer.secretRef) {
    throw new Error('provider_consequence_effect_admission_failed')
  }

  const current = await ctx.db.query('providerConsequenceJournal')
    .withIndex('by_effectRef', (query) => query.eq('effectRef', admission.effectRef)).order('desc').first()
  if (current !== null && current.state === 'pending' && current.expiresAt <= now) {
    await ctx.db.patch(current._id, { state: 'aborted', abortedAt: now, updatedAt: now })
  } else if (current !== null) {
    if (!matchesExistingEffect(current, args, admission, customerPointer, signingPointer)) {
      return unavailable('effect_journal_identity_mismatch')
    }
    if (current.state === 'started') return { kind: 'started' as const, ticketRef: current.ticketRef }
    if (current.state === 'completed' && current.observationJson !== undefined) {
      return { kind: 'completed' as const, ticketRef: current.ticketRef, observationJson: current.observationJson }
    }
    if (current.state === 'pending'
      && current.ticketRef === args.ticketRef
      && current.journalTokenDigest === args.journalTokenDigest) {
      return {
        kind: 'issued' as const,
        ticket: ticketFromRow(current),
        ticketClaimsDigest: current.ticketClaimsDigest,
        signingSecret: {
          secretRef: current.signingSecretRef,
          activeGeneration: current.signingSecretGeneration,
          pointerRevision: current.signingSecretPointerRevision,
        },
      }
    }
    if (current.state !== 'aborted') return unavailable('effect_journal_unavailable')
  }
  if (await ctx.db.query('providerConsequenceJournal')
    .withIndex('by_ticketRef', (query) => query.eq('ticketRef', args.ticketRef)).unique() !== null) {
    return unavailable('ticket_identity_conflict')
  }

  const ticket: CanonicalTicket = {
    version: 'provider-consequence:v1',
    ticketRef: args.ticketRef,
    effectRef: admission.effectRef,
    requestDigest: args.requestDigest,
    invocationDigest: args.invocationDigest,
    issuedAt: now,
    expiresAt,
    invocationRef: args.invocationRef,
    operationRef: args.operationRef,
    leaseRef: args.leaseRef,
    canonicalLeaseRef: admission.canonicalLeaseRef,
    canonicalConnectionRef: admission.canonicalConnectionRef,
    canonicalConnectionGeneration: admission.canonicalConnectionGeneration,
    providerRef: args.providerRef,
    adapterId: args.adapterId,
    authorityDigest: args.authorityDigest,
    grantedScopes: [...args.grantedScopes],
    grantedResources: [...args.grantedResources],
    readinessValidUntil: args.readinessValidUntil,
    ...(args.readinessDigest === undefined ? {} : { readinessDigest: args.readinessDigest }),
    owningAccountRef: admission.owningAccountRef,
    activeAccountRef: admission.activeAccountRef,
    actorPrincipalRef: admission.actorPrincipalRef,
    grantRef: admission.grantRef,
    grantGeneration: admission.grantGeneration,
    secret: {
      secretRef: customerPointer.secretRef,
      activeGeneration: customerPointer.activeGeneration,
      pointerRevision: customerPointer.revision,
    },
  }
  const claimsDigest = ticketClaimsDigest(ticket)
  await ctx.db.insert('providerConsequenceJournal', {
    ticketRef: ticket.ticketRef,
    effectRef: ticket.effectRef,
    commandId: args.commandId,
    state: 'pending',
    journalTokenDigest: args.journalTokenDigest,
    requestDigest: ticket.requestDigest,
    invocationDigest: ticket.invocationDigest,
    operationKeyDigest: args.operationKeyDigest,
    ticketClaimsDigest: claimsDigest,
    invocationRef: ticket.invocationRef,
    operationRef: ticket.operationRef,
    attemptRef: args.attemptRef,
    effectGeneration: args.effectGeneration,
    leaseRef: ticket.leaseRef,
    canonicalLeaseRef: ticket.canonicalLeaseRef,
    canonicalConnectionRef: ticket.canonicalConnectionRef,
    canonicalConnectionGeneration: ticket.canonicalConnectionGeneration,
    providerRef: ticket.providerRef,
    adapterId: ticket.adapterId,
    authorityDigest: ticket.authorityDigest,
    grantedScopes: [...ticket.grantedScopes],
    grantedResources: [...ticket.grantedResources],
    readinessValidUntil: ticket.readinessValidUntil,
    ...(ticket.readinessDigest === undefined ? {} : { readinessDigest: ticket.readinessDigest }),
    owningAccountRef: ticket.owningAccountRef,
    activeAccountRef: ticket.activeAccountRef,
    actorPrincipalRef: ticket.actorPrincipalRef,
    grantRef: ticket.grantRef,
    grantGeneration: ticket.grantGeneration,
    secretRef: ticket.secret.secretRef,
    secretGeneration: ticket.secret.activeGeneration,
    secretPointerRevision: ticket.secret.pointerRevision,
    signingSecretRef: signingPointer.secretRef,
    signingSecretGeneration: signingPointer.activeGeneration,
    signingSecretPointerRevision: signingPointer.revision,
    signingAccountRef: signingPointer.owningAccountRef,
    issuedAt: ticket.issuedAt,
    expiresAt: ticket.expiresAt,
    updatedAt: now,
  })
  return {
    kind: 'issued' as const,
    ticket,
    ticketClaimsDigest: claimsDigest,
    signingSecret: {
      secretRef: signingPointer.secretRef,
      activeGeneration: signingPointer.activeGeneration,
      pointerRevision: signingPointer.revision,
    },
  }
}

export const issueProviderConsequenceTicket = internalMutationGeneric({
  args: issueProviderConsequenceTicketArgs,
  returns: issueProviderConsequenceTicketResult,
  handler: issueProviderConsequenceTicketHandler,
})

export const attestProviderConsequenceTicketArgs = {
  ticketRef: v.string(),
  journalTokenDigest: v.string(),
  ticketClaimsDigest: v.string(),
  expiresAt: v.number(),
} as const

export async function attestProviderConsequenceTicketHandler(
  ctx: QueryCtx,
  args: Readonly<{
    ticketRef: string
    journalTokenDigest: string
    ticketClaimsDigest: string
    expiresAt: number
  }>,
) {
  const row = await ctx.db.query('providerConsequenceJournal')
    .withIndex('by_ticketRef', (query) => query.eq('ticketRef', args.ticketRef)).unique()
  return row !== null
    && row.state === 'pending'
    && row.journalTokenDigest === args.journalTokenDigest
    && row.ticketClaimsDigest === args.ticketClaimsDigest
    && row.expiresAt === args.expiresAt
    && row.expiresAt > Date.now()
    ? { kind: 'attested' as const }
    : { kind: 'unavailable' as const }
}

export const attestProviderConsequenceTicket = internalQueryGeneric({
  args: attestProviderConsequenceTicketArgs,
  returns: v.union(
    v.object({ kind: v.literal('attested') }),
    v.object({ kind: v.literal('unavailable') }),
  ),
  handler: attestProviderConsequenceTicketHandler,
})

export const claimProviderConsequenceArgs = {
  ticketRef: v.string(),
  journalTokenDigest: v.string(),
  effectRef: v.string(),
  requestDigest: v.string(),
  invocationDigest: v.string(),
  ticketClaimsDigest: v.string(),
  expiresAt: v.number(),
} as const

export const claimProviderConsequenceResult = v.union(
  v.object({ kind: v.literal('claimed'), claimRef: v.string() }),
  v.object({ kind: v.literal('completed'), observation: v.any() }),
  v.object({ kind: v.literal('started') }),
  v.object({ kind: v.literal('unavailable') }),
)

type ClaimArgs = {
  ticketRef: string
  journalTokenDigest: string
  effectRef: string
  requestDigest: string
  invocationDigest: string
  ticketClaimsDigest: string
  expiresAt: number
}

export async function claimProviderConsequenceHandler(ctx: MutationCtx, args: ClaimArgs) {
  const row = await ctx.db.query('providerConsequenceJournal')
    .withIndex('by_ticketRef', (query) => query.eq('ticketRef', args.ticketRef)).unique()
  if (row === null) return { kind: 'unavailable' as const }
  if (row.journalTokenDigest !== args.journalTokenDigest
    || row.effectRef !== args.effectRef
    || row.requestDigest !== args.requestDigest
    || row.invocationDigest !== args.invocationDigest
    || row.ticketClaimsDigest !== args.ticketClaimsDigest
    || row.expiresAt !== args.expiresAt) return { kind: 'unavailable' as const }
  if (row.state === 'completed') {
    if (row.observationJson === undefined) return { kind: 'unavailable' as const }
    const observation = parseRouteTransportObservationJson(row.observationJson)
    return observation === undefined
      ? { kind: 'unavailable' as const }
      : { kind: 'completed' as const, observation }
  }
  if (row.state === 'started') return { kind: 'started' as const }
  if (row.state === 'aborted') return { kind: 'unavailable' as const }
  const now = Date.now()
  if (row.expiresAt <= now) {
    await ctx.db.patch(row._id, { state: 'aborted', abortedAt: now, updatedAt: now })
    return { kind: 'unavailable' as const }
  }
  const claimRef = `provider-claim:${row.ticketRef}`
  await ctx.db.patch(row._id, { state: 'started', claimRef, startedAt: now, updatedAt: now })
  return { kind: 'claimed' as const, claimRef }
}

export const claimProviderConsequence = internalMutationGeneric({
  args: claimProviderConsequenceArgs,
  returns: claimProviderConsequenceResult,
  handler: claimProviderConsequenceHandler,
})

export const completeProviderConsequenceArgs = {
  ticketRef: v.string(),
  journalTokenDigest: v.string(),
  claimRef: v.string(),
  observationJson: v.string(),
} as const

export async function completeProviderConsequenceHandler(
  ctx: MutationCtx,
  args: { ticketRef: string; journalTokenDigest: string; claimRef: string; observationJson: string },
) {
  const row = await ctx.db.query('providerConsequenceJournal')
    .withIndex('by_ticketRef', (query) => query.eq('ticketRef', args.ticketRef)).unique()
  if (row === null
    || row.journalTokenDigest !== args.journalTokenDigest
    || row.claimRef !== args.claimRef) return { kind: 'unavailable' as const }
  const observation = parseRouteTransportObservationJson(args.observationJson)
  if (observation === undefined || observation.requestDigest !== row.requestDigest) {
    return { kind: 'unavailable' as const }
  }
  const observationJson = stableStringify(observation as StableHashValue)
  const observationDigest = canonicalDigest(observation as StableHashValue)
  if (row.state === 'completed') {
    return row.observationDigest === observationDigest && row.observationJson === observationJson
      ? { kind: 'completed' as const }
      : { kind: 'unavailable' as const }
  }
  if (row.state !== 'started') return { kind: 'unavailable' as const }
  const now = Date.now()
  await ctx.db.patch(row._id, {
    state: 'completed', observationJson, observationDigest, completedAt: now, updatedAt: now,
  })
  return { kind: 'completed' as const }
}

export const completeProviderConsequence = internalMutationGeneric({
  args: completeProviderConsequenceArgs,
  returns: v.union(v.object({ kind: v.literal('completed') }), v.object({ kind: v.literal('unavailable') })),
  handler: completeProviderConsequenceHandler,
})

export const abortProviderConsequenceArgs = {
  ticketRef: v.string(),
  journalTokenDigest: v.string(),
  claimRef: v.string(),
} as const

export async function abortProviderConsequenceHandler(
  ctx: MutationCtx,
  args: { ticketRef: string; journalTokenDigest: string; claimRef: string },
) {
  const row = await ctx.db.query('providerConsequenceJournal')
    .withIndex('by_ticketRef', (query) => query.eq('ticketRef', args.ticketRef)).unique()
  if (row === null
    || row.journalTokenDigest !== args.journalTokenDigest
    || row.claimRef !== args.claimRef) return { kind: 'unavailable' as const }
  if (row.state === 'aborted') return { kind: 'aborted' as const }
  if (row.state !== 'started') return { kind: 'unavailable' as const }
  const now = Date.now()
  await ctx.db.patch(row._id, { state: 'aborted', abortedAt: now, updatedAt: now })
  return { kind: 'aborted' as const }
}

export const abortProviderConsequence = internalMutationGeneric({
  args: abortProviderConsequenceArgs,
  returns: v.union(v.object({ kind: v.literal('aborted') }), v.object({ kind: v.literal('unavailable') })),
  handler: abortProviderConsequenceHandler,
})

const providerConsequenceX402Operation = v.union(
  v.literal('reserve_external_spend'),
  v.literal('prepare_authorization'),
  v.literal('read_authorization'),
  v.literal('read_authorization_by_digest'),
  v.literal('record_signature_digest'),
  v.literal('mark_possibly_submitted'),
  v.literal('observe_attempt'),
)

type X402Operation =
  | 'reserve_external_spend'
  | 'prepare_authorization'
  | 'read_authorization'
  | 'read_authorization_by_digest'
  | 'record_signature_digest'
  | 'mark_possibly_submitted'
  | 'observe_attempt'

export const authorizeProviderConsequenceX402RpcArgs = {
  ticketRef: v.string(),
  journalTokenDigest: v.string(),
  operation: providerConsequenceX402Operation,
  args: v.any(),
} as const

function matchingOptionalIdentity(
  args: Record<string, unknown>,
  row: Doc<'providerConsequenceJournal'>,
): boolean {
  return (args.dispatchRef === undefined || args.dispatchRef === row.invocationRef)
    && (args.invocationRef === undefined || args.invocationRef === row.invocationRef)
    && (args.operationRef === undefined || args.operationRef === row.operationRef)
    && (args.attemptRef === undefined || args.attemptRef === row.attemptRef)
    && (args.effectGeneration === undefined || args.effectGeneration === row.effectGeneration)
    && (args.providerRef === undefined || args.providerRef === row.providerRef)
    && (args.credentialRef === undefined || args.credentialRef === row.secretRef)
    && (args.operationKeyDigest === undefined || args.operationKeyDigest === row.operationKeyDigest)
    && (args.paymentIdentifier === undefined || args.paymentIdentifier === row.operationKeyDigest)
}

async function matchingStoredAttempt(
  ctx: MutationCtx,
  args: Record<string, unknown>,
  row: Doc<'providerConsequenceJournal'>,
): Promise<boolean> {
  const custodyRef = args.custodyRef
  const authorizationDigest = args.authorizationDigest
  if (typeof custodyRef !== 'string' || typeof authorizationDigest !== 'string') return false
  const attempt = await ctx.db.query('moneyX402PaymentAttempts')
    .withIndex('by_custodyRef', (query) => query.eq('custodyRef', custodyRef)).unique()
  return attempt !== null
    && attempt.authorizationDigest === authorizationDigest
    && attempt.dispatchRef === row.invocationRef
    && attempt.attemptRef === row.attemptRef
    && attempt.effectGeneration === row.effectGeneration
    && attempt.operationRef === row.operationRef
    && attempt.credentialRef === row.secretRef
}

export async function authorizeProviderConsequenceX402RpcHandler(
  ctx: MutationCtx,
  input: { ticketRef: string; journalTokenDigest: string; operation: X402Operation; args: unknown },
) {
  if (typeof input.args !== 'object' || input.args === null || Array.isArray(input.args)) {
    return { kind: 'unavailable' as const }
  }
  const args = input.args as Record<string, unknown>
  const row = await ctx.db.query('providerConsequenceJournal')
    .withIndex('by_ticketRef', (query) => query.eq('ticketRef', input.ticketRef)).unique()
  if (row === null
    || row.state !== 'started'
    || row.journalTokenDigest !== input.journalTokenDigest
    || !matchingOptionalIdentity(args, row)) return { kind: 'unavailable' as const }
  const postRelease = input.operation === 'observe_attempt'
  if (!postRelease && Date.now() >= row.expiresAt) return { kind: 'unavailable' as const }
  const identityBoundOperations: readonly X402Operation[] = [
    'reserve_external_spend', 'prepare_authorization',
  ]
  if (!identityBoundOperations.includes(input.operation)
    && !await matchingStoredAttempt(ctx, args, row)) return { kind: 'unavailable' as const }
  const invocation = await ctx.db.query('capabilityOperationInvocations')
    .withIndex('by_invocationRef', (query) => query.eq('invocationRef', row.invocationRef)).unique()
  if (invocation === null
    || invocation.operationRef !== row.operationRef
    || invocation.grantRef !== row.grantRef
    || invocation.grantGeneration !== row.grantGeneration
    || invocation.principalId !== row.actorPrincipalRef) return { kind: 'unavailable' as const }
  return {
    kind: 'authorized' as const,
    invocationRef: row.invocationRef,
    operationRef: row.operationRef,
    attemptRef: row.attemptRef,
    effectGeneration: row.effectGeneration,
    credentialRef: row.secretRef,
    principalId: invocation.principalId,
    credentialId: invocation.credentialId,
    grantRef: invocation.grantRef,
    grantGeneration: invocation.grantGeneration,
    environment: invocation.environment,
    inputDigest: invocation.inputDigest,
    providerRef: row.providerRef,
  }
}

export const authorizeProviderConsequenceX402Rpc = internalMutationGeneric({
  args: authorizeProviderConsequenceX402RpcArgs,
  returns: v.union(
    v.object({
      kind: v.literal('authorized'),
      invocationRef: v.string(),
      operationRef: v.string(),
      attemptRef: v.string(),
      effectGeneration: v.number(),
      credentialRef: v.string(),
      principalId: v.string(),
      credentialId: v.string(),
      grantRef: v.string(),
      grantGeneration: v.number(),
      environment: v.union(v.literal('sandbox'), v.literal('production')),
      inputDigest: v.string(),
      providerRef: v.string(),
    }),
    v.object({ kind: v.literal('unavailable') }),
  ),
  handler: authorizeProviderConsequenceX402RpcHandler,
})
