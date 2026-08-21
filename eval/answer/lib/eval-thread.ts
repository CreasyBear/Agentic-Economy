import {
  setAnswerThreadPortForTests,
} from '../../../src/modules/answer-thread/testing'

import {
  createAnswerThreadTestStore,
  type AnswerThreadTestStore,
  installAnswerThreadTestPort,
} from '../../../tests/helpers/answer-thread-test-port'
import {
  findAnswerThreadEvalCase,
  type AnswerThreadEvalCase,
  type AnswerThreadEvalTurn,
  type AnswerTurnEvalCase,
} from './cases'
import { installEvalRegistrySeed } from './eval-seed'
import {
  runAnswerTurnInStore,
  type AnswerTurnEvalResult,
} from './eval-turn'

export type AnswerThreadEvalResult = {
  ok: boolean
  caseId: string
  problems: string[]
  turns: AnswerTurnEvalResult[]
}

type AnswerThreadVars = {
  caseId: string
}

export async function evaluateAnswerThreadCase(vars: AnswerThreadVars): Promise<AnswerThreadEvalResult> {
  const testCase = findAnswerThreadEvalCase(vars.caseId)
  if (testCase === undefined) {
    return {
      ok: false,
      caseId: vars.caseId,
      problems: [`unknown caseId "${vars.caseId}"`],
      turns: [],
    }
  }

  return runAnswerThreadEvalCase(testCase)
}

export async function runAnswerThreadEvalCase(testCase: AnswerThreadEvalCase): Promise<AnswerThreadEvalResult> {
  const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
  const previousEvalSeed = process.env.AE_ANSWER_EVAL_REGISTRY_SEED
  const previousConvexUrl = process.env.CONVEX_URL
  const previousViteConvexUrl = process.env.VITE_CONVEX_URL
  const store = createAnswerThreadTestStore()
  const resetThreadPort = installAnswerThreadTestPort(store)
  const resetRegistryPort = installEvalRegistrySeed(testCase.registrySeed)
  const previousApiKey = process.env.OPENROUTER_API_KEY
  delete process.env.OPENROUTER_API_KEY
  delete process.env.CONVEX_URL
  delete process.env.VITE_CONVEX_URL

  try {
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    process.env.AE_ANSWER_EVAL_REGISTRY_SEED = testCase.registrySeed ?? 'default'
    const turns: AnswerTurnEvalResult[] = []
    let threadId: string | undefined
    for (const [index, turn] of testCase.turns.entries()) {
      const result = await runAnswerTurnInStore({
        testCase: turnToSingleCase(testCase, turn, index),
        store,
        sessionId: `eval-${testCase.id}`,
        turnKey: `eval-${testCase.id}-${index + 1}`,
        ...(threadId === undefined ? {} : { threadId }),
      })
      turns.push(result)
      threadId = readLatestThreadId(store, threadId)
    }

    const problems = turns.flatMap((turn, index) =>
      turn.problems.map((problem) => `turn ${index + 1}: ${problem}`),
    )
    return {
      ok: problems.length === 0,
      caseId: testCase.id,
      problems,
      turns,
    }
  } finally {
    resetRegistryPort()
    resetThreadPort()
    setAnswerThreadPortForTests(undefined)
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
    if (previousConvexUrl === undefined) {
      delete process.env.CONVEX_URL
    } else {
      process.env.CONVEX_URL = previousConvexUrl
    }
    if (previousViteConvexUrl === undefined) {
      delete process.env.VITE_CONVEX_URL
    } else {
      process.env.VITE_CONVEX_URL = previousViteConvexUrl
    }
  }
}

function turnToSingleCase(
  testCase: AnswerThreadEvalCase,
  turn: AnswerThreadEvalTurn,
  index: number,
): AnswerTurnEvalCase {
  return {
    id: `${testCase.id}#${index + 1}`,
    description: `${testCase.description} — turn ${index + 1}`,
    covers: testCase.covers,
    ...(testCase.registrySeed === undefined ? {} : { registrySeed: testCase.registrySeed }),
    query: turn.query,
    ...(turn.searchContext === undefined ? {} : { searchContext: turn.searchContext }),
    ...(turn.openRouterAgent === undefined ? {} : { openRouterAgent: turn.openRouterAgent }),
    expected: turn.expected,
  }
}

function readLatestThreadId(
  store: AnswerThreadTestStore,
  fallback: string | undefined,
): string | undefined {
  return [...store.threads.values()].sort((left, right) => right.updatedAt - left.updatedAt)[0]?.threadId ?? fallback
}
