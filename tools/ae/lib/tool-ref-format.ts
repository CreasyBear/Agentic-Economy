const HEX64_PLACEHOLDER = '<64 lowercase hex characters>'

/** Canonical shape of a Tool reference (`operation:v1:<64 hex>`), shared by every message that names it. */
export const TOOL_REF_FORMAT_EXAMPLE = `operation:v1:${HEX64_PLACEHOLDER}`

/** Canonical shape of a Call reference (`operation-invocation:v1:<64 hex>`), shared by every message that names it. */
export const CALL_REF_FORMAT_EXAMPLE = `operation-invocation:v1:${HEX64_PLACEHOLDER}`

/** One sentence naming the required Tool reference shape, reused across every invalid-tool-ref message. */
export function toolRefFormatMessage(subject = 'Tool reference'): string {
  return `${subject} must match ${TOOL_REF_FORMAT_EXAMPLE}.`
}
