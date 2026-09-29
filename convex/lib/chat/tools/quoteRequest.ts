const QUOTE_PROMPT = /^Get a fresh Quote for Tool (operation:v1:[0-9a-f]{64}) with this exact JSON input: (\{[\s\S]*\})\. Use tool\.quote and show the terms for my approval\. Do not Call the Tool\.$/u

/** The card submits this exact sentence; only its operation ref and object are trusted. */
export function parseOwnerQuoteRequest(text: string): { toolRef: string; input: Record<string, unknown> } | null {
  const match = QUOTE_PROMPT.exec(text.trim())
  if (match === null) return null
  try {
    const input: unknown = JSON.parse(match[2] ?? '')
    if (typeof input !== 'object' || input === null || Array.isArray(input)) return null
    return { toolRef: match[1] ?? '', input: input as Record<string, unknown> }
  } catch {
    return null
  }
}
