import { assembleAnswerEvidence, runAnswerGate } from '../../../src/modules/answer/public.ts'
import {
  runAnswerToolUseAgent,
  setAnswerToolUseAgentForTests,
} from '../../../src/modules/answer/public.ts'
import { validateFollowUpChip } from '../../../src/modules/answer-thread/public.ts'
import { hasInjectionUpgrade } from '../../../src/modules/answer/public.ts'
import type { AnswerSnapshot } from '../../../src/modules/answer/public.ts'
import { createDefaultRegistrySourceState } from '../../../src/modules/registry/public.ts'
import { withRegistrySourcePortForTest } from '../../../tests/helpers/source-ports.ts'

type GateVars = {
  snapshot: string
  allowedSlugs: string
}

type ChipVars = {
  chip: string
  priorQueryCount: string
}

type ParityVars = {
  query: string
}

type InjectionVars = {
  prose: string
}

type ToolUseVars = {
  query: string
  plannedTool: string
  plannedInput: string
  proseOneLine: string
  proseSummary: string
  proseNextStep: string
  expectedSlug: string
  expectPass: string
}

export function evaluateGateCase(vars: GateVars): { ok: boolean; code?: string } {
  const snapshot = JSON.parse(vars.snapshot) as AnswerSnapshot
  const allowedSlugs = new Set(JSON.parse(vars.allowedSlugs) as string[])
  const result = runAnswerGate({ snapshot, allowedSlugs })
  if (result.ok) {
    return { ok: true }
  }
  return { ok: false, code: result.code }
}

export function evaluateChipCase(vars: ChipVars): { ok: boolean } {
  const priorQueryCount = Number.parseInt(vars.priorQueryCount, 10)
  const ok = validateFollowUpChip(vars.chip, Number.isNaN(priorQueryCount) ? 1 : priorQueryCount)
  return { ok }
}

export async function evaluateParityCase(vars: ParityVars): Promise<{ ok: boolean; detail?: string }> {
  const state = createDefaultRegistrySourceState()
  let result: { ok: boolean; detail?: string } = { ok: false, detail: 'not_run' }

  await withRegistrySourcePortForTest(state, async () => {
    const evidence = await assembleAnswerEvidence({ query: vars.query, limit: 10 })
    if (evidence === undefined) {
      result = { ok: false, detail: 'evidence_missing' }
      return
    }
    const slugs = evidence.providers.map((provider) => provider.slug).sort()
    if (slugs.length === 0 || !slugs.includes('parramatta-emergency-plumbing')) {
      result = { ok: false, detail: `unexpected_slugs:${slugs.join(',')}` }
      return
    }
    result = { ok: true }
  })

  return result
}

export function evaluateInjectionCase(vars: InjectionVars): { ok: boolean } {
  return { ok: hasInjectionUpgrade(vars.prose) }
}

/**
 * Tool-use agent eval mode. Installs a deterministic test-seam generator that
 * plans a `registry.search` call with the chosen input, then runs the real
 * `runAnswerToolUseAgent` (which executes the tool against the registry fixture,
 * persists the chosen input as a tool-call record, and runs the real gate). This
 * proves the agent's chosen tool input is the recorded evidence and that prose
 * is grounded against the resulting slugs - CI-runnable without an OpenRouter key.
 */
export async function evaluateToolUseCase(
  vars: ToolUseVars,
): Promise<{ ok: boolean; toolInput?: string; slug?: string; gateOk?: boolean; detail?: string }> {
  const state = createDefaultRegistrySourceState()
  let result: { ok: boolean; toolInput?: string; slug?: string; gateOk?: boolean; detail?: string } = {
    ok: false,
    detail: 'not_run',
  }

  await withRegistrySourcePortForTest(state, async () => {
    const plannedInput = JSON.parse(vars.plannedInput) as Record<string, unknown>
    const reset = setAnswerToolUseAgentForTests(async () => ({
      toolCalls: [{ toolId: vars.plannedTool, input: plannedInput }],
      prose: {
        oneLine: vars.proseOneLine,
        summary: vars.proseSummary,
        whatToDoNow: vars.proseNextStep,
      },
    }))

    try {
      const agentResult = await runAnswerToolUseAgent({ query: vars.query })
      const firstCall = agentResult.toolCalls[0]
      const toolInput = firstCall?.inputJson ?? ''
      const slugs = [...agentResult.allowedSlugs]
      const gateOk = agentResult.gate.ok
      const expectedGate = vars.expectPass === 'true'
      const slugOk = vars.expectedSlug.length === 0 || slugs.includes(vars.expectedSlug)

      let parsedChosen: { query?: string } = {}
      try {
        parsedChosen = JSON.parse(toolInput) as { query?: string }
      } catch {
        // leave parsedChosen empty
      }
      const inputOk = parsedChosen.query === plannedInput.query

      result = {
        ok: gateOk === expectedGate && slugOk && inputOk,
        toolInput,
        slug: slugs.join(','),
        gateOk,
        ...(slugOk && inputOk ? {} : { detail: `slug_ok=${slugOk} input_ok=${inputOk}` }),
      }
    } catch (error) {
      result = { ok: false, detail: `agent_error:${String(error)}` }
    } finally {
      reset()
    }
  })

  return result
}

export function evaluateCase(vars: Record<string, string>): { ok: boolean; code?: string; detail?: string } {
  const mode = vars.mode ?? 'gate'
  switch (mode) {
    case 'chip':
      return evaluateChipCase(vars as ChipVars)
    case 'injection':
      return evaluateInjectionCase(vars as InjectionVars)
    case 'gate':
    default:
      return evaluateGateCase(vars as GateVars)
  }
}

export async function evaluateCaseAsync(vars: Record<string, string>): Promise<{ ok: boolean; code?: string; detail?: string }> {
  const mode = vars.mode ?? 'gate'
  if (mode === 'parity') {
    return evaluateParityCase(vars as ParityVars)
  }
  if (mode === 'tool-use') {
    return evaluateToolUseCase(vars as ToolUseVars)
  }
  return evaluateCase(vars)
}
