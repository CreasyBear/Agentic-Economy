export function normalizeInquiryWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim()
}
