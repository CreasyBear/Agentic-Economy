const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
const words = new Intl.Segmenter(undefined, { granularity: 'word' })

/** Limit visible text without splitting a grapheme or ending midway through a word when possible. */
export function truncateText(text: string, maxCodePoints: number): string {
  if (!Number.isSafeInteger(maxCodePoints) || maxCodePoints < 0) throw new RangeError('truncate_text_limit_invalid')
  if (Array.from(text).length <= maxCodePoints) return text
  if (maxCodePoints === 0) return ''

  const budget = maxCodePoints - 1 // Reserve one code point for the ellipsis.
  let graphemeEnd = 0
  let used = 0
  for (const { segment, index } of graphemes.segment(text)) {
    used += Array.from(segment).length
    if (used > budget) break
    graphemeEnd = index + segment.length
  }
  let wordEnd = 0
  for (const { segment, index, isWordLike } of words.segment(text)) {
    if (index + segment.length > graphemeEnd) break
    if (isWordLike) wordEnd = index + segment.length
  }
  return `${text.slice(0, wordEnd || graphemeEnd).trimEnd()}…`
}
