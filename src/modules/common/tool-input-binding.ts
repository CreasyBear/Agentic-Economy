// Invariant: bindings stay bounded and ambiguity-safe, following the local-record guard precedent in is-record.ts.
import { isRecord } from './is-record'

export type BoundInputValue = Readonly<{
  path: readonly string[]
  value: string | number | boolean
}>

export type ToolInputBinding = Readonly<{
  bound: readonly BoundInputValue[]
  defaults: readonly BoundInputValue[]
}>

type InputLeaf = Readonly<{ path: readonly string[]; schema: Record<string, unknown> }>
type PatternKind = 'hash' | 'address'

const HASH_PATTERN = '^0x[a-fA-F0-9]{64}$'
const ADDRESS_PATTERN = '^0x[a-fA-F0-9]{40}$'
const HASH_TOKEN = /^0x[0-9a-fA-F]{64}$/u
const ADDRESS_TOKEN = /^0x[0-9a-fA-F]{40}$/u
const MAX_MESSAGE_LENGTH = 2_000
const MAX_TOKENS = 64
const MAX_TOKEN_LENGTH = 130
const MAX_DEPTH = 3
const MAX_LEAVES = 24
const MAX_SCHEMA_NODES = 128
const MAX_BINDING_VALUES = MAX_LEAVES * 2
const UNSAFE_PATH_SEGMENTS: Record<string, boolean> = { ['__proto__']: true, constructor: true, prototype: true }

function tokenise(message: string): string[] {
  const tokens: string[] = []
  for (const token of message.slice(0, MAX_MESSAGE_LENGTH).split(/[\s,;:()[\]{}"'<>.?!]+/u)) {
    if (token.length > 0) tokens.push(token.slice(0, MAX_TOKEN_LENGTH))
    if (tokens.length === MAX_TOKENS) break
  }
  return tokens
}

function collectLeaves(schema: Record<string, unknown>): InputLeaf[] {
  const leaves: InputLeaf[] = []
  let nodes = 0
  const walk = (node: unknown, path: string[], depth: number): void => {
    if (leaves.length === MAX_LEAVES || depth > MAX_DEPTH || !isRecord(node) || nodes === MAX_SCHEMA_NODES) return
    nodes += 1
    if (node.$ref !== undefined || node.oneOf !== undefined || node.anyOf !== undefined || node.allOf !== undefined) return
    if (node.type === 'array' || Array.isArray(node.type)) return
    if (node.type === 'object') {
      if (depth === MAX_DEPTH || !isRecord(node.properties)) return
      for (const key in node.properties) {
        if (!Object.hasOwn(node.properties, key)) continue
        if (nodes === MAX_SCHEMA_NODES) break
        nodes += 1
        if (Object.hasOwn(UNSAFE_PATH_SEGMENTS, key)) continue
        path.push(key)
        walk(node.properties[key], path, depth + 1)
        path.pop()
        if (leaves.length === MAX_LEAVES) break
      }
      return
    }
    if (path.length > 0) leaves.push({ path: [...path], schema: node })
  }
  walk(schema, [], 0)
  return leaves
}

function patternKind(schema: Record<string, unknown>): PatternKind | undefined {
  if (schema.pattern === HASH_PATTERN) return 'hash'
  if (schema.pattern === ADDRESS_PATTERN) return 'address'
  return undefined
}

function uniquePatternToken(tokens: readonly string[], matcher: RegExp): string | undefined {
  let candidate: string | undefined
  for (const token of tokens) {
    if (!matcher.test(token)) continue
    if (candidate === undefined) candidate = token
    else if (candidate.toLowerCase() !== token.toLowerCase()) return undefined
  }
  return candidate
}

function enumMatch(schema: Record<string, unknown>, tokenValues: ReadonlySet<string>): string | undefined {
  const values = schema.enum
  if (!Array.isArray(values) || values.length < 2 || values.length > 12) return undefined
  let match: string | undefined
  for (const value of values) {
    if (typeof value !== 'string') return undefined
    if (!tokenValues.has(value.toLowerCase())) continue
    if (match !== undefined) return undefined
    match = value
  }
  return match
}

/** Bind only unambiguous hashes, addresses, and small enum values; retain primitive defaults independently. */
export function bindToolInput(message: string, schema: unknown): ToolInputBinding {
  try {
    if (typeof message !== 'string' || !isRecord(schema)) return { bound: [], defaults: [] }

    const tokens = tokenise(message)
    const tokenValues = new Set<string>()
    for (const token of tokens) tokenValues.add(token.toLowerCase())
    const leaves = collectLeaves(schema)
    const bound: BoundInputValue[] = []
    const defaults: BoundInputValue[] = []
    let hashLeaves = 0
    let addressLeaves = 0
    for (const leaf of leaves) {
      const kind = patternKind(leaf.schema)
      if (kind === 'hash') hashLeaves += 1
      if (kind === 'address') addressLeaves += 1
    }
    const hashToken = uniquePatternToken(tokens, HASH_TOKEN)
    const addressToken = uniquePatternToken(tokens, ADDRESS_TOKEN)

    for (const leaf of leaves) {
      const kind = patternKind(leaf.schema)
      let candidate: string | undefined
      let ambiguous = false
      if (kind === 'hash' && hashLeaves === 1 && hashToken !== undefined) candidate = hashToken
      if (kind === 'address' && addressLeaves === 1 && addressToken !== undefined) candidate = addressToken
      const fromEnum = enumMatch(leaf.schema, tokenValues)
      if (fromEnum !== undefined) {
        if (candidate !== undefined && candidate !== fromEnum) ambiguous = true
        else candidate = fromEnum
      }
      if (candidate !== undefined && !ambiguous) bound.push({ path: leaf.path, value: candidate })

      const value = leaf.schema.default
      if (typeof value === 'string' || typeof value === 'boolean'
        || (typeof value === 'number' && Number.isFinite(value))) {
        defaults.push({ path: leaf.path, value })
      }
    }

    return { bound, defaults }
  } catch {
    return { bound: [], defaults: [] }
  }
}

/** Project flat bindings into a nested object; invalid, unsafe, or colliding paths are omitted. */
export function bindingToFormData(values: readonly BoundInputValue[]): Record<string, unknown> {
  const entries = values.slice(0, MAX_BINDING_VALUES).filter(({ path }) => path.length > 0
    && path.length <= MAX_DEPTH && path.every(segment => !Object.hasOwn(UNSAFE_PATH_SEGMENTS, segment)))
  const conflicts = new Set<string>()
  for (let left = 0; left < entries.length; left += 1) {
    const leftEntry = entries[left]
    if (leftEntry === undefined) continue
    for (let right = left + 1; right < entries.length; right += 1) {
      const rightEntry = entries[right]
      if (rightEntry === undefined || leftEntry.path.length === rightEntry.path.length) continue
      const shorter = leftEntry.path.length < rightEntry.path.length ? leftEntry.path : rightEntry.path
      const longer = leftEntry.path.length < rightEntry.path.length ? rightEntry.path : leftEntry.path
      if (!shorter.every((segment, index) => segment === longer[index])) continue
      conflicts.add(JSON.stringify(leftEntry.path))
      conflicts.add(JSON.stringify(rightEntry.path))
    }
  }

  const result: Record<string, unknown> = {}
  for (const entry of entries) {
    if (conflicts.has(JSON.stringify(entry.path))) continue
    let current = result
    for (let index = 0; index < entry.path.length - 1; index += 1) {
      const segment = entry.path[index]
      if (segment === undefined) continue
      const existing = Object.hasOwn(current, segment) ? current[segment] : undefined
      const child = isRecord(existing) ? existing : {}
      Object.defineProperty(current, segment, { value: child, enumerable: true, configurable: true, writable: true })
      current = child
    }
    const leaf = entry.path[entry.path.length - 1]
    if (leaf !== undefined) {
      Object.defineProperty(current, leaf, { value: entry.value, enumerable: true, configurable: true, writable: true })
    }
  }
  return result
}
