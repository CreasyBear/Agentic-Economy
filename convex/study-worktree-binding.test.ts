/// <reference types="vite/client" />
import { anyApi } from 'convex/server'
import { convexTest, type TestConvex } from 'convex-test'
import { describe, expect, it } from 'vitest'

import { canonicalDigest } from '../src/modules/common/canonical-digest'
import { gardenerVerbDigest, gardenerVerbSchema } from '../src/modules/work-tree/convex'
import schema from './schema'

const modules = import.meta.glob('./**/*.ts')
const workTreesApi = anyApi.workTrees
if (workTreesApi === undefined) throw new Error('work_tree_api_missing')

function requireApiBinding<T>(binding: T | undefined, errorMessage: string): T {
  if (binding === undefined) throw new Error(errorMessage)
  return binding
}

const applyWorkTree = requireApiBinding(workTreesApi.apply, 'work_tree_apply_missing')
const inspectWorkTree = requireApiBinding(workTreesApi.inspect, 'work_tree_inspect_missing')


const tree = {
  format: 'ae.work-tree:v1' as const,
  treeId: 'tree:study-binding',
  projectId: 'project:study-binding',
  generation: 1,
  revision: 1,
  charterText: 'A labelled development Study target.',
  nodes: [
    {
      format: 'ae.work-node:v1' as const,
      nodeId: 'root',
      kind: 'package' as const,
      title: 'Root',
      status: 'ready' as const,
      timing: { certainty: 'fog' as const },
      dependsOn: [],
      priority: 0,
      evidenceRefs: [],
      createdAt: 1,
      updatedAt: 1,
    },
    {
      format: 'ae.work-node:v1' as const,
      nodeId: 'study-node',
      kind: 'study' as const,
      title: 'Compare labelled supply',
      status: 'ready' as const,
      parentId: 'root',
      timing: { certainty: 'fog' as const },
      dependsOn: [],
      priority: 0,
      evidenceRefs: [],
      createdAt: 1,
      updatedAt: 1,
    },
    {
      format: 'ae.work-node:v1' as const,
      nodeId: 'decision-node',
      kind: 'decision' as const,
      title: 'Choose a provider',
      status: 'ready' as const,
      parentId: 'root',
      dependsOn: [],
      priority: 0,
      evidenceRefs: [],
      createdAt: 1,
      updatedAt: 1,
    },
  ],
}

function studyVerb() {
  const unsigned = gardenerVerbSchema.parse({
    kind: 'study',
    targetNodeId: 'study-node',
    expectedGeneration: 1,
    expectedRevision: 1,
    proposalDigest: 'pending',
    studyBrief: 'Compare labelled development supply.',
    criteriaFromCharter: ['price'],
  })
  return { ...unsigned, proposalDigest: gardenerVerbDigest(unsigned) }
}

async function seedTree(backend: TestConvex<typeof schema>) {
  await backend.run(async (ctx) => {
    await ctx.db.insert('workTrees', {
      projectId: tree.projectId,
      treeId: tree.treeId,
      principalId: 'principal:study-binding',
      ownerId: 'owner:study-binding',
      lineageJson: JSON.stringify({ kind: 'standalone' }),
      lineageDigest: canonicalDigest({ kind: 'standalone' }),
      createIdempotencyKey: 'seed:study-binding',
      createPayloadDigest: canonicalDigest({ projectId: tree.projectId, treeId: tree.treeId }),
      creationOperationKey: 'seed:create:study-binding',
      generation: tree.generation,
      revision: tree.revision,
      snapshotJson: JSON.stringify(tree),
      snapshotDigest: canonicalDigest(tree),
      createdAt: 1,
      updatedAt: 1,
    })
  })
}

describe('WorkTree Study binding seam', () => {

  it('applies study to the Study node and cold-inspects the durable studying projection', async () => {
    const backend = convexTest(schema, modules)
    await seedTree(backend)
    const owner = backend.withIdentity({
      subject: 'owner:study-binding',
      issuer: 'https://identity.example',
      tokenIdentifier: 'principal:study-binding',
    })
    const operationKey = 'study-binding:start'
    const applied = await owner.mutation(applyWorkTree, {
      projectId: tree.projectId,
      operationKey,
      correlationId: operationKey,
      verb: studyVerb(),
    })
    expect(applied).toMatchObject({ kind: 'applied', replayed: false, tree: { revision: 2 } })
    expect(applied.tree.nodes.find((node: { nodeId: string }) => node.nodeId === 'study-node')).toMatchObject({
      nodeId: 'study-node',
      kind: 'study',
      status: 'studying',
    })

    const inspected = await owner.query(inspectWorkTree, { projectId: tree.projectId })
    expect(inspected).toMatchObject({
      kind: 'accepted',
      readback: {
        projectId: tree.projectId,
        revision: 2,
        tree: { revision: 2 },
        events: [{ kind: 'study_started', operationKey, revision: 2 }],
      },
    })
  })
})
