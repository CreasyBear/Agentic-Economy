// Golden evaluation corpus — public entry point for the eval platform / pre-deploy gate.
//
// Layered by what is actually testable today:
//   L1 (layer 'endpoint') — GOLDEN_CASES: the runnable endpoint/engine contract.
//     The gate / eval platform MUST run only this layer today.
//   L2 (layer 'vision-pending') — VISION_PENDING_CASES: spec pointers to the durable
//     Project engine that does NOT exist yet. Every row is `status: 'pending'` and is
//     filtered OUT of today's gate; it lights up as the Project engine ships.
//
// Consumers reach for the runnable slice via RUNNABLE_EVAL_CASES (L1 only).
import {
  DEFAULT_LATENCY_CEILING_MS,
  GOLDEN_CASES,
  GOLDEN_WORKFLOW_IDS,
  VISION_DIMENSIONS,
  VISION_PENDING_CASES,
} from './goldenCases'
import type { GoldenCase } from './goldenCases'

export {
  DEFAULT_LATENCY_CEILING_MS,
  GOLDEN_CASES,
  GOLDEN_WORKFLOW_IDS,
  VISION_DIMENSIONS,
  VISION_PENDING_CASES,
}
export type {
  CaseLayer,
  ExpectedKind,
  GoldenCase,
  VisionDimension,
  VisionPendingCase,
  WorkflowId,
} from './goldenCases'

/**
 * The L1 slice the gate actually executes today: every case is `layer: 'endpoint'`.
 * (GOLDEN_CASES is currently equivalent, but deriving the slice by layer keeps the
 * contract explicit and self-documenting as the corpus evolves.)
 */
export const RUNNABLE_EVAL_CASES: readonly GoldenCase[] = GOLDEN_CASES.filter(
  (c) => c.layer === 'endpoint',
)
