import type { AnswerHarnessEvalCase } from './eval-case-types'

export const ANSWER_HARNESS_EVAL_CASES = [
  {
    id: 'harness-persisted-run-direct-turn',
    description: 'A complete model-selected tool-loop turn persists private harnessRun evidence and phase/tool coverage.',
    covers: ['persisted-harness-run', 'live-phase-tool-evidence'],
    source: { kind: 'answer-turn', caseId: 'turn-direct-parramatta-fast-path' },
    assertions: ['requires-persisted-harness-run', 'requires-live-phase-tool-evidence'],
  },
  {
    id: 'harness-public-contract-refusal-turn',
    description: 'Unsupported booking/payment intent returns boundary copy with persisted harnessRun evidence.',
    covers: ['persisted-harness-run', 'public-contract-refusal'],
    source: { kind: 'answer-turn', caseId: 'turn-unsupported-booking-boundary' },
    assertions: ['requires-persisted-harness-run', 'requires-public-contract-refusal'],
  },
  {
    id: 'harness-blocked-refused-tool-policy',
    description: 'Harness approval policy records public prompt/write blocks separately from deny/exec refusals.',
    covers: ['blocked-refused-tools'],
    source: { kind: 'unit-test', file: 'tests/unit/harness/approval-policy.test.ts' },
    assertions: ['requires-blocked-tool', 'requires-refused-tool'],
  },
  {
    id: 'harness-invalid-output-evidence',
    description: 'Harness run reports keep invalid output as private error evidence and counters.',
    covers: ['invalid-output'],
    source: { kind: 'unit-test', file: 'tests/unit/harness/run-collector.test.ts' },
    assertions: ['requires-invalid-output'],
  },
  {
    id: 'harness-answer-model-accounting',
    description: 'Answer model execution emits provider/model/usage accounting records for harness reports.',
    covers: ['live-phase-tool-evidence'],
    source: { kind: 'unit-test', file: 'tests/unit/answer/answer-tool-use-agent-tool-choice.test.ts' },
    assertions: ['requires-live-phase-tool-evidence', 'requires-model-accounting'],
  },
  {
    id: 'harness-stale-replay-projection',
    description: 'Harness replay projection identifies stale terminal branches and sanitizes public replay output.',
    covers: ['stale-replay'],
    source: { kind: 'unit-test', file: 'tests/unit/harness/replay-projection.test.ts' },
    assertions: ['requires-stale-replay', 'forbids-public-harness-leakage'],
  },
  {
    id: 'harness-public-projection-leakage',
    description: 'Public answer-thread projection omits raw harnessRun, tool payloads, and result hashes.',
    covers: ['public-leakage'],
    source: { kind: 'integration-test', file: 'tests/integration/answer-tool-calls.test.ts' },
    assertions: ['forbids-public-harness-leakage'],
  },
] as const satisfies readonly AnswerHarnessEvalCase[]
