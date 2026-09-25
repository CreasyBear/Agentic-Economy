import { v, type ObjectType } from 'convex/values'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import type { MutationCtx } from '../../../_generated/server'
import type { Doc } from '../../../_generated/dataModel'
import { agentAuditOpaqueRef } from '@/modules/agent-access/public'
import { PrincipalRegistry, PrincipalRegistryError, principalRef, type Principal } from '@/modules/principal-account/public'
import { resolveInteractiveAuthorityContext } from '../../../interactiveAuthority'
import { persistAgentAudit } from './records'
export const renameAgentArgs = {
  principalRef: v.string(),
  expectedRevision: v.number(),
  displayName: v.string(),
  correlationRef: v.string(),
}
export const renameAgentResult = v.union(
  v.object({
    kind: v.union(v.literal('completed'), v.literal('replayed')),
    principalRef: v.string(),
    displayName: v.string(),
    revision: v.number(),
    correlationRef: v.string(),
  }),
  v.object({ kind: v.literal('conflict'), code: v.string(), correlationRef: v.string() }),
  v.object({ kind: v.literal('refused'), code: v.literal('authentication_required'), correlationRef: v.string() }),
)

function principalFromDocument(row: Doc<'principals'>): Principal {
  return Object.freeze({
    principalRef: principalRef(row.principalRef),
    kind: row.kind,
    displayName: row.displayName,
    lifecycle: row.lifecycle,
    revision: row.revision,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    ...(row.mergedIntoPrincipalRef === undefined
      ? {}
      : { mergedIntoPrincipalRef: principalRef(row.mergedIntoPrincipalRef) }),
  })
}

function principalDocument(principal: Principal) {
  return {
    principalRef: principal.principalRef,
    kind: principal.kind,
    displayName: principal.displayName,
    lifecycle: principal.lifecycle,
    revision: principal.revision,
    createdAt: principal.createdAt,
    updatedAt: principal.updatedAt,
    ...(principal.mergedIntoPrincipalRef === undefined
      ? {}
      : { mergedIntoPrincipalRef: principal.mergedIntoPrincipalRef }),
  }
}

function principalRegistry(ctx: Pick<MutationCtx, 'db'>, now: number): PrincipalRegistry {
  return new PrincipalRegistry({
    transact: async (operation) => await operation({
      get: async (ref) => {
        const row = await ctx.db.query('principals')
          .withIndex('by_principalRef', (query) => query.eq('principalRef', ref))
          .unique()
        return row === null ? undefined : principalFromDocument(row)
      },
      insert: async (principal) => {
        const existing = await ctx.db.query('principals')
          .withIndex('by_principalRef', (query) => query.eq('principalRef', principal.principalRef))
          .unique()
        if (existing !== null) throw new PrincipalRegistryError('principal_ref_conflict')
        await ctx.db.insert('principals', principalDocument(principal))
      },
      replace: async (principal, expectedRevision) => {
        const current = await ctx.db.query('principals')
          .withIndex('by_principalRef', (query) => query.eq('principalRef', principal.principalRef))
          .unique()
        if (current === null) throw new PrincipalRegistryError('principal_not_found')
        if (current.revision !== expectedRevision) throw new PrincipalRegistryError('principal_revision_conflict')
        await ctx.db.replace(current._id, principalDocument(principal))
      },
      replaceMany: async (replacements) => {
        const current = await Promise.all(replacements.map(async ({ principal, expectedRevision }) => {
          const row = await ctx.db.query('principals')
            .withIndex('by_principalRef', (query) => query.eq('principalRef', principal.principalRef))
            .unique()
          if (row === null) throw new PrincipalRegistryError('principal_not_found')
          if (row.revision !== expectedRevision) throw new PrincipalRegistryError('principal_revision_conflict')
          return { row, principal }
        }))
        await Promise.all(current.map(async ({ row, principal }) => {
          await ctx.db.replace(row._id, principalDocument(principal))
        }))
      },
    }),
  }, { now: () => now })
}
export async function renameAgentForServerHandler(ctx: MutationCtx, args: ObjectType<typeof renameAgentArgs>) {
  try {
    agentAuditOpaqueRef(args.correlationRef, 'correlationRef')
  } catch (cause) {
    return degradeBackend(cause, { kind: 'conflict' as const, code: 'correlation_ref_invalid' as const, correlationRef: 'invalid-correlation-reference' }, { site: 'renameAgentForServerHandler', reason: 'invalid_response' })
  }
  const identity = await ctx.auth.getUserIdentity()
  if (identity === null) {
    return { kind: 'refused' as const, code: 'authentication_required' as const, correlationRef: args.correlationRef }
  }
  let owner: Awaited<ReturnType<typeof resolveInteractiveAuthorityContext>>
  try {
    owner = await resolveInteractiveAuthorityContext(ctx, identity)
  } catch (cause) {
    return degradeBackend(cause, { kind: 'refused' as const, code: 'authentication_required' as const, correlationRef: args.correlationRef }, { site: 'renameAgentForServerHandler', reason: 'forbidden' })
  }
  if (owner.provenance.accessKind !== 'ownership') {
    return { kind: 'conflict' as const, code: 'account_ownership_required' as const, correlationRef: args.correlationRef }
  }
  const [principal, membership, admission] = await Promise.all([
    ctx.db.query('principals')
      .withIndex('by_principalRef', (query) => query.eq('principalRef', args.principalRef))
      .unique(),
    ctx.db.query('memberships')
      .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
        .eq('accountRef', owner.accountRef)
        .eq('memberPrincipalRef', args.principalRef)
        .eq('lifecycle', 'active'))
      .unique(),
    ctx.db.query('agentAccessPrincipals')
      .withIndex('by_principalId', (query) => query.eq('principalId', args.principalRef))
      .unique(),
  ])
  if (principal === null
    || principal.kind !== 'agent'
    || membership === null
    || admission === null
    || admission.ownerId !== owner.accountRef) {
    return { kind: 'conflict' as const, code: 'agent_not_found' as const, correlationRef: args.correlationRef }
  }

  const now = Date.now()
  try {
    const renamed = await principalRegistry(ctx, now).rename({
      principalRef: principalRef(args.principalRef),
      expectedRevision: args.expectedRevision,
      displayName: args.displayName,
    })
    const replayed = renamed.revision === principal.revision
    if (!replayed) await persistAgentAudit(ctx, {
      eventType: 'agent.renamed',
      actorPrincipalRef: owner.principalRef,
      activeAccountRef: owner.accountRef,
      agentRef: renamed.principalRef,
      correlationRef: args.correlationRef,
      idempotencyRef: `agent-rename:${renamed.principalRef}:${args.expectedRevision}`,
      beforeState: 'named',
      outcome: 'renamed',
      occurredAt: now,
    })
    return {
      kind: replayed ? 'replayed' as const : 'completed' as const,
      principalRef: renamed.principalRef,
      displayName: renamed.displayName,
      revision: renamed.revision,
      correlationRef: args.correlationRef,
    }
  } catch (error) {
    if (error instanceof PrincipalRegistryError) {
      return { kind: 'conflict' as const, code: error.code, correlationRef: args.correlationRef }
    }
    throw error
  }
}
