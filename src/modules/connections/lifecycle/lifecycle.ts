import {
  accountRef,
  principalRef,
  type AccountActionContext,
  type AccountRef,
  type PrincipalRef,
} from '../../principal-account/public'

const CONNECTION_REF_PATTERN = /^con_[0-9a-f]{32}$/u
const CONNECTION_SHARE_REF_PATTERN = /^csh_[0-9a-f]{32}$/u
const CONNECTION_LEASE_REF_PATTERN = /^cls_[0-9a-f]{32}$/u
const CONNECTION_EFFECT_REF_PATTERN = /^cef_[0-9a-f]{32}$/u
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u
const OPAQUE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$/u

declare const connectionRefBrand: unique symbol
declare const connectionShareRefBrand: unique symbol
declare const connectionLeaseRefBrand: unique symbol
declare const connectionEffectRefBrand: unique symbol

export type ConnectionRef = string & Readonly<{ [connectionRefBrand]: 'ConnectionRef' }>
export type ConnectionShareRef = string & Readonly<{ [connectionShareRefBrand]: 'ConnectionShareRef' }>
export type ConnectionLeaseRef = string & Readonly<{ [connectionLeaseRefBrand]: 'ConnectionLeaseRef' }>
export type ConnectionEffectRef = string & Readonly<{ [connectionEffectRefBrand]: 'ConnectionEffectRef' }>

export const CONNECTION_LIFECYCLES = ['active', 'revoked', 'deleted'] as const
export type ConnectionLifecycle = typeof CONNECTION_LIFECYCLES[number]

export const CONNECTION_EXTERNAL_STATES = ['ready', 'unavailable', 'revoked', 'deleted'] as const
export type KnownConnectionExternalState = typeof CONNECTION_EXTERNAL_STATES[number]
export type ConnectionExternalState = Readonly<
  | { kind: 'known'; value: KnownConnectionExternalState }
  | { kind: 'unknown'; value: string }
>

export type ConnectionOperation =
  | 'install'
  | 'share'
  | 'lease'
  | 'refresh'
  | 'revoke'
  | 'delete'
  | 'begin_effect'

export type ConnectionAction = Readonly<{
  operation: ConnectionOperation
  actorPrincipalRef: PrincipalRef
  activeAccountRef: AccountRef
  grantRef: string
  grantGeneration: number
  correlationRef: string
  idempotencyRef: string
  occurredAt: number
}>

export type Connection = Readonly<{
  connectionRef: ConnectionRef
  owningAccountRef: AccountRef
  installedByPrincipalRef: PrincipalRef
  providerNamespace: string
  providerLocator?: string
  /** Immutable install input used for durable idempotency after lifecycle changes. */
  installedExternalState: ConnectionExternalState
  externalState: ConnectionExternalState
  lifecycle: ConnectionLifecycle
  generation: number
  revision: number
  createdAt: number
  updatedAt: number
  /** Immutable authority provenance for the install idempotency key. */
  installAction: ConnectionAction
  action: ConnectionAction
}>

export type ConnectionShare = Readonly<{
  shareRef: ConnectionShareRef
  connectionRef: ConnectionRef
  connectionGeneration: number
  owningAccountRef: AccountRef
  granteeAccountRef: AccountRef
  lifecycle: 'active'
  createdAt: number
  action: ConnectionAction
}>

export type ConnectionLease = Readonly<{
  leaseRef: ConnectionLeaseRef
  connectionRef: ConnectionRef
  connectionGeneration: number
  owningAccountRef: AccountRef
  activeAccountRef: AccountRef
  actorPrincipalRef: PrincipalRef
  grantRef: string
  grantGeneration: number
  expiresAt: number
  createdAt: number
  action: ConnectionAction
}>

export type ConnectionEffectAdmission = Readonly<{
  effectRef: ConnectionEffectRef
  leaseRef: ConnectionLeaseRef
  connectionRef: ConnectionRef
  connectionGeneration: number
  owningAccountRef: AccountRef
  activeAccountRef: AccountRef
  actorPrincipalRef: PrincipalRef
  grantRef: string
  grantGeneration: number
  admittedAt: number
  action: ConnectionAction
}>

export type ConnectionLifecycleCommand = Readonly<{
  operation: 'refresh' | 'revoke' | 'delete'
  connectionRef: ConnectionRef
  expectedGeneration: number
  requestedExternalState: ConnectionExternalState
  action: ConnectionAction
  result: Connection
}>

export type ConnectionActionRequest = Readonly<{
  operation: ConnectionOperation
  context: AccountActionContext
  grantRef: string
  connectionRef?: ConnectionRef
  counterpartyAccountRef?: AccountRef
  now: number
}>

export type ConnectionActionSnapshot = Readonly<{
  actorPrincipalRef: PrincipalRef
  activeAccountRef: AccountRef
  grantRef: string
  grantGeneration: number
  grantExpiresAt: number
}>

/**
 * Trusted authority boundary. Implementations must resolve canonical Account and
 * Grant facts and keep the returned generation current until the callback ends.
 */
export type ConnectionActionAuthority = Readonly<{
  withCurrentAuthority<Result>(
    request: ConnectionActionRequest,
    consequence: (snapshot: ConnectionActionSnapshot) => Promise<Result>,
  ): Promise<Result>
}>

export type ConnectionLifecycleTransaction = Readonly<{
  getConnection(ref: ConnectionRef): Promise<Connection | undefined>
  /** Must search immutable installAction provenance across every lifecycle state. */
  getConnectionByInstallIdempotency(accountRef: AccountRef, idempotencyRef: string): Promise<Connection | undefined>
  getShare(ref: ConnectionShareRef): Promise<ConnectionShare | undefined>
  getActiveShare(connectionRef: ConnectionRef, accountRef: AccountRef): Promise<ConnectionShare | undefined>
  getShareByIdempotency(accountRef: AccountRef, idempotencyRef: string): Promise<ConnectionShare | undefined>
  getLease(ref: ConnectionLeaseRef): Promise<ConnectionLease | undefined>
  getLeaseByIdempotency(accountRef: AccountRef, idempotencyRef: string): Promise<ConnectionLease | undefined>
  getAdmission(ref: ConnectionEffectRef): Promise<ConnectionEffectAdmission | undefined>
  getAdmissionByIdempotency(accountRef: AccountRef, idempotencyRef: string): Promise<ConnectionEffectAdmission | undefined>
  /** Durable lookup over append-only command rows, unique by Account + idempotency. */
  getLifecycleCommandByIdempotency(accountRef: AccountRef, idempotencyRef: string): Promise<ConnectionLifecycleCommand | undefined>
  insertConnection(connection: Connection): Promise<void>
  replaceConnection(connection: Connection, expectedRevision: number): Promise<void>
  insertShare(share: ConnectionShare): Promise<void>
  insertLease(lease: ConnectionLease): Promise<void>
  insertAdmission(admission: ConnectionEffectAdmission): Promise<void>
  /** Inserts one immutable row and must reject an existing Account + idempotency key. */
  insertLifecycleCommand(command: ConnectionLifecycleCommand): Promise<void>
}>

export type ConnectionLifecycleStore = Readonly<{
  transact<Result>(operation: (transaction: ConnectionLifecycleTransaction) => Promise<Result>): Promise<Result>
}>

export type ConnectionLifecycleOptions = Readonly<{
  now?: () => number
  randomUuid?: () => string
}>

export type ConnectionLifecycleErrorCode =
  | 'connection_ref_invalid'
  | 'connection_ref_conflict'
  | 'connection_not_found'
  | 'connection_not_active'
  | 'connection_external_state_untrusted'
  | 'connection_access_denied'
  | 'connection_generation_stale'
  | 'connection_share_ref_invalid'
  | 'connection_share_ref_conflict'
  | 'connection_lease_ref_invalid'
  | 'connection_lease_ref_conflict'
  | 'connection_lease_not_found'
  | 'connection_lease_expired'
  | 'connection_lease_stale'
  | 'connection_effect_ref_conflict'
  | 'connection_authority_invalid'
  | 'connection_grant_stale'
  | 'connection_grant_expired'
  | 'connection_timestamp_invalid'
  | 'connection_external_state_invalid'
  | 'connection_provider_metadata_invalid'
  | 'connection_idempotency_conflict'

export class ConnectionLifecycleError extends Error {
  readonly code: ConnectionLifecycleErrorCode

  constructor(code: ConnectionLifecycleErrorCode) {
    super(code)
    this.name = 'ConnectionLifecycleError'
    this.code = code
  }
}

export function connectionRef(value: string): ConnectionRef {
  if (!CONNECTION_REF_PATTERN.test(value)) throw new ConnectionLifecycleError('connection_ref_invalid')
  return value as ConnectionRef
}

export function connectionShareRef(value: string): ConnectionShareRef {
  if (!CONNECTION_SHARE_REF_PATTERN.test(value)) throw new ConnectionLifecycleError('connection_share_ref_invalid')
  return value as ConnectionShareRef
}

export function connectionLeaseRef(value: string): ConnectionLeaseRef {
  if (!CONNECTION_LEASE_REF_PATTERN.test(value)) throw new ConnectionLifecycleError('connection_lease_ref_invalid')
  return value as ConnectionLeaseRef
}

export class ConnectionLifecycleService {
  readonly #store: ConnectionLifecycleStore
  readonly #authority: ConnectionActionAuthority
  readonly #now: () => number
  readonly #randomUuid: () => string

  constructor(
    store: ConnectionLifecycleStore,
    authority: ConnectionActionAuthority,
    options: ConnectionLifecycleOptions = {},
  ) {
    this.#store = store
    this.#authority = authority
    this.#now = options.now ?? (() => Date.now())
    this.#randomUuid = options.randomUuid ?? (() => globalThis.crypto.randomUUID())
  }

  async install(input: Readonly<{
    context: AccountActionContext
    grantRef: string
    providerNamespace: string
    providerLocator?: string
    externalState: ConnectionExternalState
  }>): Promise<Connection> {
    const providerNamespace = validOpaque(input.providerNamespace, 'connection_provider_metadata_invalid')
    const providerLocator = input.providerLocator === undefined
      ? undefined
      : validOpaque(input.providerLocator, 'connection_provider_metadata_invalid')
    const externalState = validExternalState(input.externalState)
    return await this.#withAuthority('install', input.context, input.grantRef, undefined, undefined, async (snapshot, action, timestamp) => {
      return await this.#store.transact(async (transaction) => {
        const replay = await transaction.getConnectionByInstallIdempotency(snapshot.activeAccountRef, action.idempotencyRef)
        if (replay !== undefined) {
          assertReplayAuthority(replay.installAction, action)
          if (replay.providerNamespace !== providerNamespace || replay.providerLocator !== providerLocator || !externalStatesEqual(replay.installedExternalState, externalState)) {
            throw new ConnectionLifecycleError('connection_idempotency_conflict')
          }
          return replay
        }
        const ref = generateStableRef('con', this.#randomUuid, connectionRef)
        if (await transaction.getConnection(ref) !== undefined) throw new ConnectionLifecycleError('connection_ref_conflict')
        const connection = freezeConnection({
          connectionRef: ref,
          owningAccountRef: snapshot.activeAccountRef,
          installedByPrincipalRef: snapshot.actorPrincipalRef,
          providerNamespace,
          ...(providerLocator === undefined ? {} : { providerLocator }),
          installedExternalState: externalState,
          externalState,
          lifecycle: 'active',
          generation: 1,
          revision: 1,
          createdAt: timestamp,
          updatedAt: timestamp,
          installAction: action,
          action,
        })
        await transaction.insertConnection(connection)
        return connection
      })
    })
  }

  async lease(input: Readonly<{
    connectionRef: ConnectionRef
    context: AccountActionContext
    grantRef: string
    expiresAt: number
  }>): Promise<ConnectionLease> {
    const ref = connectionRef(input.connectionRef)
    const expiresAt = validTimestamp(input.expiresAt)
    return await this.#withAuthority('lease', input.context, input.grantRef, ref, undefined, async (snapshot, action, timestamp) => {
      if (expiresAt <= timestamp || expiresAt > snapshot.grantExpiresAt) {
        throw new ConnectionLifecycleError('connection_lease_expired')
      }
      return await this.#store.transact(async (transaction) => {
        const connection = await requiredConnection(transaction, ref)
        requireUsableConnection(connection)
        await requireConnectionAccess(transaction, connection, snapshot.activeAccountRef)
        const replay = await transaction.getLeaseByIdempotency(snapshot.activeAccountRef, action.idempotencyRef)
        if (replay !== undefined) {
          assertReplayAuthority(replay.action, action)
          if (replay.connectionRef !== ref || replay.grantRef !== snapshot.grantRef || replay.expiresAt !== expiresAt) {
            throw new ConnectionLifecycleError('connection_idempotency_conflict')
          }
          requireCurrentLease(replay, connection, snapshot, timestamp)
          return replay
        }
        const leaseRef = generateStableRef('cls', this.#randomUuid, connectionLeaseRef)
        if (await transaction.getLease(leaseRef) !== undefined) throw new ConnectionLifecycleError('connection_lease_ref_conflict')
        const lease = freezeLease({
          leaseRef,
          connectionRef: connection.connectionRef,
          connectionGeneration: connection.generation,
          owningAccountRef: connection.owningAccountRef,
          activeAccountRef: snapshot.activeAccountRef,
          actorPrincipalRef: snapshot.actorPrincipalRef,
          grantRef: snapshot.grantRef,
          grantGeneration: snapshot.grantGeneration,
          expiresAt,
          createdAt: timestamp,
          action,
        })
        await transaction.insertLease(lease)
        return lease
      })
    })
  }

  async share(input: Readonly<{
    connectionRef: ConnectionRef
    granteeAccountRef: AccountRef
    context: AccountActionContext
    grantRef: string
  }>): Promise<ConnectionShare> {
    const ref = connectionRef(input.connectionRef)
    const granteeAccountRef = accountRef(input.granteeAccountRef)
    return await this.#withAuthority('share', input.context, input.grantRef, ref, granteeAccountRef, async (snapshot, action, timestamp) => {
      return await this.#store.transact(async (transaction) => {
        const connection = await requiredConnection(transaction, ref)
        if (connection.lifecycle !== 'active') throw new ConnectionLifecycleError('connection_not_active')
        if (connection.owningAccountRef !== snapshot.activeAccountRef || granteeAccountRef === connection.owningAccountRef) {
          throw new ConnectionLifecycleError('connection_access_denied')
        }
        const replay = await transaction.getShareByIdempotency(snapshot.activeAccountRef, action.idempotencyRef)
        if (replay !== undefined) {
          assertReplayAuthority(replay.action, action)
          if (replay.connectionRef !== ref || replay.granteeAccountRef !== granteeAccountRef) {
            throw new ConnectionLifecycleError('connection_idempotency_conflict')
          }
          return replay
        }
        const existing = await transaction.getActiveShare(ref, granteeAccountRef)
        if (existing !== undefined) return existing
        const shareRef = generateStableRef('csh', this.#randomUuid, connectionShareRef)
        if (await transaction.getShare(shareRef) !== undefined) throw new ConnectionLifecycleError('connection_share_ref_conflict')
        const share = freezeShare({
          shareRef,
          connectionRef: ref,
          connectionGeneration: connection.generation,
          owningAccountRef: connection.owningAccountRef,
          granteeAccountRef,
          lifecycle: 'active',
          createdAt: timestamp,
          action,
        })
        await transaction.insertShare(share)
        return share
      })
    })
  }

  async refresh(input: Readonly<{
    connectionRef: ConnectionRef
    expectedGeneration: number
    externalState: ConnectionExternalState
    context: AccountActionContext
    grantRef: string
  }>): Promise<Connection> {
    const ref = connectionRef(input.connectionRef)
    const expectedGeneration = validExpectedGeneration(input.expectedGeneration)
    const externalState = validExternalState(input.externalState)
    return await this.#withAuthority('refresh', input.context, input.grantRef, ref, undefined, async (snapshot, action, timestamp) => {
      return await this.#store.transact(async (transaction) => {
        const replay = await transaction.getLifecycleCommandByIdempotency(snapshot.activeAccountRef, action.idempotencyRef)
        if (replay !== undefined) {
          return replayLifecycleCommand(replay, 'refresh', ref, expectedGeneration, externalState, action)
        }
        const current = await requiredConnection(transaction, ref)
        if (current.owningAccountRef !== snapshot.activeAccountRef) throw new ConnectionLifecycleError('connection_access_denied')
        if (current.lifecycle !== 'active') throw new ConnectionLifecycleError('connection_not_active')
        if (current.generation !== expectedGeneration) throw new ConnectionLifecycleError('connection_generation_stale')
        if (timestamp < current.updatedAt) throw new ConnectionLifecycleError('connection_timestamp_invalid')
        const refreshed = freezeConnection({
          ...current,
          externalState,
          generation: current.generation + 1,
          revision: current.revision + 1,
          updatedAt: timestamp,
          action,
        })
        await transaction.replaceConnection(refreshed, current.revision)
        await transaction.insertLifecycleCommand(freezeLifecycleCommand({
          operation: 'refresh',
          connectionRef: ref,
          expectedGeneration,
          requestedExternalState: externalState,
          action,
          result: refreshed,
        }))
        return refreshed
      })
    })
  }

  async revoke(input: Readonly<{
    connectionRef: ConnectionRef
    expectedGeneration: number
    externalState: ConnectionExternalState
    context: AccountActionContext
    grantRef: string
  }>): Promise<Connection> {
    return await this.#transitionTerminal(input, 'revoke', 'revoked', ['active'])
  }

  async delete(input: Readonly<{
    connectionRef: ConnectionRef
    expectedGeneration: number
    externalState: ConnectionExternalState
    context: AccountActionContext
    grantRef: string
  }>): Promise<Connection> {
    return await this.#transitionTerminal(input, 'delete', 'deleted', ['active', 'revoked'])
  }

  async beginEffect(input: Readonly<{
    leaseRef: ConnectionLeaseRef
    context: AccountActionContext
  }>): Promise<ConnectionEffectAdmission> {
    const leaseRef = connectionLeaseRef(input.leaseRef)
    const lease = await this.#store.transact(async (transaction) => await transaction.getLease(leaseRef))
    if (lease === undefined) throw new ConnectionLifecycleError('connection_lease_not_found')
    return await this.#withAuthority('begin_effect', input.context, lease.grantRef, lease.connectionRef, undefined, async (snapshot, action, timestamp) => {
      return await this.#store.transact(async (transaction) => {
        const currentLease = await transaction.getLease(leaseRef)
        if (currentLease === undefined) throw new ConnectionLifecycleError('connection_lease_not_found')
        const connection = await requiredConnection(transaction, currentLease.connectionRef)
        requireUsableConnection(connection)
        requireCurrentLease(currentLease, connection, snapshot, timestamp)
        const replay = await transaction.getAdmissionByIdempotency(snapshot.activeAccountRef, action.idempotencyRef)
        if (replay !== undefined) {
          assertReplayAuthority(replay.action, action)
          if (replay.leaseRef !== leaseRef) throw new ConnectionLifecycleError('connection_idempotency_conflict')
          return replay
        }
        const effectRef = generateStableRef('cef', this.#randomUuid, connectionEffectRef)
        if (await transaction.getAdmission(effectRef) !== undefined) {
          throw new ConnectionLifecycleError('connection_effect_ref_conflict')
        }
        const admission = freezeAdmission({
          effectRef,
          leaseRef,
          connectionRef: connection.connectionRef,
          connectionGeneration: connection.generation,
          owningAccountRef: connection.owningAccountRef,
          activeAccountRef: snapshot.activeAccountRef,
          actorPrincipalRef: snapshot.actorPrincipalRef,
          grantRef: snapshot.grantRef,
          grantGeneration: snapshot.grantGeneration,
          admittedAt: timestamp,
          action,
        })
        await transaction.insertAdmission(admission)
        return admission
      })
    })
  }

  async #transitionTerminal(
    input: Readonly<{
      connectionRef: ConnectionRef
      expectedGeneration: number
      externalState: ConnectionExternalState
      context: AccountActionContext
      grantRef: string
    }>,
    operation: 'revoke' | 'delete',
    lifecycle: 'revoked' | 'deleted',
    allowedFrom: readonly ConnectionLifecycle[],
  ): Promise<Connection> {
    const ref = connectionRef(input.connectionRef)
    const expectedGeneration = validExpectedGeneration(input.expectedGeneration)
    const externalState = validExternalState(input.externalState)
    return await this.#withAuthority(operation, input.context, input.grantRef, ref, undefined, async (snapshot, action, timestamp) => {
      return await this.#store.transact(async (transaction) => {
        const replay = await transaction.getLifecycleCommandByIdempotency(snapshot.activeAccountRef, action.idempotencyRef)
        if (replay !== undefined) {
          return replayLifecycleCommand(replay, operation, ref, expectedGeneration, externalState, action)
        }
        const current = await requiredConnection(transaction, ref)
        if (current.owningAccountRef !== snapshot.activeAccountRef) throw new ConnectionLifecycleError('connection_access_denied')
        if (!allowedFrom.includes(current.lifecycle)) throw new ConnectionLifecycleError('connection_not_active')
        if (current.generation !== expectedGeneration) throw new ConnectionLifecycleError('connection_generation_stale')
        if (timestamp < current.updatedAt) throw new ConnectionLifecycleError('connection_timestamp_invalid')
        const transitioned = freezeConnection({
          ...current,
          externalState,
          lifecycle,
          generation: current.generation + 1,
          revision: current.revision + 1,
          updatedAt: timestamp,
          action,
        })
        await transaction.replaceConnection(transitioned, current.revision)
        await transaction.insertLifecycleCommand(freezeLifecycleCommand({
          operation,
          connectionRef: ref,
          expectedGeneration,
          requestedExternalState: externalState,
          action,
          result: transitioned,
        }))
        return transitioned
      })
    })
  }

  async #withAuthority<Result>(
    operation: ConnectionOperation,
    context: AccountActionContext,
    grantRefInput: string,
    connectionRefInput: ConnectionRef | undefined,
    counterpartyAccountRef: AccountRef | undefined,
    consequence: (snapshot: ConnectionActionSnapshot, action: ConnectionAction, timestamp: number) => Promise<Result>,
  ): Promise<Result> {
    const requestTime = validTimestamp(this.#now())
    const validContext = Object.freeze({
      actorPrincipalRef: principalRef(context.actorPrincipalRef),
      activeAccountRef: accountRef(context.activeAccountRef),
      correlationRef: validOpaque(context.correlationRef, 'connection_authority_invalid'),
      idempotencyRef: validOpaque(context.idempotencyRef, 'connection_authority_invalid'),
    })
    const grantRef = validOpaque(grantRefInput, 'connection_authority_invalid')
    return await this.#authority.withCurrentAuthority({
      operation,
      context: validContext,
      grantRef,
      ...(connectionRefInput === undefined ? {} : { connectionRef: connectionRefInput }),
      ...(counterpartyAccountRef === undefined ? {} : { counterpartyAccountRef }),
      now: requestTime,
    }, async (snapshotInput) => {
      const consequenceTime = validTimestamp(this.#now())
      if (consequenceTime < requestTime) throw new ConnectionLifecycleError('connection_timestamp_invalid')
      const snapshot = validAuthoritySnapshot(snapshotInput, validContext, grantRef, consequenceTime)
      const action = Object.freeze({
        operation,
        actorPrincipalRef: snapshot.actorPrincipalRef,
        activeAccountRef: snapshot.activeAccountRef,
        grantRef: snapshot.grantRef,
        grantGeneration: snapshot.grantGeneration,
        correlationRef: validContext.correlationRef,
        idempotencyRef: validContext.idempotencyRef,
        occurredAt: consequenceTime,
      })
      return await consequence(snapshot, action, consequenceTime)
    })
  }
}

export function connectionEffectRef(value: string): ConnectionEffectRef {
  if (!CONNECTION_EFFECT_REF_PATTERN.test(value)) throw new ConnectionLifecycleError('connection_ref_invalid')
  return value as ConnectionEffectRef
}

function generateStableRef<Ref extends string>(
  prefix: string,
  randomUuid: () => string,
  validate: (value: string) => Ref,
): Ref {
  const uuid = randomUuid()
  if (!UUID_PATTERN.test(uuid)) throw new ConnectionLifecycleError('connection_ref_invalid')
  return validate(`${prefix}_${uuid.replaceAll('-', '')}`)
}

function validTimestamp(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new ConnectionLifecycleError('connection_timestamp_invalid')
  return value
}

function validPositiveGeneration(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new ConnectionLifecycleError('connection_authority_invalid')
  return value
}

function validExpectedGeneration(value: number): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new ConnectionLifecycleError('connection_generation_stale')
  return value
}

function validOpaque(value: string, code: ConnectionLifecycleErrorCode): string {
  if (!OPAQUE_REF_PATTERN.test(value)) throw new ConnectionLifecycleError(code)
  return value
}

function validExternalState(state: ConnectionExternalState): ConnectionExternalState {
  if (state.kind === 'known') {
    if (!CONNECTION_EXTERNAL_STATES.includes(state.value)) throw new ConnectionLifecycleError('connection_external_state_invalid')
    return Object.freeze({ kind: 'known', value: state.value })
  }
  if (state.kind !== 'unknown' || !OPAQUE_REF_PATTERN.test(state.value) || CONNECTION_EXTERNAL_STATES.includes(state.value as KnownConnectionExternalState)) {
    throw new ConnectionLifecycleError('connection_external_state_invalid')
  }
  return Object.freeze({ kind: 'unknown', value: state.value })
}

function externalStatesEqual(left: ConnectionExternalState, right: ConnectionExternalState): boolean {
  return left.kind === right.kind && left.value === right.value
}

function assertReplayAuthority(left: ConnectionAction, right: ConnectionAction): void {
  if (left.actorPrincipalRef !== right.actorPrincipalRef
    || left.grantRef !== right.grantRef
    || left.grantGeneration !== right.grantGeneration) {
    throw new ConnectionLifecycleError('connection_idempotency_conflict')
  }
}

function replayLifecycleCommand(
  command: ConnectionLifecycleCommand,
  operation: ConnectionLifecycleCommand['operation'],
  connectionRefInput: ConnectionRef,
  expectedGeneration: number,
  externalState: ConnectionExternalState,
  action: ConnectionAction,
): Connection {
  assertReplayAuthority(command.action, action)
  if (command.operation !== operation
    || command.connectionRef !== connectionRefInput
    || command.expectedGeneration !== expectedGeneration
    || !externalStatesEqual(command.requestedExternalState, externalState)) {
    throw new ConnectionLifecycleError('connection_idempotency_conflict')
  }
  return command.result
}

function validAuthoritySnapshot(
  snapshot: ConnectionActionSnapshot,
  context: AccountActionContext,
  grantRef: string,
  timestamp: number,
): ConnectionActionSnapshot {
  const actorPrincipalRef = principalRef(snapshot.actorPrincipalRef)
  const activeAccountRef = accountRef(snapshot.activeAccountRef)
  const snapshotGrantRef = validOpaque(snapshot.grantRef, 'connection_authority_invalid')
  const grantGeneration = validPositiveGeneration(snapshot.grantGeneration)
  const grantExpiresAt = validTimestamp(snapshot.grantExpiresAt)
  if (actorPrincipalRef !== context.actorPrincipalRef || activeAccountRef !== context.activeAccountRef || snapshotGrantRef !== grantRef) {
    throw new ConnectionLifecycleError('connection_authority_invalid')
  }
  if (grantExpiresAt <= timestamp) throw new ConnectionLifecycleError('connection_grant_expired')
  return Object.freeze({ actorPrincipalRef, activeAccountRef, grantRef: snapshotGrantRef, grantGeneration, grantExpiresAt })
}

async function requiredConnection(transaction: ConnectionLifecycleTransaction, ref: ConnectionRef): Promise<Connection> {
  const connection = await transaction.getConnection(ref)
  if (connection === undefined) throw new ConnectionLifecycleError('connection_not_found')
  return connection
}

function requireUsableConnection(connection: Connection): void {
  if (connection.lifecycle !== 'active') throw new ConnectionLifecycleError('connection_not_active')
  if (connection.externalState.kind !== 'known' || connection.externalState.value !== 'ready') {
    throw new ConnectionLifecycleError('connection_external_state_untrusted')
  }
}

async function requireConnectionAccess(
  transaction: ConnectionLifecycleTransaction,
  connection: Connection,
  activeAccountRef: AccountRef,
): Promise<void> {
  if (connection.owningAccountRef === activeAccountRef) return
  if (await transaction.getActiveShare(connection.connectionRef, activeAccountRef) === undefined) {
    throw new ConnectionLifecycleError('connection_access_denied')
  }
}

function requireCurrentLease(
  lease: ConnectionLease,
  connection: Connection,
  snapshot: ConnectionActionSnapshot,
  timestamp: number,
): void {
  if (lease.expiresAt <= timestamp) throw new ConnectionLifecycleError('connection_lease_expired')
  if (lease.connectionRef !== connection.connectionRef
    || lease.connectionGeneration !== connection.generation
    || lease.owningAccountRef !== connection.owningAccountRef) {
    throw new ConnectionLifecycleError('connection_lease_stale')
  }
  if (lease.activeAccountRef !== snapshot.activeAccountRef || lease.actorPrincipalRef !== snapshot.actorPrincipalRef) {
    throw new ConnectionLifecycleError('connection_access_denied')
  }
  if (lease.grantRef !== snapshot.grantRef || lease.grantGeneration !== snapshot.grantGeneration) {
    throw new ConnectionLifecycleError('connection_grant_stale')
  }
}

function freezeConnection(connection: Connection): Connection {
  return Object.freeze({
    ...connection,
    installedExternalState: Object.freeze({ ...connection.installedExternalState }),
    externalState: Object.freeze({ ...connection.externalState }),
    installAction: Object.freeze({ ...connection.installAction }),
    action: Object.freeze({ ...connection.action }),
  })
}

function freezeLease(lease: ConnectionLease): ConnectionLease {
  return Object.freeze({ ...lease, action: Object.freeze({ ...lease.action }) })
}

function freezeShare(share: ConnectionShare): ConnectionShare {
  return Object.freeze({ ...share, action: Object.freeze({ ...share.action }) })
}

function freezeAdmission(admission: ConnectionEffectAdmission): ConnectionEffectAdmission {
  return Object.freeze({ ...admission, action: Object.freeze({ ...admission.action }) })
}

function freezeLifecycleCommand(command: ConnectionLifecycleCommand): ConnectionLifecycleCommand {
  return Object.freeze({
    ...command,
    requestedExternalState: Object.freeze({ ...command.requestedExternalState }),
    action: Object.freeze({ ...command.action }),
    result: command.result,
  })
}
