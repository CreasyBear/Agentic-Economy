import type { InvalidationIntent } from './contracts'

export function recordInvalidationIntent(
  intents: InvalidationIntent[],
  nextIntent: InvalidationIntent
): InvalidationIntent {
  const existing = intents.find((intent) => intent.intentId === nextIntent.intentId)
  if (existing !== undefined) {
    return existing
  }

  intents.push(nextIntent)
  return nextIntent
}
