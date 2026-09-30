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

const RUN_PROMPT = /^Use (.+) \((operation:v1:[0-9a-f]{64}|registry:[0-9a-f]+)\) to answer: "([\s\S]*)"\. Fill its input from that, run it, and give me the answer\.$/u

/** The card's Run button submits this exact sentence; the model then fills input, quotes and calls. */
export function parseOwnerRunRequest(text: string): { title: string; toolRef: string; ask: string } | null {
  const match = RUN_PROMPT.exec(text.trim())
  if (match === null) return null
  return { title: match[1] ?? '', toolRef: match[2] ?? '', ask: match[3] ?? '' }
}
