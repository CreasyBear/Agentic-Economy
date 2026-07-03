import {
  buildFollowUpChipsSystemPrompt,
  buildFollowUpChipsUserPrompt,
  readAnswerLlmConfig,
} from '@/modules/answer/public'
import type { AnswerSource } from '@/modules/answer/answer-synthesizer'

import { validateFollowUpChip } from './follow-up-chips'

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions'
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
  const config = readAnswerLlmConfig()
  if (config === undefined) {
    return []
  }

  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.AE_SITE_URL ?? process.env.SITE_URL ?? 'http://127.0.0.1:3000',
      'X-Title': 'Agentic Economy',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        { role: 'system', content: buildFollowUpChipsSystemPrompt() },
        { role: 'user', content: buildFollowUpChipsUserPrompt(input.query, input.providers) },
      ],
      response_format: { type: 'json_object' },
      temperature: 0.2,
    }),
    ...(input.signal === undefined ? {} : { signal: input.signal }),
  })

  if (!response.ok) {
    return []
  }

  const payload = (await response.json()) as {
    choices?: Array<{ message?: { content?: string } }>
  }
  const content = payload.choices?.[0]?.message?.content
  if (content === undefined || content.trim().length === 0) {
    return []
  }

  try {
    const parsed = JSON.parse(content) as { chips?: unknown }
    if (!Array.isArray(parsed.chips)) {
      return []
    }
    const chips: string[] = []
    for (const chip of parsed.chips) {
      if (typeof chip !== 'string') {
        continue
      }
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
