import { readPublicRegistrySearchPage } from '@/modules/registry/registry.functions'
import { toAnswerSource } from './dto-to-answer-source'

import {
  buildAgentJsonUrl,
  type AnswerSource,
  type AnswerSynthesizerInput,
} from '../answer-synthesizer'

export type AssembledAnswerEvidence = {
  providers: readonly AnswerSource[]
  allowedSlugs: ReadonlySet<string>
  agentJsonUrl: string
}

const DEFAULT_LIMIT = 10

export async function assembleAnswerEvidence(
  input: AnswerSynthesizerInput,
): Promise<AssembledAnswerEvidence | undefined> {
  const query = sanitizeQuery(input.query)
  const retrievalQuery = sanitizeQuery(input.retrievalQuery ?? input.query)
  const limit = input.limit ?? DEFAULT_LIMIT

  let providers: readonly AnswerSource[]
  if (input.prefetchedProviders !== undefined) {
    providers = input.prefetchedProviders
  } else {
    try {
      const page = await readPublicRegistrySearchPage({
        query: retrievalQuery,
        limit,
        ...(input.cursor === undefined ? {} : { cursor: input.cursor }),
      })
      providers = page.items.map((dto, index) => toAnswerSource(dto, index + 1))
    } catch {
      return undefined
    }
  }

  const allowedSlugs = new Set(providers.map((provider) => provider.slug))
  const agentQuery = input.registryQuery ?? input.retrievalQuery ?? query
  return {
    providers,
    allowedSlugs,
    agentJsonUrl: buildAgentJsonUrl(agentQuery, limit),
  }
}

function sanitizeQuery(raw: string): string {
  return raw.trim().slice(0, 200)
}
