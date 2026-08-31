import { problem } from '@/lib/server/problem'
import { OPERATION_READ_UNAVAILABLE_PROBLEM } from '@/modules/registry/public'

/** Standard HTTP projection for a failed public Operation catalogue read. */
export function operationReadUnavailableResponse(): Response {
  return problem(OPERATION_READ_UNAVAILABLE_PROBLEM)
}
