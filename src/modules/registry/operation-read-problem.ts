import type { ProblemInput } from '@/lib/errors'

/**
 * One public failure for infrastructure that prevents an Operation catalogue
 * read from completing. Protocol adapters may wrap this with their standard
 * envelope, but must not invent a transport-specific code.
 */
export const OPERATION_READ_UNAVAILABLE_PROBLEM = {
  status: 503,
  kind: 'UNAVAILABLE',
  code: 'operation_read_unavailable',
  detail: 'The Operation catalogue is temporarily unavailable.',
  retryable: true,
} as const satisfies ProblemInput

