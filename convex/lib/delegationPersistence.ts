import type { MutationCtx } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'
import {
  DelegationError,
  parsePersistedDelegationGrant,
  reconstructPinnedDelegationSnapshotForReplay,
  type DelegationAuthoritySnapshot,
  type DelegationCommit,
  type DelegationContextPort,
  type DelegationGrant,
  type DelegationGrantRef,
  type DelegationStore,
} from '../../src/modules/authority/delegation/public'
import {
  accountRef,
  principalRef,
  type AccountActionContext,
  type ActiveAccountContext,
  type PrincipalRef,
} from '../../src/modules/principal-account/public'

const CONTEXT_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u

type GrantDocument = Awaited<ReturnType<typeof getGrantDocument>>

export function createConvexDelegationStore(ctx: MutationCtx): DelegationStore {
  return {
    transact: async (operation) => await operation({
      getGrant: async (ref) => grantFromDocument(await getGrantDocument(ctx, ref)),
      getGrantByCreationIdempotency: async (account, actor, idempotencyRef) => {
        const document = await ctx.db.query('authorityDelegationGrants')
          .withIndex('by_accountRef_and_actorPrincipalRef_and_createdBy_idempotencyRef', (query) => query
            .eq('accountRef', account)
            .eq('actorPrincipalRef', actor)
            .eq('createdBy.idempotencyRef', idempotencyRef))
          .unique()
        return grantFromDocument(document)
      },
      getSnapshotByAdmissionIdempotency: async (account, actor, idempotencyRef) => {
        const document = await ctx.db.query('authorityDelegationSnapshots')
          .withIndex('by_accountRef_and_actorPrincipalRef_and_idempotencyRef', (query) => query
            .eq('accountRef', account)
            .eq('actorPrincipalRef', actor)
            .eq('idempotencyRef', idempotencyRef))
          .unique()
        return document === null ? undefined : await snapshotFromDocument(ctx, document)
      },
      getSnapshot: async (ref) => {
        const document = await ctx.db.query('authorityDelegationSnapshots')
          .withIndex('by_snapshotRef', (query) => query.eq('snapshotRef', ref))
          .unique()
        return document === null ? undefined : await snapshotFromDocument(ctx, document)
      },
      commit: async (change) => await commitDelegation(ctx, change),
    }),
  }
}

export function createConvexDelegationContextPort(
  ctx: MutationCtx,
  trustedPrincipalRef: PrincipalRef,
): DelegationContextPort {
  const trusted = principalRef(trustedPrincipalRef)
  return {
    resolveActiveContext: async (candidate) => await resolveContext(ctx, trusted, candidate, false),
    resolveRootIssuerContext: async (candidate) => await resolveContext(ctx, trusted, candidate, true),
    requireActivePrincipal: async (candidate) => {
      const ref = principalRef(candidate)
      const row = await ctx.db.query('principals')
        .withIndex('by_principalRef', (query) => query.eq('principalRef', ref))
        .unique()
      if (row === null || row.lifecycle !== 'active') throw new DelegationError('delegation_actor_mismatch')
    },
  }
}

async function resolveContext(
  ctx: MutationCtx,
  trusted: PrincipalRef,
  candidate: AccountActionContext,
  ownerOnly: boolean,
): Promise<ActiveAccountContext> {
  if (candidate.actorPrincipalRef !== trusted) throw new DelegationError('delegation_actor_mismatch')
  const activeAccountRef = accountRef(candidate.activeAccountRef)
  const actor = principalRef(candidate.actorPrincipalRef)
  if (!CONTEXT_REF_PATTERN.test(candidate.correlationRef)
    || !CONTEXT_REF_PATTERN.test(candidate.idempotencyRef)) {
    throw new DelegationError('delegation_request_invalid')
  }
  const principal = await ctx.db.query('principals')
    .withIndex('by_principalRef', (query) => query.eq('principalRef', actor))
    .unique()
  const account = await ctx.db.query('accounts')
    .withIndex('by_accountRef', (query) => query.eq('accountRef', activeAccountRef))
    .unique()
  if (principal === null
    || principal.lifecycle !== 'active'
    || account === null
    || account.lifecycle !== 'active'
    || !Number.isSafeInteger(account.revision)
    || account.revision <= 0) {
    throw new DelegationError('delegation_actor_mismatch')
  }
  const ownership = await ctx.db.query('accountOwnerships')
    .withIndex('by_ownershipRef', (query) => query.eq('ownershipRef', account.currentOwnershipRef))
    .unique()
  const owns = ownership !== null
    && ownership.lifecycle === 'active'
    && ownership.accountRef === activeAccountRef
    && ownership.ownerPrincipalRef === actor
  if (ownerOnly && !owns) throw new DelegationError('delegation_actor_mismatch')
  if (!ownerOnly && !owns) {
    const membership = await ctx.db.query('memberships')
      .withIndex('by_accountRef_and_memberPrincipalRef_and_lifecycle', (query) => query
        .eq('accountRef', activeAccountRef)
        .eq('memberPrincipalRef', actor)
        .eq('lifecycle', 'active'))
      .unique()
    if (membership === null) throw new DelegationError('delegation_actor_mismatch')
  }
  return Object.freeze({
    accountRef: activeAccountRef,
    actorPrincipalRef: actor,
    accountRevision: account.revision,
    correlationRef: candidate.correlationRef,
    idempotencyRef: candidate.idempotencyRef,
  })
}

async function getGrantDocument(ctx: MutationCtx, ref: DelegationGrantRef) {
  return await ctx.db.query('authorityDelegationGrants')
    .withIndex('by_grantRef', (query) => query.eq('grantRef', ref))
    .unique()
}

function grantFromDocument(document: GrantDocument): DelegationGrant | undefined {
  if (document === null) return undefined
  return parsePersistedDelegationGrant(withoutSystemFields(document))
}

async function snapshotFromDocument(
  ctx: MutationCtx,
  document: Doc<'authorityDelegationSnapshots'>,
): Promise<DelegationAuthoritySnapshot> {
  const header = document
  const ancestors = await ctx.db.query('authorityDelegationSnapshotAncestors')
    .withIndex('by_snapshotRef_and_position', (query) => query.eq('snapshotRef', header.snapshotRef))
    .collect()
  if (!Number.isSafeInteger(header.ancestryCount) || header.ancestryCount <= 0 || ancestors.length !== header.ancestryCount) {
    throw new DelegationError('delegation_snapshot_invalid')
  }
  const ancestry = ancestors.map((ancestor, position) => {
    if (ancestor.position !== position || ancestor.snapshotRef !== header.snapshotRef) {
      throw new DelegationError('delegation_snapshot_invalid')
    }
    const { snapshotRef, position: storedPosition, ...value } = withoutSystemFields(ancestor)
    void snapshotRef
    void storedPosition
    return value
  })
  const { ancestryCount, ...value } = withoutSystemFields(header)
  void ancestryCount
  return reconstructPinnedDelegationSnapshotForReplay(
    { ...value, ancestry },
    {
      accountRef: accountRef(header.accountRef),
      actorPrincipalRef: principalRef(header.actorPrincipalRef),
      accountRevision: header.accountRevision,
      correlationRef: header.correlationRef,
      idempotencyRef: header.idempotencyRef,
    },
  )
}

function withoutSystemFields<Value extends { _id: unknown; _creationTime: number }>(value: Value) {
  const { _id, _creationTime, ...domain } = value
  void _id
  void _creationTime
  return domain
}

async function commitDelegation(ctx: MutationCtx, change: DelegationCommit): Promise<void> {
  const replacements = change.grantReplacements ?? []
  const replacementRefs = new Set<DelegationGrantRef>()
  const replacementDocuments = await Promise.all(replacements.map(async (replacement) => {
    if (replacementRefs.has(replacement.value.grantRef)) {
      throw new DelegationError('delegation_generation_stale')
    }
    replacementRefs.add(replacement.value.grantRef)
    const document = await getGrantDocument(ctx, replacement.value.grantRef)
    if (document === null || document.revision !== replacement.expectedRevision) {
      throw new DelegationError('delegation_generation_stale')
    }
    return { document, value: grantForStorage(replacement.value) }
  }))
  const grantInsert = change.grantInsert === undefined ? undefined : grantForStorage(change.grantInsert)
  if (grantInsert !== undefined) {
    if (replacementRefs.has(grantInsert.grantRef)
      || await getGrantDocument(ctx, grantInsert.grantRef) !== null) {
      throw new DelegationError('delegation_grant_ref_conflict')
    }
  }

  // Keep the repeated reads of a hostile accessor-backed change defensive: a
  // disappearing optional insert must remain a no-op, never a partial commit.
  if (change.snapshotInsert !== undefined) {
    const candidate = change.snapshotInsert
    const existing = await ctx.db.query('authorityDelegationSnapshots')
      .withIndex('by_snapshotRef', (query) => query.eq('snapshotRef', candidate?.snapshotRef ?? ''))
      .unique()
    if (existing !== null) throw new DelegationError('delegation_snapshot_ref_conflict')
  }
  const snapshotInsert = change.snapshotInsert
  const preparedSnapshot = snapshotInsert === undefined ? undefined : prepareSnapshot(snapshotInsert)

  // Everything capable of raising a domain validation/conflict error is
  // complete before the first write. A caught domain error cannot commit a
  // replacement without its immutable snapshot.
  for (const replacement of replacementDocuments) {
    await ctx.db.replace(replacement.document._id, replacement.value)
  }
  if (grantInsert !== undefined) {
    await ctx.db.insert('authorityDelegationGrants', grantInsert)
  }
  if (preparedSnapshot !== undefined) {
    await ctx.db.insert('authorityDelegationSnapshots', preparedSnapshot.header)
    for (const ancestor of preparedSnapshot.ancestors) {
      await ctx.db.insert('authorityDelegationSnapshotAncestors', ancestor)
    }
  }
}

function prepareSnapshot(snapshot: DelegationAuthoritySnapshot) {
  const canonical = reconstructPinnedDelegationSnapshotForReplay(snapshot, {
    accountRef: snapshot.accountRef,
    actorPrincipalRef: snapshot.actorPrincipalRef,
    accountRevision: snapshot.accountRevision,
    correlationRef: snapshot.correlationRef,
    idempotencyRef: snapshot.idempotencyRef,
  })
  const { ancestry, ...header } = canonical
  return {
    header: {
      ...header,
      scopes: [...header.scopes],
      resourceRefs: [...header.resourceRefs],
      ancestryCount: ancestry.length,
    },
    ancestors: ancestry.map((ancestor, position) => ({
      snapshotRef: canonical.snapshotRef,
      position,
      ...ancestor,
      scopes: [...ancestor.scopes],
      resourceRefs: [...ancestor.resourceRefs],
    })),
  }
}

function grantForStorage(grant: DelegationGrant) {
  const parsed = parsePersistedDelegationGrant(grant)
  return {
    ...parsed,
    scopes: [...parsed.scopes],
    resourceRefs: [...parsed.resourceRefs],
    createdBy: { ...parsed.createdBy },
    ...(parsed.revokedBy === undefined ? {} : { revokedBy: { ...parsed.revokedBy } }),
  }
}
