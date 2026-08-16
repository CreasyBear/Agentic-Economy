import { sanitizePromptDataString } from './answer-llm-prompts'

/**
 * Builds the model-facing description for any DB-derived capability tool.
 * Name and summary are sanitized before entering model instructions; input
 * examples remain on the AI SDK tool contract.
 */
export function capabilityToolDescription(
  name: string,
  summary?: string,
): string {
  const publishedName = sanitizePromptDataString(name)
  const publishedSummary = summary === undefined
    ? ''
    : ` Published summary: ${sanitizePromptDataString(summary)}`
  return `Execute "${publishedName}".${publishedSummary} This is a live keyless capability; call it with exactly the inputs its published schema names and answer from the returned JSON.`
}
