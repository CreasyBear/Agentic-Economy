export function readJsonPointer(value: unknown, pointer: string): unknown {
  if (pointer === '') return value
  if (!pointer.startsWith('/')) return undefined

  let current = value
  for (const encodedSegment of pointer.slice(1).split('/')) {
    if (/(?:~[^01])|~$/u.test(encodedSegment)) return undefined
    const segment = encodedSegment.replaceAll('~1', '/').replaceAll('~0', '~')

    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9]\d*)$/u.test(segment)) return undefined
      const index = Number(segment)
      if (!Number.isSafeInteger(index) || index >= current.length) return undefined
      current = current[index]
      continue
    }

    if (current === null || typeof current !== 'object'
      || !Object.prototype.hasOwnProperty.call(current, segment)) return undefined
    current = (current as Record<string, unknown>)[segment]
  }
  return current
}
