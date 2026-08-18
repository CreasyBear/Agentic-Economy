import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'

import { exactAmountSchema } from '@/modules/money/public'

import { readBrowserGuestSession, resolveBrowserGuestSession } from '@/lib/server/browser-guest-session'

import type {
  RootWorkTreeReadback,
  RootWorkTreeStart,
  WorkTreeDecisionResult,
  WorkTreeSourcePort,
} from './internal/root-loop'

import { QUARANTINE_WRITES_FROZEN_CODE } from '@/modules/product-frontier/quarantine-write-admission'
import type { WorkTreeApprovalIssueResult } from './work-tree-approval.functions'
import { workTreeLineageSchema } from './public'
import type { WorkTreeClaimResult } from './work-tree.functions'

/**
 * T49's human issuance seam is separate from the decision mutation: the
 * human owner receives an opaque, exact, single-use artifact that an agent
 * later cites. Convex derives owner identity from the authenticated Clerk
 * session and performs the durable binding.
 */

/** T46 — the root host's server boundary for the human WorkTree loop. */

/**
 * The orchestration itself is re-exported, not just the server functions: T47's
 * agent host has to drive the identical sequence against an injected port so
 * human and agent parity is a shared implementation rather than two that agree
 * today. Hosts differ only in how they obtain the port and the principal.
 */
export type {
  RootWorkTreeReadback,
  RootWorkTreeStart,
  RootWorkTreeView,
  WorkTreeActor,
  WorkTreeDecisionKind,
  WorkTreeDecisionReceipt,
  WorkTreeDecisionResult,
  WorkTreeRefusalCode,
  WorkTreeSourceEvent,
  WorkTreeSourcePort,
  WorkTreeStepUp,
  WorkTreeLineage,
} from './internal/root-loop'


const outcomeSchema = z.strictObject({
  outcome: z.string().trim().min(1).max(4_000),
  lineage: workTreeLineageSchema.optional(),
})
const projectSchema = z.strictObject({ projectId: z.string().trim().min(1).max(200) })
const claimSchema = z.strictObject({
  projectId: z.string().trim().min(1).max(200),
  idempotencyKey: z.string().trim().min(1).max(200),
})
const decisionSchema = z.strictObject({
  projectId: z.string().trim().min(1).max(200),
  nodeId: z.string().trim().min(1).max(200),
  kind: z.enum(['lock', 'adjust', 'park']),
  expectedGeneration: z.number().int().min(1),
  expectedRevision: z.number().int().min(1),
  stepUp: z.strictObject({
    acknowledgedConsequence: z.literal(true),
    approvalKind: z.literal('per_item'),
  }).optional(),
})
const approvalIssueSchema = z.strictObject({
  projectId: z.string().trim().min(1).max(200),
  nodeId: z.string().trim().min(1).max(200),
  kind: z.literal('lock'),
  expectedGeneration: z.number().int().min(1),
  expectedRevision: z.number().int().min(1),
  proposalDigest: z.string().trim().min(1).max(200),
  credentialId: z.string().trim().min(1).max(200),
  authority: z.strictObject({
    kind: z.literal('per_item'),
    amount: exactAmountSchema.optional(),
  }),
  expiresAt: z.number().int().positive(),
  idempotencyKey: z.string().trim().min(1).max(200),
  acknowledgedConsequence: z.literal(true),
  approvalKind: z.literal('per_item'),
})

export type RootWorkTreeDecisionResult = Readonly<{
  receipt: WorkTreeDecisionResult
  readback: RootWorkTreeReadback
}>

/**
 * Creates or resumes the durable project before any elaboration is attempted.
 *
 * An anonymous human still needs a principal the source can verify, so the
 * submit resolves (and, first time, mints) a signed browser-guest session and
 * hands the source that opaque token. Nothing about the caller's identity comes
 * from the request body, and a missing signing key fails closed rather than
 * creating an unattributed project.
 */
export const startRootWorkTreeServer = createServerFn({ method: 'POST' })
  .validator((data) => outcomeSchema.parse(data))
  .handler(async (): Promise<RootWorkTreeStart> => {
    return { kind: 'refused', reason: QUARANTINE_WRITES_FROZEN_CODE }
  })

/** Claims the exact browser-created project for the authenticated Clerk owner. */
export const claimRootWorkTreeServer = createServerFn({ method: 'POST' })
  .validator((data) => claimSchema.parse(data))
  .handler(async (): Promise<WorkTreeClaimResult> => {
    return { kind: 'refused', code: QUARANTINE_WRITES_FROZEN_CODE, replayed: false }
  })

/** Pure source readback. No model call, no transcript, no stream replay. */
export const readRootWorkTreeServer = createServerFn()
  .validator((data) => projectSchema.parse(data))
  .handler(async ({ data }): Promise<RootWorkTreeReadback> => {
    const caller = await resolveRootBrowserCaller()
    if (caller.kind === 'unavailable') return { kind: 'refused', reason: 'authentication_required' }
    // Writes are frozen; do not claim on the read path.
    const { readRootWorkTree } = await import('./internal/root-loop')
    return readRootWorkTree({
      projectId: data.projectId,
      nowMs: Date.now(),
      ...(caller.kind === 'guest' ? { guestAssertion: caller.assertion } : {}),
    }, await convexWorkTreeSourcePort())
  })

export const decideRootWorkTreeServer = createServerFn({ method: 'POST' })
  .validator((data) => decisionSchema.parse(data))
  .handler(async (): Promise<RootWorkTreeDecisionResult> => {
    return {
      receipt: { kind: 'refused', code: QUARANTINE_WRITES_FROZEN_CODE, replayed: false },
      readback: { kind: 'refused', reason: QUARANTINE_WRITES_FROZEN_CODE },
    }
  })
/**
 * Issue one owner-authenticated, expiring approval artifact for an exact
 * protected Lock. The acknowledgement is host evidence; the artifact itself
 * is the only authority the agent may later consume.
 */
export const issueRootWorkTreeApprovalServer = createServerFn({ method: 'POST' })
  .validator((data) => approvalIssueSchema.parse(data))
  .handler(async (): Promise<WorkTreeApprovalIssueResult> => {
    return { kind: 'refused', code: QUARANTINE_WRITES_FROZEN_CODE }
  })
/**
 * Binds the host to the source functions the framework owns: create/inspect
 * from T45 and apply/decide from T47. The host adds no authority of its own —
 * principal, fencing, idempotency and every bound stay behind these calls.
 *
 * Dynamic import exception: `src/routeTree.gen.ts` client-bundles every route
 * module, and this module is reachable from `/`. A module-scope import of the
 * source graph therefore drags server-only Convex and Clerk code into the
 * browser bundle and breaks hydration for every page — the failure
 * `tests/unit/routes/route-client-bundle-safety.test.ts` exists to catch, whose
 * prescribed remedy is exactly this: keep the server-only graph behind a
 * dynamic import inside the handler.
 */
type RootBrowserCaller =
  | Readonly<{ kind: 'authenticated' }>
  | Readonly<{ kind: 'guest'; assertion: string }>
  | Readonly<{ kind: 'unavailable' }>

async function resolveRootBrowserCaller(options: Readonly<{ mintGuest?: boolean }> = {}): Promise<RootBrowserCaller> {
  try {
    const { auth } = await import('@clerk/tanstack-react-start/server')
    const session = await auth()
    if (session.isAuthenticated) return { kind: 'authenticated' }
  } catch {
    // An unavailable Clerk context cannot prove anonymous authority.
    return { kind: 'unavailable' }
  }
  const guest = options.mintGuest
    ? await resolveBrowserGuestSession()
    : await readBrowserGuestSession()
  return guest === undefined ? { kind: 'unavailable' } : { kind: 'guest', assertion: guest.assertion }
}

async function convexWorkTreeSourcePort(): Promise<WorkTreeSourcePort> {
  const {
    createWorkTreeThroughSource,
    inspectWorkTreeThroughSource,
    applyWorkTreeThroughSource,
    decideWorkTreeThroughSource,
  } = await import('./work-tree.functions')
  return {
    create: async (input) => {
      const result = await createWorkTreeThroughSource(input)
      if (result.kind === 'refused') return { kind: 'refused', reason: result.code }
      return {
        kind: result.kind,
        projectId: result.readback.projectId,
        treeId: result.readback.treeId,
        generation: result.readback.generation,
        revision: result.readback.revision,
        tree: result.readback.tree,
      }
    },
    inspect: async (input) => {
      const result = await inspectWorkTreeThroughSource(input)
      if (result.kind === 'refused') return { kind: 'refused', reason: result.code }
      return {
        kind: 'accepted',
        projectId: result.readback.projectId,
        treeId: result.readback.treeId,
        generation: result.readback.generation,
        revision: result.readback.revision,
        tree: result.readback.tree,
        events: result.readback.events.map((event) => ({
          kind: event.kind,
          operationKey: event.operationKey,
          seq: event.seq,
          generation: event.generation,
          revision: event.revision,
          at: event.at,
          ...(event.actor === undefined ? {} : { actor: event.actor }),
          ...(event.kind === 'decision_proposed' && event.targetNodeId !== undefined
            ? { targetNodeId: event.targetNodeId }
            : {}),
          payloadJson: '{}',
        })),
        hasMoreEvents: result.readback.hasMoreEvents,
        receipts: result.readback.receipts,
      }
    },
    apply: async (input) => {
      const result = await applyWorkTreeThroughSource(input)
      if (result.kind === 'accepted' || result.kind === 'replayed') {
        return {
          kind: result.kind,
          receipt: { tree: result.receipt.tree, operationKey: result.receipt.operationKey },
          readback: result.readback,
        }
      }
      return { kind: result.kind, reason: result.reason }
    },
    decide: async (input): Promise<WorkTreeDecisionResult> => {
      const result = await decideWorkTreeThroughSource(input)
      return result
    },
  }
}

