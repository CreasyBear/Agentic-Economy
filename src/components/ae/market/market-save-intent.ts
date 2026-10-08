import { savedToolSaveInputSchema, type SavedToolSaveInput } from '@/modules/market/saved-tools.contracts'

/** A return hint preserves selection only. Saving still requires a new authenticated click. */
export function parseMarketSaveIntent(value: unknown): SavedToolSaveInput | undefined {
  if (typeof value !== 'string' || value.length > 8_500) return undefined
  try {
    const result = savedToolSaveInputSchema.safeParse(JSON.parse(value))
    return result.success ? result.data : undefined
  } catch {
    return undefined
  }
}
