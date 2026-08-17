import type { JSONSchema } from '@tanstack/ai'
import { actionToToolContract } from '@/modules/actions/tool-contract'
import { findStrictToolSchemaViolation } from '@/modules/actions/strict-schema'
import type { AnyAction } from '@/modules/common/action'
type StrictObjectJsonSchema = JSONSchema & {
  type: 'object'
  properties: Record<string, JSONSchema>
}

function isObjectJsonSchema(
  schema: JSONSchema | undefined,
): schema is StrictObjectJsonSchema {
  return schema?.type === 'object' && schema.properties !== undefined
}

/**
 * OpenRouter (OpenAI-compatible) tool spec shape.
 *
 * `tools` is a list of `{ type: 'function', function: { name, description,
 * parameters: <JSON schema> } }`. The model emits `tool_calls` against these;
 * the server re-validates each call against the action's Zod schema before
 * running it, so this descriptor is the model-facing surface only.
 */
export type OpenRouterToolSpec = {
  type: 'function'
  function: {
    name: string
    description: string
    parameters: StrictObjectJsonSchema
  }
}


/**
 * Maps an AE action's canonical strict input JSON Schema into an OpenRouter
 * tool spec. Tool input examples stay on the AI SDK tool contract so the
 * model gateway middleware can serialize them for providers that need it.
 */
export function actionToOpenRouterTool(
  action: AnyAction,
): OpenRouterToolSpec {
  const contract = actionToToolContract(action)
  const parameters = contract.schemas.inputJsonSchema
  if (!isObjectJsonSchema(parameters)) {
    throw new Error(`Action ${action.id} has no representable strict input schema`)
  }
  const violation = findStrictToolSchemaViolation(parameters)
  if (violation !== null) {
    throw new Error(`Action ${action.id} has a non-strict tool schema at ${violation.path}: ${violation.reason}`)
  }

  const description = [
    action.summary,
    'Boundaries:',
    ...action.boundaries.map((boundary) => `- ${boundary}`),
  ].join('\n')

  return {
    type: 'function',
    function: {
      name: openRouterToolName(action.id),
      description,
      parameters,
    },
  }
}

export function openRouterToolName(actionId: string): string {
  const name = actionId.replace(/[^a-zA-Z0-9_-]/g, '_')
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(name)) {
    throw new Error(`Action ${actionId} cannot be represented as an OpenRouter tool name`)
  }
  return name
}
