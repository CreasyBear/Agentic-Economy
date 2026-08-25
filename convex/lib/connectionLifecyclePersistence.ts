import type { MutationCtx } from '../_generated/server'
import type { Doc } from '../_generated/dataModel'
import {
  DelegationService,
  delegationGrantRef,
} from '../../src/modules/authority/delegation/public'
import {
  ConnectionLifecycleError,
  parsePersistedConnection,
  parsePersistedConnectionEffectAdmission,
  parsePersistedConnectionLease,
  parsePersistedConnectionLifecycleCommand,
  parsePersistedConnectionShare,
  type Connection,
  type ConnectionAction,
  type ConnectionActionAuthority,
  type ConnectionEffectAdmission,
  type ConnectionLease,
  type ConnectionLifecycleCommand,
  type ConnectionLifecycleStore,
  type ConnectionShare,
} from '../../src/modules/connections/lifecycle/public'

export function createDelegationBackedConnectionAuthority(
  delegation: DelegationService,
): ConnectionActionAuthority {
  return {
    withCurrentAuthority: async (request, consequence) => {
      const snapshot = await delegation.admitConsequence({
        grantRef: delegationGrantRef(request.grantRef),
        expectedGeneration: request.expectedGrantGeneration,
        context: request.context,
        requiredScopes: [`connection:${request.operation}`],
        resourceRefs: request.resourceRefs,
        budgetAmount: 0,
      })
      return await consequence(Object.freeze({
        snapshotRef: snapshot.snapshotRef,
        actorPrincipalRef: snapshot.actorPrincipalRef,
        activeAccountRef: snapshot.accountRef,
        grantRef: snapshot.grantRef,
        grantGeneration: snapshot.generation,
        grantExpiresAt: snapshot.expiresAt,
        resourceRefs: snapshot.resourceRefs,
      }))
    },
  }
}

export function createConvexConnectionLifecycleStore(ctx: MutationCtx): ConnectionLifecycleStore {
  return {
    transact: async (operation) => {
      // Lifecycle transitions span a mutable Connection and an immutable command.
      // Buffer both so a caught second-write failure cannot expose half a transition.
      const pendingConnectionReplacements = new Map<string, {
        readonly original: Doc<'connections'>
        readonly value: Connection
        readonly stored: ReturnType<typeof connectionForStorage>
      }>()
      const pendingLifecycleCommands = new Map<string, {
        readonly value: ConnectionLifecycleCommand
        readonly stored: ReturnType<typeof commandForStorage>
      }>()
      let aborted = false
      let abortReason: unknown

      async function stageFallibleWrite<Result>(work: () => Promise<Result>): Promise<Result> {
        try {
          return await work()
        } catch (error) {
          if (pendingConnectionReplacements.size > 0 || pendingLifecycleCommands.size > 0) {
            aborted = true
            abortReason = error
          }
          throw error
        }
      }

      const result = await operation({
      getConnection: async (ref) => pendingConnectionReplacements.get(ref)?.value
        ?? connectionFromDocument(await ctx.db.query('connections')
          .withIndex('by_connectionRef', (query) => query.eq('connectionRef', ref))
          .unique()),
      getConnectionByInstallIdempotency: async (account, idempotencyRef) => {
        const staged = [...pendingConnectionReplacements.values()].find(({ value }) => (
          value.owningAccountRef === account
          && value.installAction.idempotencyRef === idempotencyRef
        ))
        return staged?.value ?? connectionFromDocument(
          await ctx.db.query('connections')
            .withIndex('by_owningAccountRef_and_installAction_idempotencyRef', (query) => query
              .eq('owningAccountRef', account)
              .eq('installAction.idempotencyRef', idempotencyRef))
            .unique(),
        )
      },
      getShare: async (ref) => shareFromDocument(await ctx.db.query('connectionShares')
        .withIndex('by_shareRef', (query) => query.eq('shareRef', ref))
        .unique()),
      getActiveShare: async (connectionRef, account) => shareFromDocument(
        await ctx.db.query('connectionShares')
          .withIndex('by_connectionRef_and_granteeAccountRef_and_lifecycle', (query) => query
            .eq('connectionRef', connectionRef)
            .eq('granteeAccountRef', account)
            .eq('lifecycle', 'active'))
          .unique(),
      ),
      getShareByIdempotency: async (account, idempotencyRef) => shareFromDocument(
        await ctx.db.query('connectionShares')
          .withIndex('by_owningAccountRef_and_action_idempotencyRef', (query) => query
            .eq('owningAccountRef', account)
            .eq('action.idempotencyRef', idempotencyRef))
          .unique(),
      ),
      getLease: async (ref) => leaseFromDocument(await ctx.db.query('connectionLeases')
        .withIndex('by_leaseRef', (query) => query.eq('leaseRef', ref))
        .unique()),
      getLeaseByIdempotency: async (account, idempotencyRef) => leaseFromDocument(
        await ctx.db.query('connectionLeases')
          .withIndex('by_activeAccountRef_and_action_idempotencyRef', (query) => query
            .eq('activeAccountRef', account)
            .eq('action.idempotencyRef', idempotencyRef))
          .unique(),
      ),
      getAdmission: async (ref) => admissionFromDocument(await ctx.db.query('connectionEffectAdmissions')
        .withIndex('by_effectRef', (query) => query.eq('effectRef', ref))
        .unique()),
      getAdmissionByIdempotency: async (account, idempotencyRef) => admissionFromDocument(
        await ctx.db.query('connectionEffectAdmissions')
          .withIndex('by_activeAccountRef_and_action_idempotencyRef', (query) => query
            .eq('activeAccountRef', account)
            .eq('action.idempotencyRef', idempotencyRef))
          .unique(),
      ),
      getLifecycleCommandByIdempotency: async (account, idempotencyRef) => {
        const staged = pendingLifecycleCommands.get(lifecycleCommandKey(account, idempotencyRef))
        return staged?.value ?? commandFromDocument(
          await ctx.db.query('connectionLifecycleCommands')
            .withIndex('by_action_activeAccountRef_and_action_idempotencyRef', (query) => query
              .eq('action.activeAccountRef', account)
              .eq('action.idempotencyRef', idempotencyRef))
            .unique(),
        )
      },
      insertConnection: async (connection) => {
        if (await ctx.db.query('connections')
          .withIndex('by_connectionRef', (query) => query.eq('connectionRef', connection.connectionRef))
          .unique() !== null) throw new ConnectionLifecycleError('connection_ref_conflict')
        await ctx.db.insert('connections', connectionForStorage(connection))
      },
      replaceConnection: async (connection, expectedRevision) => await stageFallibleWrite(async () => {
        const pending = pendingConnectionReplacements.get(connection.connectionRef)
        if (pending !== undefined) {
          if (pending.value.revision !== expectedRevision) {
            throw new ConnectionLifecycleError('connection_generation_stale')
          }
          pendingConnectionReplacements.set(connection.connectionRef, {
            original: pending.original,
            value: connection,
            stored: connectionForStorage(connection),
          })
          return
        }
        const document = await ctx.db.query('connections')
          .withIndex('by_connectionRef', (query) => query.eq('connectionRef', connection.connectionRef))
          .unique()
        if (document === null || document.revision !== expectedRevision) {
          throw new ConnectionLifecycleError('connection_generation_stale')
        }
        pendingConnectionReplacements.set(connection.connectionRef, {
          original: document,
          value: connection,
          stored: connectionForStorage(connection),
        })
      }),
      insertShare: async (share) => {
        if (await ctx.db.query('connectionShares')
          .withIndex('by_shareRef', (query) => query.eq('shareRef', share.shareRef))
          .unique() !== null) throw new ConnectionLifecycleError('connection_share_ref_conflict')
        await ctx.db.insert('connectionShares', shareForStorage(share))
      },
      insertLease: async (lease) => {
        if (await ctx.db.query('connectionLeases')
          .withIndex('by_leaseRef', (query) => query.eq('leaseRef', lease.leaseRef))
          .unique() !== null) throw new ConnectionLifecycleError('connection_lease_ref_conflict')
        await ctx.db.insert('connectionLeases', leaseForStorage(lease))
      },
      insertAdmission: async (admission) => {
        if (await ctx.db.query('connectionEffectAdmissions')
          .withIndex('by_effectRef', (query) => query.eq('effectRef', admission.effectRef))
          .unique() !== null) throw new ConnectionLifecycleError('connection_effect_ref_conflict')
        await ctx.db.insert('connectionEffectAdmissions', admissionForStorage(admission))
      },
      insertLifecycleCommand: async (command) => await stageFallibleWrite(async () => {
        const key = lifecycleCommandKey(command.action.activeAccountRef, command.action.idempotencyRef)
        if (pendingLifecycleCommands.has(key) || await ctx.db.query('connectionLifecycleCommands')
          .withIndex('by_action_activeAccountRef_and_action_idempotencyRef', (query) => query
            .eq('action.activeAccountRef', command.action.activeAccountRef)
            .eq('action.idempotencyRef', command.action.idempotencyRef))
          .unique() !== null) throw new ConnectionLifecycleError('connection_idempotency_conflict')
        pendingLifecycleCommands.set(key, {
          value: command,
          stored: commandForStorage(command),
        })
      }),
      })

      if (aborted) throw abortReason

      for (const replacement of pendingConnectionReplacements.values()) {
        const current = await ctx.db.query('connections')
          .withIndex('by_connectionRef', (query) => query.eq('connectionRef', replacement.value.connectionRef))
          .unique()
        if (current === null || current._id !== replacement.original._id || current.revision !== replacement.original.revision) {
          throw new ConnectionLifecycleError('connection_generation_stale')
        }
      }
      for (const command of pendingLifecycleCommands.values()) {
        if (await ctx.db.query('connectionLifecycleCommands')
          .withIndex('by_action_activeAccountRef_and_action_idempotencyRef', (query) => query
            .eq('action.activeAccountRef', command.value.action.activeAccountRef)
            .eq('action.idempotencyRef', command.value.action.idempotencyRef))
          .unique() !== null) throw new ConnectionLifecycleError('connection_idempotency_conflict')
      }
      for (const replacement of pendingConnectionReplacements.values()) {
        await ctx.db.replace(replacement.original._id, replacement.stored)
      }
      for (const command of pendingLifecycleCommands.values()) {
        await ctx.db.insert('connectionLifecycleCommands', command.stored)
      }
      return result
    },
  }
}

function lifecycleCommandKey(accountRef: string, idempotencyRef: string): string {
  return `${accountRef}\u0000${idempotencyRef}`
}

function withoutSystemFields<Value extends { _id: unknown; _creationTime: number }>(value: Value) {
  const { _id, _creationTime, ...domain } = value
  void _id
  void _creationTime
  return domain
}

function connectionFromDocument(document: Doc<'connections'> | null): Connection | undefined {
  if (document === null) return undefined
  return parsePersistedConnection(withoutSystemFields(document))
}

function shareFromDocument(document: Doc<'connectionShares'> | null): ConnectionShare | undefined {
  if (document === null) return undefined
  return parsePersistedConnectionShare(withoutSystemFields(document))
}

function leaseFromDocument(document: Doc<'connectionLeases'> | null): ConnectionLease | undefined {
  if (document === null) return undefined
  return parsePersistedConnectionLease(withoutSystemFields(document))
}

function admissionFromDocument(document: Doc<'connectionEffectAdmissions'> | null): ConnectionEffectAdmission | undefined {
  if (document === null) return undefined
  return parsePersistedConnectionEffectAdmission(withoutSystemFields(document))
}

function commandFromDocument(document: Doc<'connectionLifecycleCommands'> | null): ConnectionLifecycleCommand | undefined {
  if (document === null) return undefined
  return parsePersistedConnectionLifecycleCommand(withoutSystemFields(document))
}

function actionForStorage(action: ConnectionAction) {
  return { ...action, resourceRefs: [...action.resourceRefs] }
}

function connectionForStorage(connection: Connection) {
  const parsed = parsePersistedConnection(connection)
  return {
    ...parsed,
    installedExternalState: { ...parsed.installedExternalState },
    externalState: { ...parsed.externalState },
    installAction: actionForStorage(parsed.installAction),
    action: actionForStorage(parsed.action),
  }
}

function shareForStorage(share: ConnectionShare) {
  const parsed = parsePersistedConnectionShare(share)
  return { ...parsed, action: actionForStorage(parsed.action) }
}

function leaseForStorage(lease: ConnectionLease) {
  const parsed = parsePersistedConnectionLease(lease)
  return { ...parsed, action: actionForStorage(parsed.action) }
}

function admissionForStorage(admission: ConnectionEffectAdmission) {
  const parsed = parsePersistedConnectionEffectAdmission(admission)
  return { ...parsed, action: actionForStorage(parsed.action) }
}

function commandForStorage(command: ConnectionLifecycleCommand) {
  const parsed = parsePersistedConnectionLifecycleCommand(command)
  return {
    ...parsed,
    requestedExternalState: { ...parsed.requestedExternalState },
    action: actionForStorage(parsed.action),
    result: connectionForStorage(parsed.result),
  }
}
