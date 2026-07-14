import type { CanonicalJson, CanonicalizationRefusalCode } from './jcs'

export type StrictJsonResult = Readonly<
  | { kind: 'parsed'; value: CanonicalJson }
  | { kind: 'refused'; code: CanonicalizationRefusalCode; path: string }
>

class ParseRefusal extends Error {
  constructor(readonly code: CanonicalizationRefusalCode, readonly path: string) {
    super(code)
  }
}

export function parseRestrictedJson(source: string): StrictJsonResult {
  const trimmed = source.trim()
  if (trimmed === 'undefined') return { kind: 'refused', code: 'undefined_value', path: '$' }
  if (trimmed === 'NaN' || trimmed === 'Infinity' || trimmed === '-Infinity') {
    return { kind: 'refused', code: 'non_finite_number', path: '$' }
  }
  try {
    const parser = new StrictJsonParser(source)
    return { kind: 'parsed', value: parser.parse() }
  } catch (error) {
    if (error instanceof ParseRefusal) return { kind: 'refused', code: error.code, path: error.path }
    throw error
  }
}

const MAXIMUM_JSON_DEPTH = 100

class StrictJsonParser {
  private position = 0

  constructor(private readonly source: string) {}

  parse(): CanonicalJson {
    this.skipWhitespace()
    const value = this.parseValue('$', 0)
    this.skipWhitespace()
    if (this.position !== this.source.length) this.refuse('invalid_json', '$')
    return value
  }

  private parseValue(path: string, depth: number): CanonicalJson {
    if (depth > MAXIMUM_JSON_DEPTH) this.refuse('maximum_depth_exceeded', path)
    this.skipWhitespace()
    const token = this.source[this.position]
    if (token === '"') return this.parseString(path)
    if (token === '{') return this.parseObject(path, depth)
    if (token === '[') return this.parseArray(path, depth)
    if (token === '-' || (token !== undefined && token >= '0' && token <= '9')) return this.parseNumber(path)
    if (this.consumeLiteral('true')) return true
    if (this.consumeLiteral('false')) return false
    if (this.consumeLiteral('null')) return null
    this.refuse('invalid_json', path)
  }

  private parseObject(path: string, depth: number): CanonicalJson {
    this.position += 1
    const value: Record<string, CanonicalJson> = Object.create(null) as Record<string, CanonicalJson>
    const keys = new Set<string>()
    this.skipWhitespace()
    if (this.consume('}')) return value
    while (true) {
      this.skipWhitespace()
      if (this.source[this.position] !== '"') this.refuse('invalid_json', path)
      const key = this.parseString(path)
      const keyPath = `${path}[${JSON.stringify(key)}]`
      if (keys.has(key)) this.refuse('duplicate_key', keyPath)
      keys.add(key)
      this.skipWhitespace()
      if (!this.consume(':')) this.refuse('invalid_json', keyPath)
      value[key] = this.parseValue(keyPath, depth + 1)
      this.skipWhitespace()
      if (this.consume('}')) return value
      if (!this.consume(',')) this.refuse('invalid_json', path)
    }
  }

  private parseArray(path: string, depth: number): CanonicalJson {
    this.position += 1
    const value: CanonicalJson[] = []
    this.skipWhitespace()
    if (this.consume(']')) return value
    while (true) {
      value.push(this.parseValue(`${path}[${value.length}]`, depth + 1))
      this.skipWhitespace()
      if (this.consume(']')) return value
      if (!this.consume(',')) this.refuse('invalid_json', path)
    }
  }

  private parseString(path: string): string {
    const start = this.position
    this.position += 1
    while (this.position < this.source.length) {
      const code = this.source.charCodeAt(this.position)
      if (code === 0x22) {
        this.position += 1
        try {
          return JSON.parse(this.source.slice(start, this.position)) as string
        } catch {
          this.refuse('invalid_json', path)
        }
      }
      if (code === 0x5C) {
        this.position += 2
        continue
      }
      if (code < 0x20) this.refuse('invalid_json', path)
      this.position += 1
    }
    this.refuse('invalid_json', path)
  }

  private parseNumber(path: string): number {
    const rest = this.source.slice(this.position)
    const match = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(rest)
    if (match === null) this.refuse('invalid_json', path)
    this.position += match[0].length
    const value = Number(match[0])
    if (!Number.isFinite(value)) this.refuse('non_finite_number', path)
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) this.refuse('unsafe_integer', path)
    return value
  }

  private consumeLiteral(literal: string): boolean {
    if (!this.source.startsWith(literal, this.position)) return false
    this.position += literal.length
    return true
  }

  private consume(character: string): boolean {
    if (this.source[this.position] !== character) return false
    this.position += 1
    return true
  }

  private skipWhitespace(): void {
    while (' \t\r\n'.includes(this.source[this.position] ?? '\0')) this.position += 1
  }

  private refuse(code: CanonicalizationRefusalCode, path: string): never {
    throw new ParseRefusal(code, path)
  }
}
