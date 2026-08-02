import { z } from 'zod'

import { callPublicSourceMutation, callPublicSourceQuery, sourceMutation, sourceQuery } from '@/lib/server/convex-source'
import { createCustomerRequestServiceAssertion, type CustomerRequestServiceAssertion } from '@/modules/customer-request/service-auth-envelope'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import type { StableHashValue } from '@/modules/common/stable-hash'

import {
  workTreeCreateResultSchema,
  workTreeInspectResultSchema,
  workTreeRawApplyReceiptSchema,
  type WorkTreeCreateResult,
  type WorkTreeInspectResult,
} from './work-tree.functions'
import { applyDevelopmentFixture, type WorkTreeSourcePort } from './internal/root-loop'
import type { GardenerVerb } from './internal/verbs'

export const WORK_TREE_SETUP_COHORT = 'bas-development' as const
export const WORK_TREE_SETUP_EVIDENCE_CLASS = 'hosted + development-mock' as const
export const WORK_TREE_SETUP_MAX_BODY_BYTES = 64 * 1024

const hostedRevisionSchema = z.string().regex(/^[a-f0-9]{40}$/iu)
const deploymentIdSchema = z.string().trim().min(1).max(200)
const deploymentUrlSchema = z.url().startsWith('https://')

export const workTreeSetupInputSchema = z.strictObject({
  cohort: z.literal(WORK_TREE_SETUP_COHORT),
  evidenceClass: z.literal(WORK_TREE_SETUP_EVIDENCE_CLASS),
  ownerSubject: z.string().trim().min(1).max(200),
  operationKey: z.string().trim().min(1).max(200),
  createIdempotencyKey: z.string().trim().min(1).max(200),
  charterText: z.string().trim().min(1).max(4_000),
  sourceRevision: hostedRevisionSchema,
  vercelDeploymentId: deploymentIdSchema,
  convexDeploymentId: deploymentIdSchema,
  convexUrl: deploymentUrlSchema,
})
export type WorkTreeSetupInput = z.infer<typeof workTreeSetupInputSchema>

export const workTreeSetupIdentitySchema = z.strictObject({
  sourceRevision: hostedRevisionSchema,
  vercelDeploymentId: deploymentIdSchema,
  convexDeploymentId: deploymentIdSchema,
  convexUrl: deploymentUrlSchema,
})
export type WorkTreeSetupIdentity = z.infer<typeof workTreeSetupIdentitySchema>

const workTreeSetupReadbackSchema = z.strictObject({
  kind: z.enum(['accepted', 'replayed']),
  cohort: z.literal(WORK_TREE_SETUP_COHORT),
  evidenceClass: z.literal(WORK_TREE_SETUP_EVIDENCE_CLASS),
  ownerSubject: z.string().min(1),
  projectId: z.string().min(1),
  wrongPrincipalProjectId: z.string().min(1),
  createIdempotencyKey: z.string().min(1),
  charterText: z.string().min(1),
  sharedPrincipalRef: z.string().min(1),
  setupRef: z.string().min(1),
  releaseIdentity: workTreeSetupIdentitySchema,
})
export type WorkTreeSetupReadback = z.infer<typeof workTreeSetupReadbackSchema>

export const workTreeSetupResultSchema = z.union([
  workTreeSetupReadbackSchema,
  z.strictObject({ kind: z.literal('refused'), code: z.enum(['authentication_required', 'invalid_input', 'idempotency_conflict', 'source_unavailable', 'release_identity_mismatch']) }),
])
export type WorkTreeSetupResult = z.infer<typeof workTreeSetupResultSchema>
type CreateCommand = Readonly<{
  idempotencyKey: string
  charterText: string
  lineage: { kind: 'standalone' }
  serviceAuth: CustomerRequestServiceAssertion
}>

type InspectCommand = Readonly<{
  projectId: string
  serviceAuth: CustomerRequestServiceAssertion
}>

type ApplyCommand = Readonly<{
  projectId: string
  operationKey: string
  correlationId: string
  verb: GardenerVerb
  serviceAuth: CustomerRequestServiceAssertion
}>

const workTreeSetupApplyResultSchema = z.discriminatedUnion('kind', [
  workTreeRawApplyReceiptSchema,
  z.strictObject({
    kind: z.literal('refused'),
    code: z.enum(['authentication_required', 'forbidden']),
    replayed: z.literal(false),
  }),
])
export type WorkTreeSetupApplyResult = z.infer<typeof workTreeSetupApplyResultSchema>

export type WorkTreeSetupSourcePort = Readonly<{
  create: (input: CreateCommand) => Promise<WorkTreeCreateResult>
  inspect: (input: InspectCommand) => Promise<WorkTreeInspectResult>
  apply: (input: ApplyCommand) => Promise<WorkTreeSetupApplyResult>
}>

const createMutation = sourceMutation<CreateCommand, WorkTreeCreateResult>('workTrees:create')
const inspectQuery = sourceQuery<InspectCommand, WorkTreeInspectResult>('workTrees:inspect')
const applyMutation = sourceMutation<ApplyCommand, WorkTreeSetupApplyResult>('workTrees:apply')

const productionSourcePort: WorkTreeSetupSourcePort = {
  create: async (input) => await workTreeCreateResultSchema.parseAsync(await callPublicSourceMutation(createMutation, input)),
  inspect: async (input) => await workTreeInspectResultSchema.parseAsync(await callPublicSourceQuery(inspectQuery, input)),
  apply: async (input) => await workTreeSetupApplyResultSchema.parseAsync(await callPublicSourceMutation(applyMutation, input)),
}

export function workTreeSetupDigest(input: WorkTreeSetupInput): string {
  return canonicalDigest({ contract: 'ae.work-tree-setup:v1', ...input })
}

/**
 * Seeds exactly two bounded WorkTrees through the owning WorkTree source
 * functions. The first is bound to the configured Clerk owner; the second is
 * a deterministic foreign owner used only to prove an authorization refusal.
 */
export async function seedWorkTreeCohortThroughSource(input: Readonly<{
  request: WorkTreeSetupInput
  env?: Record<string, string | undefined>
  now?: () => number
  source?: WorkTreeSetupSourcePort
}>): Promise<WorkTreeSetupResult> {
  const request = workTreeSetupInputSchema.parse(input.request)
  const source = input.source ?? productionSourcePort
  const key = (input.env ?? process.env).AE_CONVEX_SERVER_FUNCTION_TOKEN?.trim()
  if (key === undefined || key.length < 32) return { kind: 'refused', code: 'source_unavailable' }

  const setupRef = `work-tree-setup:${workTreeSetupDigest(request)}`
  const now = input.now ?? Date.now
  const ownerPrincipalId = `clerk_user:${request.ownerSubject}`
  const ownerCredentialId = `t51:setup:${workTreeSetupDigest(request).slice(7, 71)}`
  const ownerCreateCommand = {
    idempotencyKey: request.createIdempotencyKey,
    charterText: request.charterText,
    lineage: { kind: 'standalone' as const },
  }
  const ownerAuth = await createCustomerRequestServiceAssertion({
    key,
    operation: 'workTree.create',
    command: ownerCreateCommand,
    principal: {
      principalId: ownerPrincipalId,
      ownerId: request.ownerSubject,
      credentialId: ownerCredentialId,
      scopes: ['work_trees:create'],
    },
    issuedAt: now(),
  })

  let ownerCreate: WorkTreeCreateResult
  try {
    ownerCreate = workTreeCreateResultSchema.parse(await source.create({ ...ownerCreateCommand, serviceAuth: ownerAuth }))
  } catch {
    return { kind: 'refused', code: 'source_unavailable' }
  }
  if (ownerCreate.kind === 'refused') {
    return {
      kind: 'refused',
      code: ownerCreate.code === 'idempotency_conflict' ? 'idempotency_conflict' : 'source_unavailable',
    }
  }

  const ownerFixturePort: WorkTreeSourcePort = {
    create: async () => ({ kind: 'refused', reason: 'setup_fixture_create_unreachable' }),
    inspect: async () => ({ kind: 'refused', reason: 'setup_fixture_inspect_unreachable' }),
    apply: async (command) => {
      const serviceAuth = await createCustomerRequestServiceAssertion({
        key,
        operation: 'workTree.apply',
        command: command as StableHashValue,
        principal: {
          principalId: ownerPrincipalId,
          ownerId: request.ownerSubject,
          credentialId: ownerCredentialId,
          scopes: ['work_trees:apply'],
        },
        issuedAt: now(),
      })
      const raw = await source.apply({ ...command, serviceAuth })
      const parsed = workTreeRawApplyReceiptSchema.safeParse(raw)
      if (parsed.success) {
        const receipt = parsed.data
        return {
          kind: receipt.kind === 'replayed' ? 'replayed' : 'accepted',
          receipt: { tree: receipt.tree, operationKey: receipt.operationKey },
          readback: { projectId: receipt.projectId, revision: receipt.tree.revision },
        }
      }
      if (typeof raw === 'object' && raw !== null && 'kind' in raw && raw.kind === 'refused') {
        return { kind: 'refused', reason: 'code' in raw && typeof raw.code === 'string' ? raw.code : 'source_refused' }
      }
      return { kind: 'unknown', reason: 'setup_fixture_apply_invalid' }
    },
    decide: async () => {
      throw new Error('setup_fixture_decide_unreachable')
    },
  }
  const fixtureRefusal = await applyDevelopmentFixture({
    projectId: ownerCreate.readback.projectId,
    tree: ownerCreate.readback.tree,
  }, ownerFixturePort)
  if (fixtureRefusal !== undefined) return { kind: 'refused', code: 'source_unavailable' }
  const foreignOwner = `t51-foreign:${workTreeSetupDigest(request).slice(7, 71)}`
  const foreignCreateCommand = {
    idempotencyKey: `t51:foreign:${workTreeSetupDigest(request)}`,
    charterText: request.charterText,
    lineage: { kind: 'standalone' as const },
  }
  const foreignAuth = await createCustomerRequestServiceAssertion({
    key,
    operation: 'workTree.create',
    command: foreignCreateCommand,
    principal: {
      principalId: foreignOwner,
      ownerId: foreignOwner,
      credentialId: `t51:setup-foreign:${workTreeSetupDigest(request).slice(7, 71)}`,
      scopes: ['work_trees:create'],
    },
    issuedAt: now(),
  })

  let foreignCreate: WorkTreeCreateResult
  try {
    foreignCreate = workTreeCreateResultSchema.parse(await source.create({ ...foreignCreateCommand, serviceAuth: foreignAuth }))
  } catch {
    return { kind: 'refused', code: 'source_unavailable' }
  }
  if (foreignCreate.kind === 'refused') return { kind: 'refused', code: 'source_unavailable' }

  let ownerInspect: WorkTreeInspectResult
  try {
    ownerInspect = workTreeInspectResultSchema.parse(await source.inspect({
      projectId: ownerCreate.readback.projectId,
      serviceAuth: await createCustomerRequestServiceAssertion({
        key,
        operation: 'workTree.inspect',
        command: { projectId: ownerCreate.readback.projectId },
        principal: {
          principalId: ownerPrincipalId,
          ownerId: request.ownerSubject,
          credentialId: ownerCredentialId,
          scopes: ['work_trees:inspect'],
        },
        issuedAt: now(),
      }),
    }))
  } catch {
    return { kind: 'refused', code: 'source_unavailable' }
  }
  if (ownerInspect.kind !== 'accepted') return { kind: 'refused', code: 'source_unavailable' }
  const hasReadyDecision = ownerInspect.readback.tree.nodes.some((node) => node.kind === 'decision' && node.status === 'ready')
  const hasProposal = ownerInspect.readback.events.some((event) => event.kind === 'decision_proposed')
  if (!hasReadyDecision || !hasProposal) return { kind: 'refused', code: 'source_unavailable' }

  const result: WorkTreeSetupReadback = {
    kind: ownerCreate.kind === 'replayed' && foreignCreate.kind === 'replayed' ? 'replayed' : 'accepted',
    cohort: WORK_TREE_SETUP_COHORT,
    evidenceClass: WORK_TREE_SETUP_EVIDENCE_CLASS,
    ownerSubject: request.ownerSubject,
    projectId: ownerInspect.readback.projectId,
    wrongPrincipalProjectId: foreignCreate.readback.projectId,
    createIdempotencyKey: request.createIdempotencyKey,
    charterText: request.charterText,
    sharedPrincipalRef: `owner:${request.ownerSubject}`,
    setupRef,
    releaseIdentity: {
      sourceRevision: request.sourceRevision,
      vercelDeploymentId: request.vercelDeploymentId,
      convexDeploymentId: request.convexDeploymentId,
      convexUrl: request.convexUrl,
    },
  }
  return workTreeSetupReadbackSchema.parse(result)
}

export function verifyWorkTreeSetupIdentity(input: Readonly<{
  expected: WorkTreeSetupIdentity
  observed: WorkTreeSetupIdentity
}>): void {
  const expected = workTreeSetupIdentitySchema.parse(input.expected)
  const observed = workTreeSetupIdentitySchema.parse(input.observed)
  if (
    expected.sourceRevision !== observed.sourceRevision
    || expected.vercelDeploymentId !== observed.vercelDeploymentId
    || expected.convexDeploymentId !== observed.convexDeploymentId
    || new URL(expected.convexUrl).href !== new URL(observed.convexUrl).href
  ) throw new Error('hosted_release_identity_mismatch')
}
