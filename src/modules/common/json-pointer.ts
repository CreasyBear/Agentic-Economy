export function readJsonPointer(value: unknown, pointer: string): unknown {
  const resolved = resolveJsonPointer(value, pointer)
  return resolved.found ? resolved.value : undefined
}

export type JsonPointerResolution =
  | Readonly<{ found: true; value: unknown }>
  | Readonly<{ found: false }>

export function resolveJsonPointer(
  value: unknown,
  pointer: string,
): JsonPointerResolution {
  if (pointer === '') return { found: true, value }
  if (!pointer.startsWith('/')) return { found: false }

  let current = value
  for (const encodedSegment of pointer.slice(1).split('/')) {
    if (/(?:~[^01])|~$/u.test(encodedSegment)) return { found: false }
    const segment = encodedSegment.replaceAll('~1', '/').replaceAll('~0', '~')

    if (Array.isArray(current)) {
      if (!/^(?:0|[1-9]\d*)$/u.test(segment)) return { found: false }
      const index = Number(segment)
      if (!Number.isSafeInteger(index) || index >= current.length) return { found: false }
      current = current[index]
      continue
    }

    if (current === null || typeof current !== 'object'
      || !Object.hasOwn(current, segment)) return { found: false }
    current = (current as Record<string, unknown>)[segment]
  }
  return { found: true, value: current }
}
