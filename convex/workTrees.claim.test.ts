/// <reference types="vite/client" />
import { describe, expect, it } from 'vitest'
import { anyApi } from 'convex/server'
import { convexTest } from 'convex-test'

import { mintBrowserGuestAssertion } from '../src/lib/server/browser-guest-assertion'
import { createCustomerRequestServiceAssertion } from '../src/modules/customer-request/service-auth-envelope'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const workTreesApi = anyApi.workTrees
if (workTreesApi === undefined) throw new Error('work_tree_api_missing')
function requireApiBinding<T>(binding: T | undefined, errorMessage: string): T {
  if (binding === undefined) throw new Error(errorMessage)
  return binding
}
const createWorkTree = requireApiBinding(workTreesApi.create, 'work_tree_create_missing')
const claimWorkTree = requireApiBinding(workTreesApi.claim, 'work_tree_claim_missing')
const inspectWorkTree = requireApiBinding(workTreesApi.inspect, 'work_tree_inspect_missing')

const signingKey = 'work-tree-claim-signing-key-that-is-at-least-32-bytes'
const guestSessionId = '123e4567-e89b-42d3-a456-426614174010'
const ownerIdentity = {
  subject: 'clerk-owner-t45',
  issuer: 'https://identity.example',
  tokenIdentifier: 'https://identity.example|clerk-owner-t45',
}

async function createGuestTree() {
  process.env.AE_CONVEX_SERVER_FUNCTION_TOKEN = signingKey
  const guestAssertion = await mintBrowserGuestAssertion(signingKey, {
    sessionId: guestSessionId,
    issuedAt: Date.now(),
  })
  const backend = convexTest(schema, modules)
  const created = await backend.mutation(createWorkTree, {
    idempotencyKey: 't45:create',
    charterText: 'Prepare a bounded BAS path.',
    lineage: { kind: 'standalone' },
    guestAssertion,
  })
  if (created.kind !== 'accepted') throw new Error(`guest tree create failed: ${JSON.stringify(created)}`)
  return { backend, guestAssertion, projectId: created.readback.projectId }
}

describe('T45 WorkTree owner claim', () => {
  it('claims the exact guest project once, preserves actor evidence, and grants owner-scoped inspection', async () => {
    const { backend, guestAssertion, projectId } = await createGuestTree()
    const owner = backend.withIdentity(ownerIdentity)
    const claimInput = { projectId, idempotencyKey: 't45:claim', guestAssertion }

    const claim = await owner.mutation(claimWorkTree, claimInput)
    expect(claim).toMatchObject({
      kind: 'accepted',
      code: 'work_tree_claimed',
      replayed: false,
      readback: { projectId },
      receipt: {
        projectId,
        actor: { source: expect.any(String) },
      },
    })
    if (claim.kind !== 'accepted') throw new Error(`claim failed: ${JSON.stringify(claim)}`)

    const ownerReadback = await owner.query(inspectWorkTree, { projectId })
    expect(ownerReadback).toMatchObject({ kind: 'accepted', readback: claim.readback })

    const agentPrincipal = {
      principalId: 'clerk_api_key:t45-agent',
      ownerId: ownerIdentity.subject,
      credentialId: 't45-agent',
      scopes: ['work_trees:inspect'],
    }
    const serviceAuth = await createCustomerRequestServiceAssertion({
      key: signingKey,
      operation: 'workTree.inspect',
      command: { projectId },
      principal: agentPrincipal,
      issuedAt: Date.now(),
    })
    const agentReadback = await backend.query(inspectWorkTree, { projectId, serviceAuth })
    expect(agentReadback).toEqual(ownerReadback)

    const oldGuest = await backend.query(inspectWorkTree, { projectId, guestAssertion })
    expect(oldGuest).toEqual({ kind: 'refused', code: 'forbidden' })

    const replay = await owner.mutation(claimWorkTree, claimInput)
    expect(replay).toMatchObject({
      kind: 'replayed',
      code: 'work_tree_claimed',
      replayed: true,
      readback: claim.readback,
      receipt: claim.receipt,
    })

    const wrongOwner = backend.withIdentity({
      subject: 'clerk-other-t45',
      issuer: ownerIdentity.issuer,
      tokenIdentifier: 'https://identity.example|clerk-other-t45',
    })
    const wrong = await wrongOwner.mutation(claimWorkTree, { ...claimInput, idempotencyKey: 't45:claim:other' })
    expect(wrong).toEqual({ kind: 'refused', code: 'forbidden', replayed: false })
    await expect(owner.query(inspectWorkTree, { projectId })).resolves.toEqual(ownerReadback)

    const sourceReadback = await backend.query(inspectWorkTree, { projectId, serviceAuth })
    expect(sourceReadback).toEqual(ownerReadback)
  })
})
