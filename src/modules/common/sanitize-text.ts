export function sanitizeText(value: string, maxLength: number): string {
  return value.replaceAll(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, maxLength)
}
