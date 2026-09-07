import { problem } from '@/lib/server/problem'
import { TOOL_READ_UNAVAILABLE_PROBLEM } from '@/modules/registry/public'

/** Standard HTTP projection for a failed public Tool catalogue read. */
export function toolReadUnavailableResponse(): Response {
  return problem(TOOL_READ_UNAVAILABLE_PROBLEM)
}
