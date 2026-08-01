import { isBoundedJsonValue, type JsonValue } from '@/modules/capability-contract/public'

export function parseBoundedJson(value: string): JsonValue | undefined {
  try {
    const parsed: unknown = JSON.parse(value)
    return isBoundedJsonValue(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}
