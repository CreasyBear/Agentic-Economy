import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

import { registrySearchAction } from '@/modules/registry/registry.actions'
import { AnswerSourceSchema } from '../answer-schema'
import { toAnswerSource } from '../internal/dto-to-answer-source'

const registrySearchOutputSchema = z.object({
  providers: z.array(AnswerSourceSchema),
  total: z.number().int().nonnegative(),
})

export const registrySearchToolDef = toolDefinition({
  name: 'registry.search',
  description:
    'Search the Agentic Economy catalog for published local service businesses. Always use this before naming providers.',
  inputSchema: registrySearchAction.schema,
  outputSchema: registrySearchOutputSchema,
})

/**
 * TanStack AI tool wrapper over the `registry.search` AE action.
 *
 * The action owns the schema, boundaries, and the public DTO read; this tool
 * only adapts the action's `PublicBusinessCatalogApiPage` result into the
 * citation-bearing `AnswerSource` shape the structured chat path expects. The
 * registry stays literal — misspelling recovery is the caller's job.
 */
export const registrySearchTool = registrySearchToolDef.server(async (input) => {
  const parsedInput = registrySearchAction.schema.parse(input)
  const page = await registrySearchAction.run({
    data: parsedInput,
    context: {},
  })

  return {
    providers: page.items.map((dto, index) => toAnswerSource(dto, index + 1)),
    total: page.pagination.total,
  }
})
