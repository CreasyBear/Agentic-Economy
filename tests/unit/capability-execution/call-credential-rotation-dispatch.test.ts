import { createWorker } from '../convex/capability-call-worker-harness'
import { describe, expect, it } from 'vitest'
import { getFunctionName } from 'convex/server'

import { prepareCallRun } from '@/modules/capability-execution/call-worker/runPreparation'

// A pending Call is keyed by the stable Principal tuple, so a credential
// rotation must not strand the buyer's in-flight purchase. Dispatch may run
// under the successor credential only while the grant that authorised the Call
// is still active for that Principal, and only while the successor credential
// is itself live. The Call keeps the credential it was admitted under as its
// effect identity; the successor is recorded as the dispatcher.

const ROTATED_CREDENTIAL = 'credential:test-worker-b'
const SUCCESSOR_GRANT_REF = 'grant:test-worker-successor'

type Row = Record<string, unknown>
type Worker = ReturnType<typeof createWorker>
type RunQuery = (reference: unknown, args?: Row) => Promise<unknown>

function functionPath(reference: unknown): string {
  return typeof reference === 'string' ? reference : getFunctionName(reference as never)
}

/** Mirrors `agentAccessPolicy.readActiveGrant`: an active, unexpired grant bound
 * to the requested credential, principal tuple, grantRef, and generation. */
function readActiveGrant(grants: readonly Row[], args: Row): Row | null {
  const now = typeof args.now === 'number' ? args.now : Date.now()
  return grants.find((grant) => grant.lifecycle === 'active'
    && Number(grant.expiresAt) > now
    && grant.credentialId === args.credentialId
    && grant.environment === args.environment
    && grant.principalId === args.principalId
    && grant.applicationRef === args.applicationRef
    && (args.grantRef === undefined || grant.grantRef === args.grantRef)
    && (args.ownerId === undefined || grant.ownerId === args.ownerId)
    && (args.generation === undefined || grant.generation === args.generation)) ?? null
}

function rotate(
  worker: Worker,
  patch: Readonly<{
    principal?: (row: Row) => Row | null
    grants?: (callGrant: Row) => readonly Row[]
  }>,
): void {
  const base = worker.ctx.runQuery as RunQuery
  worker.ctx.runQuery = async (reference: unknown, args?: Row) => {
    const path = functionPath(reference)
    const current = await base(reference, args)
    if (path === 'agentAccessPrincipals:getAgentPrincipal') {
      return patch.principal === undefined ? current : patch.principal(current as Row)
    }
    if (path === 'agentAccessPolicy:readActiveGrant') {
      const callGrant = current as Row
      const grants = patch.grants === undefined ? [callGrant] : patch.grants(callGrant)
      return readActiveGrant(grants, args ?? {})
    }
    return current
  }
}

function successorGrant(callGrant: Row): Row {
  return {
    ...callGrant,
    grantRef: SUCCESSOR_GRANT_REF,
    credentialId: ROTATED_CREDENTIAL,
    generation: 2,
  }
}

function rotatedPrincipal(row: Row): Row {
  return { ...row, credentialId: ROTATED_CREDENTIAL, grantGeneration: 2 }
}

async function prepare(worker: Worker) {
  return await prepareCallRun(
    worker.ctx as unknown as Parameters<typeof prepareCallRun>[0],
    { callRef: String(worker.state.dispatch.callRef) },
  )
}

function refusal(worker: Worker): Row | undefined {
  const record = worker.state.records.at(-1)
  return record?.result as Row | undefined
}

function claimActors(worker: Worker): readonly unknown[] {
  return worker.state.mutationCalls
    .filter(({ path }) => path === 'capabilityCalls:claimDispatch')
    .map(({ args }) => {
      const command = args.command as { row: { control: { owner: unknown } }; currentAttemptWrite: { actor: unknown } }
      return [command.row.control.owner, command.currentAttemptWrite.actor]
    })
}

/** The `dispatch` payload the worker sent to `capabilityCalls:claimDispatch` -
 * i.e. the Call row shape the mutation would persist, including the
 * `dispatchedCredentialId` evidence the worker call site threads onto it. */
function claimedDispatch(worker: Worker): Row | undefined {
  const call = worker.state.mutationCalls.find(({ path }) => path === 'capabilityCalls:claimDispatch')
  return call?.args.dispatch as Row | undefined
}

describe('call dispatch across a credential rotation', () => {
  it('dispatches under the successor credential while the Call grant is still active', async () => {
    const worker = createWorker('http')
    rotate(worker, {
      principal: rotatedPrincipal,
      grants: (callGrant) => [callGrant, successorGrant(callGrant)],
    })

    const prepared = await prepare(worker)

    expect(prepared.kind).toBe('prepared')
    if (prepared.kind !== 'prepared') return
    // The successor dispatches; the admitted credential stays on the Call.
    expect(prepared.dispatchedCredentialId).toBe(ROTATED_CREDENTIAL)
    expect(prepared.dispatch.credentialId).toBe('credential:test-worker')
    // The canonical claim stays bound to the credential that bought the Call.
    const actor = { callerRef: 'credential:test-worker', principalRef: 'principal:test-worker' }
    expect(claimActors(worker)).toEqual([[actor, actor]])
    expect(worker.state.records).toEqual([])
    // The claimed Call row records both identities: the admitted credential
    // stays put, and the successor that actually dispatched is recorded
    // alongside it.
    expect(claimedDispatch(worker)?.dispatchedCredentialId).toBe(ROTATED_CREDENTIAL)
    expect(claimedDispatch(worker)?.credentialId).toBe('credential:test-worker')
  })

  it('refuses when the grant that authorised the Call has been revoked', async () => {
    const worker = createWorker('http')
    rotate(worker, {
      principal: rotatedPrincipal,
      grants: (callGrant) => [
        { ...callGrant, lifecycle: 'revoked' },
        successorGrant(callGrant),
      ],
    })

    await expect(prepare(worker)).resolves.toEqual({ kind: 'recorded' })

    expect(refusal(worker)).toMatchObject({ kind: 'refused', code: 'grant_not_found' })
    expect(claimActors(worker)).toEqual([])
  })

  it('refuses a Principal that no longer matches the Call owner', async () => {
    const worker = createWorker('http')
    rotate(worker, {
      principal: (row) => ({ ...rotatedPrincipal(row), ownerId: 'owner:test-worker-other' }),
      grants: (callGrant) => [callGrant, successorGrant(callGrant)],
    })

    await expect(prepare(worker)).resolves.toEqual({ kind: 'recorded' })

    expect(refusal(worker)).toMatchObject({ kind: 'refused', code: 'grant_generation_stale' })
    expect(claimActors(worker)).toEqual([])
  })

  it('refuses when the rotated credential is not itself active', async () => {
    const worker = createWorker('http')
    rotate(worker, {
      principal: rotatedPrincipal,
      grants: (callGrant) => [callGrant, { ...successorGrant(callGrant), lifecycle: 'revoked' }],
    })

    await expect(prepare(worker)).resolves.toEqual({ kind: 'recorded' })

    expect(refusal(worker)).toMatchObject({ kind: 'refused', code: 'grant_generation_stale' })
    expect(claimActors(worker)).toEqual([])
  })

  it('refuses a Call carrying a grant generation ahead of its Principal', async () => {
    const worker = createWorker('http')
    rotate(worker, { principal: (row) => ({ ...row, grantGeneration: 0 }) })

    await expect(prepare(worker)).resolves.toEqual({ kind: 'recorded' })

    expect(refusal(worker)).toMatchObject({ kind: 'refused', code: 'grant_generation_stale' })
    expect(claimActors(worker)).toEqual([])
  })

  it('keeps dispatching without a rotation and never reads a successor grant', async () => {
    const worker = createWorker('http')
    rotate(worker, {})

    const prepared = await prepare(worker)

    expect(prepared.kind).toBe('prepared')
    if (prepared.kind !== 'prepared') return
    expect(prepared.dispatchedCredentialId).toBe('credential:test-worker')
    expect(worker.state.queryCalls.filter((path) => path === 'agentAccessPolicy:readActiveGrant'))
      .toHaveLength(1)
    // No rotation: the dispatcher recorded on the claim is the same
    // credential the Call was admitted under.
    expect(claimedDispatch(worker)?.dispatchedCredentialId).toBe('credential:test-worker')
    expect(claimedDispatch(worker)?.credentialId).toBe('credential:test-worker')
  })
})
