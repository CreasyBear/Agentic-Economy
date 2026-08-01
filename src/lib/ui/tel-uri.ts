/**
 * `tel:` targets must carry only dialable characters. A published number is
 * formatted for reading ("0412 345 678"), and passing that straight into the
 * URI leaves literal spaces that several mobile dialers refuse to parse, so the
 * call affordance silently does nothing on the device where it matters most.
 */
export function telUri(publishedPhone: string): string | undefined {
  const dialable = publishedPhone.replace(/[^+\d]/g, '')
  return /\d{6,}/.test(dialable) ? `tel:${dialable}` : undefined
}
