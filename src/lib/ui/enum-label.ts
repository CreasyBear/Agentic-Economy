/** Sentence-case label for a stored code, e.g. "not_started" or "session.created" to "Not started" / "Session created". */
export function enumLabel(value: string): string {
  const words = value.replaceAll(/[._-]+/gu, ' ')
  return words.charAt(0).toUpperCase() + words.slice(1)
}
