import type { AnswerToolCallResultSummary } from '../answer-thread.schema'

export function parseToolSummary(value: string): AnswerToolCallResultSummary {
  try {
    return JSON.parse(value) as AnswerToolCallResultSummary
  } catch {
    return { slugs: [], count: 0 }
  }
}

export function readToolSummaryErrorCode(value: string): string | undefined {
  const parsed = parseToolSummary(value)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return undefined
  }
  return typeof parsed.errorCode === 'string' ? parsed.errorCode : undefined
}
