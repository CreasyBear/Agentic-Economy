import { z } from 'zod'

import type { PublicThreadTurn } from './answer-thread.schema'
import type { FollowUpChip } from './internal/follow-up-chips'

const llmChipsEnabledResponseSchema = z.looseObject({
  llmChipsEnabled: z.literal(true),
})
const followUpChipsResponseSchema = z.looseObject({
  chips: z.array(z.looseObject({
    label: z.string(),
    submitQuery: z.string(),
  })),
})
/** Load optional generated follow-ups while preserving deterministic chips on any failure. */
export async function loadEnabledFollowUpChips(
  turn: PublicThreadTurn,
  signal: AbortSignal,
): Promise<readonly FollowUpChip[] | undefined> {
  try {
    const gateResponse = await fetch('/api/answer/eval-status', { signal })
    if (!gateResponse.ok) return undefined

    const gateBody: unknown = await gateResponse.json()
    if (!llmChipsEnabledResponseSchema.safeParse(gateBody).success) return undefined

    const response = await fetch('/api/answer/follow-up-chips', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: turn.query, providers: extractProviders(turn) }),
      signal,
    })
    if (!response.ok) return undefined

    const body = followUpChipsResponseSchema.safeParse(await response.json())
    if (!body.success || body.data.chips.length === 0) return undefined
    return body.data.chips
  } catch {
    return undefined
  }
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
