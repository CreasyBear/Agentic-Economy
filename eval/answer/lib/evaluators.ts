import {
  runAnswerGate,
  hasInjectionUpgrade,
} from '../../../src/modules/answer/public'
import { registrySearchAction } from '../../../src/modules/registry/registry.actions'
import type { AnswerSnapshot } from '@/modules/answer/public'

import { findAnswerTurnEvalCase } from './cases'
import {
  evaluateAnswerThreadCase,
  runAnswerThreadEvalCase,
  type AnswerThreadEvalResult,
} from './eval-thread'
import {
  emptyAnswerEvalCapabilityMetrics,
  emptyAnswerEvalHarnessMetrics,
  type AnswerEvalCapabilityMetrics,
  type AnswerEvalCapabilityOperationRefDialects,
  type AnswerEvalCapabilityToolCounts,
  type AnswerEvalPerformancePath,
  type AnswerEvalUsage,
} from './eval-capability-metrics'
import {
  evaluateToolUseCase,
  runAnswerTurnEvalCase,
  type AnswerTurnEvalResult,
} from './eval-turn'

export type {
  AnswerEvalCapabilityMetrics,
  AnswerEvalCapabilityOperationRefDialects,
  AnswerEvalCapabilityToolCounts,
  AnswerEvalPerformancePath,
  AnswerEvalUsage,
}

export type { AnswerTurnEvalResult, AnswerThreadEvalResult }

export { runAnswerTurnEvalCase, runAnswerThreadEvalCase }

type GateVars = {
  snapshot: string
  allowedSlugs: string
}

type InjectionVars = {
  prose: string
}

type ParityVars = {
  query: string
}

type AnswerTurnVars = {
  caseId: string
}

type AnswerThreadVars = {
  caseId: string
}

function evaluateGateCase(vars: GateVars): { ok: boolean; code?: string } {
  const snapshot = JSON.parse(vars.snapshot) as AnswerSnapshot
  const allowedSlugs = new Set(JSON.parse(vars.allowedSlugs) as string[])
  const result = runAnswerGate({ snapshot, allowedSlugs })
  if (result.ok) {
    return { ok: true }
  }
  return { ok: false, code: result.code }
}

async function evaluateParityCase(vars: ParityVars): Promise<{ ok: boolean; detail?: string }> {
  let result: { ok: boolean; detail?: string } = { ok: false, detail: 'not_run' }
  const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
  const previousEvalSeed = process.env.AE_ANSWER_EVAL_REGISTRY_SEED
  process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
  process.env.AE_ANSWER_EVAL_REGISTRY_SEED = 'default'

  try {
    const page = await registrySearchAction.run({
      data: { query: vars.query, limit: 10 },
      context: { caller: 'chat' },
    })
    const slugs = page.items.map((item) => item.slug).sort()
    if (slugs.length === 0 || !slugs.includes('demo-listed-provider')) {
      return { ok: false, detail: `unexpected_slugs:${slugs.join(',')}` }
    }
    result = { ok: true }
  } finally {
    if (previousLocalRegistry === undefined) {
      delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    } else {
      process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
    }
    if (previousEvalSeed === undefined) {
      delete process.env.AE_ANSWER_EVAL_REGISTRY_SEED
    } else {
      process.env.AE_ANSWER_EVAL_REGISTRY_SEED = previousEvalSeed
    }
  }

  return result
}

function evaluateInjectionCase(vars: InjectionVars): { ok: boolean } {
  return { ok: hasInjectionUpgrade(vars.prose) }
}

async function evaluateAnswerTurnCase(vars: AnswerTurnVars): Promise<AnswerTurnEvalResult> {
  const testCase = findAnswerTurnEvalCase(vars.caseId)
  if (testCase === undefined) {
    return {
      ok: false,
      caseId: vars.caseId,
      status: 'missing',
      slugs: [],
      toolQueries: [],
      timingNames: [],
      artifactKinds: [],
      workStepIds: [],
      workSteps: [],
      totalTimingMs: 0,
      requestToFirstProgressMs: 0,
      requestToCompletionMs: 0,
      ...emptyAnswerEvalHarnessMetrics(),
      capabilityMetrics: emptyAnswerEvalCapabilityMetrics(),
      hasHarnessRun: false,
      harnessToolsInvoked: [],
      harnessPhases: [],
      problems: [`unknown caseId "${vars.caseId}"`],
      diagnostics: {},
    }
  }

  return runAnswerTurnEvalCase(testCase)
}

function evaluateCase(vars: Record<string, string>): { ok: boolean; code?: string; detail?: string } {
  const mode = vars.mode ?? 'gate'
  switch (mode) {
    case 'injection':
      return evaluateInjectionCase(vars as InjectionVars)
    case 'gate':
      return evaluateGateCase(vars as GateVars)
    default:
      return { ok: false, detail: `unknown_eval_mode:${mode}` }
  }
}

export async function evaluateCaseAsync(vars: Record<string, string>): Promise<{ ok: boolean; code?: string; detail?: string }> {
  const mode = vars.mode ?? 'gate'
  if (mode === 'answer-turn') {
    return evaluateAnswerTurnCase(vars as AnswerTurnVars)
  }
  if (mode === 'answer-thread') {
    return evaluateAnswerThreadCase(vars as AnswerThreadVars)
  }
  if (mode === 'parity') {
    return evaluateParityCase(vars as ParityVars)
  }
  if (mode === 'tool-use') {
    return evaluateToolUseCase(vars as Parameters<typeof evaluateToolUseCase>[0])
  }
  return evaluateCase(vars)
}
