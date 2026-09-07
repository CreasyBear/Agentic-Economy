import type { ProblemInput } from '@/lib/errors'

/**
 * One public failure for infrastructure that prevents a Tool catalogue
 * read from completing. Protocol adapters may wrap this with their standard
 * envelope, but must not invent a transport-specific code.
 */
export const TOOL_READ_UNAVAILABLE_PROBLEM = {
  status: 503,
  kind: 'UNAVAILABLE',
  code: 'tool_read_unavailable',
  detail: 'The Tool catalogue is temporarily unavailable.',
  retryable: true,
} as const satisfies ProblemInput
