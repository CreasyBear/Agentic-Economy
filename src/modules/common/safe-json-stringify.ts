export function safeJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(value) ?? 'null'
  } catch {
    return 'null'
  }
}
