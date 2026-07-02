import type { AnyAction } from '@/modules/common/action'

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
    parameters: {
      type: 'object'
      properties: Record<string, OpenRouterSchemaProperty>
      required: readonly string[]
    }
  }
}

type OpenRouterSchemaProperty = {
  type: 'string' | 'number' | 'boolean'
  description: string
  enum?: readonly string[]
}

/**
 * Maps an AE action's flat `ActionParameter[]` descriptor into an OpenRouter
 * tool spec. OpenRouter only needs model-facing input parameters here; the
 * action carries Zod input and output schemas server-side, and the runner
 * validates both sides before treating a tool result as evidence.
 *
 * The JSON-schema converter in `@tanstack/ai` is used for agent-tool
 * descriptors, but this OpenRouter path deliberately preserves the existing
 * flat parameter surface. Constraints such as `max(200)` or `int` remain
 * enforced by the action schema at execution time.
 */
export function actionToOpenRouterTool(action: AnyAction): OpenRouterToolSpec {
  const properties: Record<string, OpenRouterSchemaProperty> = {}
  const required: string[] = []

  for (const parameter of action.parameters) {
    properties[parameter.name] = {
      type: parameter.type === 'enum' ? 'string' : parameter.type,
      description: parameter.description,
      ...(parameter.enum === undefined ? {} : { enum: parameter.enum }),
    }
    if (parameter.required) {
      required.push(parameter.name)
    }
  }

  const description = [
    action.summary,
    'Boundaries:',
    ...action.boundaries.map((boundary) => `- ${boundary}`),
  ].join('\n')

  return {
    type: 'function',
    function: {
      name: action.id,
      description,
      parameters: {
        type: 'object',
        properties,
        required,
      },
    },
  }
}
