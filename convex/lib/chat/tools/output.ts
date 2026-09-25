import { convexToJson, type Value } from 'convex/values'
import { z } from 'zod'
import { degradeBackend } from '@/lib/observability/degrade-backend'
import type { ChatToolId } from '@/modules/chat/tool-card'
import { failure, type ChatToolFailure } from './contracts'
import { MAX_CHAT_TOOL_RESULT_BYTES } from './step'

function modelFacingOutput<Output>(
  toolId: ChatToolId,
  schema: z.ZodType<Output>,
  output: unknown,
): Output | string | ChatToolFailure {
  const canonical = schema.safeParse(output)
  if (!canonical.success) return failure(toolId, 'source_output_invalid')

  let serialized: string
  try {
    serialized = JSON.stringify(canonical.data, (_key, value) =>
      typeof value === 'string'
        ? value
          .replace(/<\s*\/?\s*(?:system|assistant|user|tool)\b[^>]*>/giu, '[data-tag]')
          .replace(/[<>]/gu, (character) => character === '<' ? '‹' : '›')
        : value,
    )
  } catch (cause) {
    return degradeBackend(cause, failure(toolId, 'source_output_invalid'), { site: 'modelFacingOutput', reason: 'invalid_response' })
  }

  if (new TextEncoder().encode(serialized).byteLength > MAX_CHAT_TOOL_RESULT_BYTES) {
    return failure(toolId, 'result_too_large')
  }

  const sanitized: unknown = JSON.parse(serialized)
  const reparsed = schema.safeParse(sanitized)
  if (!reparsed.success) return failure(toolId, 'source_output_invalid')
  // Requires validated, bounded JSON. Preserve every schema key while ensuring
  // both Agent messages and stream deltas can be stored by Convex. Public action
  // contracts stay unchanged; the chat card decodes this JSON string on read.
  try {
    convexToJson(reparsed.data as Value)
    return reparsed.data
  } catch (cause) {
    return degradeBackend(cause, serialized, { site: 'modelFacingOutput.convexSerialization', reason: 'invalid_response' })
  }
}

export function projectedModelFacingOutput<Output>(
  toolId: ChatToolId,
  schema: z.ZodType<Output>,
  project: () => unknown,
): Output | string | ChatToolFailure {
  try {
    return modelFacingOutput(toolId, schema, project())
  } catch (cause) {
    return degradeBackend(cause, failure(toolId, 'source_output_invalid'), { site: 'projectedModelFacingOutput', reason: 'invalid_response' })
  }
}
