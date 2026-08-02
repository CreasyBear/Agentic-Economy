import { describe, expect, it, vi } from 'vitest'

import { handleWorkTreeAgentAction } from '@/lib/server/work-tree-agent-api'
import { handleWorkTreeSetup } from '@/lib/server/work-tree-setup-api'
import {
  seedWorkTreeCohortThroughSource,
  WORK_TREE_SETUP_EVIDENCE_CLASS,
  type WorkTreeSetupInput,
} from '@/modules/work-tree/setup.functions'
import type { WorkTreeReadback } from '@/modules/work-tree/work-tree.functions'

const setupToken = 'setup-secret-value'
const request: WorkTreeSetupInput = {
  cohort: 'bas-development',
  evidenceClass: WORK_TREE_SETUP_EVIDENCE_CLASS,
  ownerSubject: 'user_preview',
  operationKey: 't51:setup:one',
  createIdempotencyKey: 't51:create:one',
  charterText: 'My BAS is overdue and my books are a mess',
  sourceRevision: 'a'.repeat(40),
  vercelDeploymentId: 'dpl_preview_123',
  convexDeploymentId: 'happy-animal-123',
  convexUrl: 'https://happy-animal-123.convex.cloud',
}

function jsonRequest(body: unknown, authorization = `Bearer ${setupToken}`): Request {
  return new Request('https://preview.example.test/api/v1/work-tree/setup', {
    method: 'POST',
    headers: { Authorization: authorization, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

describe('WorkTree deployment setup route', () => {
  it('red: the old operation route does not expose setup as an agent action', async () => {
    const response = await handleWorkTreeAgentAction(new Request('https://preview.example.test/api/v1/work-tree/setup', { method: 'POST' }), 'setup')
    expect(response.status).toBe(404)
    await expect(response.json()).resolves.toEqual({ kind: 'refused', code: 'unknown_action' })
  })

  it('refuses missing and invalid setup tokens before invoking the source', async () => {
    const seed = vi.fn(async () => ({ kind: 'accepted' as const, ...request, projectId: 'project:one', wrongPrincipalProjectId: 'project:foreign', sharedPrincipalRef: 'owner:user_preview', setupRef: 'setup:one', releaseIdentity: { sourceRevision: request.sourceRevision, vercelDeploymentId: request.vercelDeploymentId, convexDeploymentId: request.convexDeploymentId, convexUrl: request.convexUrl } }))
    const env = { AE_WORK_TREE_SETUP_TOKEN: setupToken }

    const missing = await handleWorkTreeSetup(jsonRequest(request, ''), { env, seed })
    const invalid = await handleWorkTreeSetup(jsonRequest(request, 'Bearer wrong-token'), { env, seed })

    expect(missing.status).toBe(401)
    expect(invalid.status).toBe(401)
    expect(seed).not.toHaveBeenCalled()
  })

  it('accepts an exact retry and refuses an identity mismatch before source writes', async () => {
    const result = { kind: 'accepted' as const, ...request, projectId: 'project:one', wrongPrincipalProjectId: 'project:foreign', sharedPrincipalRef: 'owner:user_preview', setupRef: 'setup:one', releaseIdentity: { sourceRevision: request.sourceRevision, vercelDeploymentId: request.vercelDeploymentId, convexDeploymentId: request.convexDeploymentId, convexUrl: request.convexUrl } }
    const seed = vi.fn(async () => result)
    const env = { AE_WORK_TREE_SETUP_TOKEN: setupToken }
    const observedIdentity = { sourceRevision: request.sourceRevision, vercelDeploymentId: request.vercelDeploymentId, convexDeploymentId: request.convexDeploymentId, convexUrl: request.convexUrl }

    const first = await handleWorkTreeSetup(jsonRequest(request), { env, seed, observedIdentity })
    const retry = await handleWorkTreeSetup(jsonRequest(request), { env, seed, observedIdentity })
    const mismatched = await handleWorkTreeSetup(jsonRequest({ ...request, sourceRevision: 'b'.repeat(40) }), { env, seed, observedIdentity })
    const unavailable = await handleWorkTreeSetup(jsonRequest(request), { env, seed })

    expect(first.status).toBe(200)
    expect(retry.status).toBe(200)
    expect(mismatched.status).toBe(409)
    expect(unavailable.status).toBe(503)
    expect(seed).toHaveBeenCalledTimes(2)
  })
  it('derives observed release identity from the source-owned release readback', async () => {
    const seed = vi.fn(async () => ({ kind: 'accepted' as const, ...request, projectId: 'project:source-readback', wrongPrincipalProjectId: 'project:foreign', sharedPrincipalRef: 'owner:user_preview', setupRef: 'setup:source-readback', releaseIdentity: { sourceRevision: request.sourceRevision, vercelDeploymentId: request.vercelDeploymentId, convexDeploymentId: request.convexDeploymentId, convexUrl: request.convexUrl } }))
    const env = {
      AE_WORK_TREE_SETUP_TOKEN: setupToken,
      VERCEL: '1',
      VERCEL_ENV: 'production',
      VERCEL_TARGET_ENV: 'production',
      VERCEL_GIT_PROVIDER: 'github',
      VERCEL_GIT_REPO_OWNER: 'CreasyBear',
      VERCEL_GIT_REPO_SLUG: 'Agentic-Economy',
      VERCEL_GIT_COMMIT_SHA: request.sourceRevision,
      VERCEL_DEPLOYMENT_ID: request.vercelDeploymentId,
      VERCEL_URL: 'agentic-economy-phi.vercel.app',
      VERCEL_PROJECT_PRODUCTION_URL: 'agentic-economy-phi.vercel.app',
      CONVEX_DEPLOYMENT_ID: request.convexDeploymentId,
      CONVEX_URL: request.convexUrl,
    }

    const response = await handleWorkTreeSetup(jsonRequest(request), { env, seed })

    expect(response.status).toBe(200)
    expect(seed).toHaveBeenCalledOnce()
  })
  it('accepts a production-shaped Convex apply receipt and returns a decision-ready setup readback', async () => {
    const source = productionShapedSetupSource()
    const observedIdentity = {
      sourceRevision: request.sourceRevision,
      vercelDeploymentId: request.vercelDeploymentId,
      convexDeploymentId: request.convexDeploymentId,
      convexUrl: request.convexUrl,
    }
    const env = {
      AE_WORK_TREE_SETUP_TOKEN: setupToken,
      AE_CONVEX_SERVER_FUNCTION_TOKEN: 'x'.repeat(32),
    }
    const response = await handleWorkTreeSetup(jsonRequest(request), {
      env,
      observedIdentity,
      seed: (input) => seedWorkTreeCohortThroughSource({ ...input, source }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      kind: 'accepted',
      projectId: 'project:1',
      wrongPrincipalProjectId: 'project:2',
    })
  })
})

function productionShapedSetupSource() {
  const projects = new Map<string, string>()
  return {
    create: vi.fn(async (input: { idempotencyKey: string }) => {
      const projectId = projects.get(input.idempotencyKey) ?? `project:${projects.size + 1}`
      projects.set(input.idempotencyKey, projectId)
      return {
        kind: 'accepted' as const,
        code: 'work_tree_created' as const,
        replayed: false as const,
        readback: readback(projectId),
        receipt: receipt(projectId),
      }
    }),
    inspect: vi.fn(async (input: { projectId: string }) => ({
      kind: 'accepted' as const,
      readback: readback(input.projectId),
    })),
    apply: vi.fn(async (input: { projectId: string; operationKey: string }) => ({
      kind: 'applied' as const,
      replayed: false,
      projectId: input.projectId,
      tree: readback(input.projectId).tree,
      operationKey: input.operationKey,
      seq: 1,
      event: { kind: 'elaborated' as const, operationKey: input.operationKey, seq: 1 },
    })),
  }
}

describe('source-owned setup adapter', () => {
  it('uses only WorkTree source calls and keeps owner setup idempotent', async () => {
    let lastInspectReadback: WorkTreeReadback | undefined
    const projects = new Map<string, string>()
    const create = vi.fn(async (input: { idempotencyKey: string; charterText: string }) => {
      const prior = projects.get(input.idempotencyKey)
      if (prior !== undefined && input.charterText !== request.charterText) return { kind: 'refused' as const, code: 'idempotency_conflict' as const, replayed: false as const }
      const projectId = prior ?? `project:${projects.size + 1}`
      projects.set(input.idempotencyKey, projectId)
      const result = {
        code: 'work_tree_created' as const,
        readback: readback(projectId),
        receipt: receipt(projectId),
      }
      return prior === undefined
        ? { kind: 'accepted' as const, replayed: false as const, ...result }
        : { kind: 'replayed' as const, replayed: true as const, ...result }
    })
    const inspect = vi.fn(async (input: { projectId: string }) => {
      lastInspectReadback = readback(input.projectId)
      return { kind: 'accepted' as const, readback: lastInspectReadback }
    })
    const apply = vi.fn(async (input: { projectId: string; operationKey: string }) => ({
      kind: 'applied' as const,
      replayed: false as const,
      projectId: input.projectId,
      tree: readback(input.projectId).tree,
      operationKey: input.operationKey,
      seq: 1,
      event: { kind: 'elaborated' as const, operationKey: input.operationKey, seq: 1 },
    }))
    const source = { create, inspect, apply }
    const env = { AE_CONVEX_SERVER_FUNCTION_TOKEN: 'x'.repeat(32) }

    const first = await seedWorkTreeCohortThroughSource({ request, env, source })
    const retry = await seedWorkTreeCohortThroughSource({ request, env, source })
    const changed = await seedWorkTreeCohortThroughSource({ request: { ...request, charterText: 'Changed charter' }, env, source })

    expect(first).toMatchObject({ kind: 'accepted', projectId: 'project:1', wrongPrincipalProjectId: 'project:2' })
    expect(lastInspectReadback).toMatchObject({ tree: { nodes: expect.arrayContaining([expect.objectContaining({ kind: 'decision', status: 'ready' })]) } })
    expect(retry).toMatchObject({ kind: 'replayed', projectId: 'project:1', wrongPrincipalProjectId: 'project:2' })
    expect(inspect).toHaveBeenCalledTimes(2)
    expect(create.mock.calls[0]?.[0]).not.toHaveProperty('ownerSubject')
  })
})

function readback(projectId: string) {
  const tree = {
    format: 'ae.work-tree:v1' as const,
    treeId: `${projectId}:tree`,
    projectId,
    generation: 1,
    revision: 1,
    charterText: request.charterText,
    nodes: [{
      format: 'ae.work-node:v1' as const,
      nodeId: `${projectId}:root`,
      kind: 'package' as const,
      title: request.charterText,
      status: 'fog' as const,
      dependsOn: [],
      priority: 0,
      authorityRef: 'principal:test',
      evidenceRefs: [],
      createdAt: 1,
      updatedAt: 1,
    }, {
      format: 'ae.work-node:v1' as const,
      nodeId: `${projectId}:decision`,
      parentId: `${projectId}:root`,
      kind: 'decision' as const,
      title: 'Choose a BAS path',
      description: 'Development mock decision',
      status: 'ready' as const,
      dependsOn: [],
      priority: 1,
      authorityRef: 'principal:test',
      evidenceRefs: ['ae:development-mock/bas-v1'],
      createdAt: 1,
      updatedAt: 1,
    }],
  }
  return { projectId, treeId: tree.treeId, lineage: { kind: 'standalone' as const }, generation: 1, revision: 1, tree, events: [{ seq: 1, kind: 'decision_proposed' as const, operationKey: `${projectId}:development-mock:propose-decision`, generation: 1, revision: 1, payloadDigest: 'sha256:test', at: 1 }], receipts: [], hasMoreEvents: false }
}

function receipt(projectId: string) {
  return {
    receiptRef: `${projectId}:receipt`,
    projectId,
    treeId: `${projectId}:tree`,
    operationKey: `${projectId}:create`,
    event: { kind: 'created' as const, operationKey: `${projectId}:create`, seq: 1 as const },
    generation: 1 as const,
    revision: 1 as const,
    payloadDigest: 'sha256:test',
    lineage: { kind: 'standalone' as const },
  }
}
