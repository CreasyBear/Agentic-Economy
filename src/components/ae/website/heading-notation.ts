export type HeadingSegment =
  | { kind: 'text'; text: string }
  | { kind: 'accent'; text: string }
  | { kind: 'break' }

/** Headings are one string: `*span*` switches family. A newline is an authored break. */
export function parseHeadingNotation(input: string): HeadingSegment[] {
  const segments: HeadingSegment[] = []

  input.split(/\s*\n\s*/).forEach((line, lineIndex) => {
    if (lineIndex > 0) {
      segments.push({ kind: 'break' })
    }
    line
      .replace(/\s+/g, ' ')
      .split('*')
      .forEach((part, partIndex) => {
        if (part === '') {
          return
        }
        segments.push({
          kind: partIndex % 2 === 1 ? 'accent' : 'text',
          text: part,
        })
      })
  })

  return segments
}
