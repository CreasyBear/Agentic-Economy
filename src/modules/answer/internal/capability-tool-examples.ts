import { sanitizePromptDataString } from './answer-llm-prompts'

function stringifyPromptData(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, nested) => typeof nested === 'string' ? sanitizePromptDataString(nested) : nested,
  )
}

type PublishedInputExample = Readonly<{
  label?: string | undefined
  input: Readonly<Record<string, unknown>>
}>

/**
 * Builds the model-facing description for any DB-derived capability tool.
 * Standard contract `inputExamples` are carried with the publication and
 * rendered generically; adding a capability never requires answer-agent code.
 */
export function capabilityToolDescription(
  name: string,
  summary?: string,
  inputExamples: readonly PublishedInputExample[] = [],
): string {
  const publishedName = sanitizePromptDataString(name)
  const publishedSummary = summary === undefined
    ? ''
    : ` Published summary: ${sanitizePromptDataString(summary)}`
  const base = `Execute "${publishedName}".${publishedSummary} This is a live keyless capability; call it with exactly the inputs its published schema names and answer from the returned JSON.`
  if (inputExamples.length === 0) return base

  return [
    base,
    '',
    'PUBLISHED INPUT EXAMPLES:',
    ...inputExamples.map((example, index) => [
      `EXAMPLE ${index + 1}${example.label === undefined ? '' : ` — ${sanitizePromptDataString(example.label)}`}`,
      `  Call with: ${stringifyPromptData(example.input)}`,
    ].join('\n')),
  ].join('\n')
}
