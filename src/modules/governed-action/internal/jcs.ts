export type CanonicalJson =
  | null
  | boolean
  | number
  | string
  | readonly CanonicalJson[]
  | { readonly [key: string]: CanonicalJson }

export type CanonicalizationRefusalCode =
  | 'duplicate_key'
  | 'invalid_json'
  | 'invalid_unicode'
  | 'maximum_depth_exceeded'
  | 'non_enumerable_property'
  | 'non_finite_number'
  | 'non_plain_object'
  | 'non_string_key'
  | 'sparse_array'
  | 'undefined_value'
  | 'unsafe_integer'
  | 'unsupported_type'

export type CanonicalizationResult = Readonly<
  | { kind: 'canonical'; json: string; value: CanonicalJson }
  | { kind: 'refused'; code: CanonicalizationRefusalCode; path: string }
>

class CanonicalizationRefusal extends Error {
  constructor(readonly code: CanonicalizationRefusalCode, readonly path: string) {
    super(code)
  }
}

const MAXIMUM_CANONICAL_DEPTH = 100

export function canonicalizeRestrictedJson(value: unknown): CanonicalizationResult {
  try {
    return { kind: 'canonical', json: canonicalizeValue(value, '$', 0), value: value as CanonicalJson }
  } catch (error) {
    if (error instanceof CanonicalizationRefusal) {
      return { kind: 'refused', code: error.code, path: error.path }
    }
    throw error
  }
}

function canonicalizeValue(value: unknown, path: string, depth: number): string {
  if (depth > MAXIMUM_CANONICAL_DEPTH) refuse('maximum_depth_exceeded', path)
  if (value === null || typeof value === 'boolean') return JSON.stringify(value)
  if (typeof value === 'string') {
    assertUnicodeScalarSequence(value, path)
    return JSON.stringify(value)
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) refuse('non_finite_number', path)
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) refuse('unsafe_integer', path)
    return JSON.stringify(value)
  }
  if (value === undefined) refuse('undefined_value', path)
  if (Array.isArray(value)) return canonicalizeArray(value, path, depth)
  if (typeof value !== 'object') refuse('unsupported_type', path)
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
    refuse('non_plain_object', path)
  }
  return canonicalizeObject(value as Record<string | symbol, unknown>, path, depth)
}

function canonicalizeArray(value: readonly unknown[], path: string, depth: number): string {
  const entries: string[] = []
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) refuse('sparse_array', `${path}[${index}]`)
    entries.push(canonicalizeValue(value[index], `${path}[${index}]`, depth + 1))
  }
  return `[${entries.join(',')}]`
}

function canonicalizeObject(value: Record<string | symbol, unknown>, path: string, depth: number): string {
  const keys = Reflect.ownKeys(value)
  if (keys.some((key) => typeof key !== 'string')) refuse('non_string_key', path)
  const stringKeys = keys as string[]
  if (stringKeys.some((key) => Object.getOwnPropertyDescriptor(value, key)?.enumerable !== true)) {
    refuse('non_enumerable_property', path)
  }
  stringKeys.forEach((key) => assertUnicodeScalarSequence(key, propertyPath(path, key)))
  return `{${stringKeys.sort().map((key) => {
    const keyPath = propertyPath(path, key)
    return `${JSON.stringify(key)}:${canonicalizeValue(value[key], keyPath, depth + 1)}`
  }).join(',')}}`
}

function assertUnicodeScalarSequence(value: string, path: string): void {
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index)
    if (unit >= 0xD800 && unit <= 0xDBFF) {
      const next = value.charCodeAt(index + 1)
      if (Number.isNaN(next) || next < 0xDC00 || next > 0xDFFF) refuse('invalid_unicode', path)
      index += 1
    } else if (unit >= 0xDC00 && unit <= 0xDFFF) {
      refuse('invalid_unicode', path)
    }
  }
}

function propertyPath(parent: string, key: string): string {
  return `${parent}[${JSON.stringify(key)}]`
}

function refuse(code: CanonicalizationRefusalCode, path: string): never {
  throw new CanonicalizationRefusal(code, path)
}
