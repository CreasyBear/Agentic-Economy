/** Source-derived display text only; never invents a capability or changes metadata. */
export function x402DirectoryFunctionalTitle(input: Readonly<{
  explicitTitle?: string | undefined
  description?: string | undefined
  serviceName?: string | undefined
  fallback: string
}>): string {
  const clean = (value: string | undefined) => value?.replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/\s+/gu, ' ').trim() || undefined
  const clauses = clean(input.description)?.split(/(?<=[.!?])\s+|\s+[—–-]\s+|;\s+/u)
  // Skip a standalone dollar amount/rate, not prose that happens to mention price.
  const priceOnly = /^\$\d+(?:\.\d+)?(?:\s*(?:\/|per\s+)[a-z]+)?[.!?]?$/iu
  const clause = clauses?.find(value => !priceOnly.test(value.trim()))
  const title = clean(input.explicitTitle) || clean(clause) || clean(input.serviceName) || input.fallback
  if (title.length <= 100) return title || input.fallback
  const prefix = title.slice(0, 99)
  const boundary = title[99] === ' ' ? prefix.length : prefix.lastIndexOf(' ')
  return `${boundary < 0 ? '' : prefix.slice(0, boundary).trimEnd()}…`
}
