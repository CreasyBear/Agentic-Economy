import { generateText, Output } from 'ai'
import { z } from 'zod'

import {
  buildFollowUpChipsSystemPrompt,
  buildFollowUpChipsUserPrompt,
} from '@/modules/answer/public'
import type { AnswerSource } from '@/modules/answer/answer-synthesizer'
import {
  openRouterGatewayConfig,
  openRouterModel,
} from '@/modules/model-gateway/public'

import { validateFollowUpChip } from './follow-up-chips'

const followUpChipsSchema = z.strictObject({
  chips: z.array(z.string()),
})
const MAX_LLM_CHIPS = 3

export type GenerateLlmFollowUpChipsInput = {
  query: string
  providers: readonly AnswerSource[]
  signal?: AbortSignal
}

export type LlmChipGenerator = (input: GenerateLlmFollowUpChipsInput) => Promise<readonly string[]>

let testChipGenerator: LlmChipGenerator | undefined

export function setLlmFollowUpChipGeneratorForTests(generator: LlmChipGenerator | undefined): () => void {
  const previous = testChipGenerator
  testChipGenerator = generator
  return () => {
    testChipGenerator = previous
  }
}

export async function generateLlmFollowUpChips(input: GenerateLlmFollowUpChipsInput): Promise<readonly string[]> {
  if (testChipGenerator !== undefined) {
    return testChipGenerator(input)
  }
  return fetchLlmFollowUpChips(input)
}

async function fetchLlmFollowUpChips(input: GenerateLlmFollowUpChipsInput): Promise<readonly string[]> {
  const config = openRouterGatewayConfig()
  if (config.apiKey === undefined) {
    return []
  }

  try {
    const result = await generateText({
      maxRetries: 0,
      model: openRouterModel(config, config.model, { structuredOutputs: true }),
      instructions: buildFollowUpChipsSystemPrompt(),
      prompt: buildFollowUpChipsUserPrompt(input.query, input.providers),
      output: Output.object({ schema: followUpChipsSchema }),
      temperature: 0.2,
      ...(input.signal === undefined ? {} : { abortSignal: input.signal }),
    })

    // `output` is schema-validated, so only AE's own chip rules remain.
    const chips: string[] = []
    for (const chip of result.output.chips) {
      const trimmed = chip.trim()
      if (!validateFollowUpChip(trimmed, 1)) {
        continue
      }
      chips.push(trimmed)
      if (chips.length >= MAX_LLM_CHIPS) {
        break
      }
    }
    return chips
  } catch {
    return []
  }
}

export { MAX_LLM_CHIPS }

