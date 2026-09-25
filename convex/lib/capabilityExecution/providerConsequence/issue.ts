import { v } from 'convex/values'
import { providerConsequenceTicketClaimsDigest } from '@/modules/capability-execution/convex'
import { beginLeaseEffectHandler } from '../../capabilitySupply/providerConnections/leaseEffect'
import type { MutationCtx } from '../../../_generated/server'
import { canonicalIssueInput, exactStrings, matchesExistingEffect, matchesIssueIdentity, ticketFromRow, unavailable, SECRET_GENERATION, type CanonicalTicket, type IssueArgs } from './identity'

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
  callRef: v.string(),
  toolRef: v.string(),
  leaseRef: v.string(),
  connectionRef: v.string(),
  authorityGeneration: v.number(),
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
  paymentSecret: v.optional(v.object({
    secretRef: v.string(),
    activeGeneration: v.string(),
    pointerRevision: v.number(),
  })),
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
  callRef: v.string(),
  toolRef: v.string(),
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
  paymentSecretRef: v.optional(v.string()),
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
  const [lease, call, signingPointer, paymentPointer] = await Promise.all([
    ctx.db.query('capabilityProviderConnectionLeases')
      .withIndex('by_leaseRef', (query) => query.eq('leaseRef', args.leaseRef)).unique(),
    ctx.db.query('capabilityCalls')
      .withIndex('by_callRef', (query) => query.eq('callRef', args.callRef)).unique(),
    ctx.db.query('secretPointers')
      .withIndex('by_secretRef', (query) => query.eq('secretRef', args.signingSecretRef)).unique(),
    args.paymentSecretRef === undefined
      ? Promise.resolve(null)
      : ctx.db.query('secretPointers')
          .withIndex('by_secretRef', (query) => query.eq('secretRef', args.paymentSecretRef as string)).unique(),
  ])
  if (lease === null
    || lease.state !== 'active'
    || lease.callRef !== args.callRef
    || lease.toolRef !== args.toolRef
    || lease.providerRef !== args.providerRef
    || lease.adapterId !== args.adapterId
    || lease.authorityDigest !== args.authorityDigest
    || !exactStrings(lease.grantedScopes, args.grantedScopes)
    || !exactStrings(lease.grantedResources, args.grantedResources)
    || lease.readinessValidUntil !== args.readinessValidUntil
    || lease.readinessDigest !== args.readinessDigest
    || lease.expiresAt <= now) return unavailable('lease_authority_unavailable')
  if (call === null
    || call.toolRef !== args.toolRef
    || call.grantRef !== lease.grantRef
    || call.grantGeneration !== lease.grantGeneration
    || call.principalId !== lease.actorPrincipalRef
    || call.grantExpiresAt <= now
    || call.attemptRef !== args.attemptRef) {
    return unavailable('invocation_authority_unavailable')
  }
  const connection = await ctx.db.query('capabilityProviderConnections')
    .withIndex('by_connectionRef', (query) => query.eq('connectionRef', lease.connectionRef)).unique()
  if (connection === null
    || connection.lifecycle !== 'active'
    || connection.providerRef !== args.providerRef
    || connection.adapterId !== args.adapterId
    || connection.authorityDigest !== args.authorityDigest
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
  if (args.adapterId === 'x402-fetch:v2') {
    if (paymentPointer === null
      || paymentPointer.owningAccountRef !== signingPointer.owningAccountRef
      || paymentPointer.secretRef === customerPointer.secretRef
      || paymentPointer.secretRef === signingPointer.secretRef
      || !SECRET_GENERATION.test(paymentPointer.activeGeneration)
      || !Number.isSafeInteger(paymentPointer.revision)
      || paymentPointer.revision < 1) return unavailable('payment_secret_pointer_unavailable')
  } else if (paymentPointer !== null) {
    return unavailable('payment_secret_pointer_unavailable')
  }
  const expiresAt = Math.min(
    args.requestedExpiresAt,
    now + MAX_TICKET_LIFETIME_MS,
    lease.expiresAt,
    lease.readinessValidUntil,
    call.grantExpiresAt,
  )
  if (expiresAt - now < MIN_TICKET_LIFETIME_MS) return unavailable('ticket_lifetime_unavailable')

  const admission = await beginEffect(ctx, {
    leaseRef: args.leaseRef,
    callRef: args.callRef,
    toolRef: args.toolRef,
    commandId: args.commandId,
  })
  if (admission.kind !== 'admitted'
    || admission.owningAccountRef !== customerPointer.owningAccountRef
    || admission.activeAccountRef !== lease.activeAccountRef
    || admission.actorPrincipalRef !== lease.actorPrincipalRef
    || admission.grantRef !== lease.grantRef
    || admission.grantGeneration !== lease.grantGeneration
    || admission.connectionRef !== connection.connectionRef
    || admission.authorityGeneration !== connection.authorityGeneration
    || admission.secretRef !== customerPointer.secretRef) {
    throw new Error('provider_consequence_effect_admission_failed')
  }

  const current = await ctx.db.query('providerConsequenceJournal')
    .withIndex('by_effectRef', (query) => query.eq('effectRef', admission.effectRef)).order('desc').first()
  if (current !== null && current.state === 'pending' && current.expiresAt <= now) {
    await ctx.db.patch(current._id, { state: 'aborted', abortedAt: now, updatedAt: now })
  } else if (current !== null) {
    if (!matchesExistingEffect(current, args, admission, customerPointer, signingPointer, paymentPointer)) {
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
    callRef: args.callRef,
    toolRef: args.toolRef,
    leaseRef: args.leaseRef,
    connectionRef: admission.connectionRef,
    authorityGeneration: admission.authorityGeneration,
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
    ...(paymentPointer === null
      ? {}
      : { paymentSecret: {
          secretRef: paymentPointer.secretRef,
          activeGeneration: paymentPointer.activeGeneration,
          pointerRevision: paymentPointer.revision,
        } }),
  }
  const claimsDigest = providerConsequenceTicketClaimsDigest(ticket)
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
    callRef: ticket.callRef,
    toolRef: ticket.toolRef,
    attemptRef: args.attemptRef,
    effectGeneration: args.effectGeneration,
    leaseRef: ticket.leaseRef,
    connectionRef: ticket.connectionRef,
    authorityGeneration: ticket.authorityGeneration,
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
    ...(ticket.paymentSecret === undefined || paymentPointer === null
      ? {}
      : {
          paymentSecretRef: ticket.paymentSecret.secretRef,
          paymentSecretGeneration: ticket.paymentSecret.activeGeneration,
          paymentSecretPointerRevision: ticket.paymentSecret.pointerRevision,
          paymentAccountRef: paymentPointer.owningAccountRef,
        }),
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
