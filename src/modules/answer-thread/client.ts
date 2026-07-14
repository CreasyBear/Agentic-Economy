import type { PublicThreadTurn } from './answer-thread.schema'
import type { FollowUpChip } from './internal/follow-up-chips'

/** Load optional generated follow-ups while preserving deterministic chips on any failure. */
export async function loadEnabledFollowUpChips(
  turn: PublicThreadTurn,
  signal: AbortSignal,
): Promise<readonly FollowUpChip[] | undefined> {
  try {
    const gateResponse = await fetch('/api/answer/eval-status', { signal })
    if (!gateResponse.ok) return undefined

    const gateBody: unknown = await gateResponse.json()
    if (!isLlmChipsEnabled(gateBody)) return undefined

    const response = await fetch('/api/answer/follow-up-chips', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: turn.query, providers: extractProviders(turn) }),
      signal,
    })
    if (!response.ok) return undefined

    const body: unknown = await response.json()
    if (!hasFollowUpChips(body) || body.chips.length === 0) return undefined
    return body.chips
  } catch {
    return undefined
  }
}

function isLlmChipsEnabled(value: unknown): value is { llmChipsEnabled: true } {
  return typeof value === 'object' && value !== null
    && 'llmChipsEnabled' in value && value.llmChipsEnabled === true
}

function hasFollowUpChips(value: unknown): value is { chips: FollowUpChip[] } {
  return typeof value === 'object' && value !== null
    && 'chips' in value && Array.isArray(value.chips)
    && value.chips.every((chip) => (
      typeof chip === 'object' && chip !== null
      && 'label' in chip && typeof chip.label === 'string'
      && 'submitQuery' in chip && typeof chip.submitQuery === 'string'
    ))
}

function extractProviders(turn: PublicThreadTurn): Record<string, unknown>[] {
  const providersBySlug = new Map<string, Record<string, unknown>>()

  for (const artifact of turn.artifacts) {
    if (artifact.kind === 'selected-provider') {
      providersBySlug.set(artifact.provider.slug, { ...artifact.provider })
      continue
    }

    if (artifact.kind !== 'provider-cards' && artifact.kind !== 'provider-compare-table') continue

    for (const provider of artifact.providers) {
      if (!providersBySlug.has(provider.slug)) providersBySlug.set(provider.slug, { ...provider })
    }
  }

  return [...providersBySlug.values()]
}
