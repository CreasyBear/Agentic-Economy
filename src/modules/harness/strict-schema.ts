import type { JSONSchema } from '@tanstack/ai'

type JsonSchemaRecord = Record<string, unknown>

export type StrictSchemaViolation = {
  path: string
  reason: string
}

export function findStrictToolSchemaViolation(schema: JSONSchema | undefined): StrictSchemaViolation | null {
  if (schema === undefined) {
    return null
  }
  return walkSchema(schema as unknown, '$')
}

function walkSchema(value: unknown, path: string): StrictSchemaViolation | null {
  if (!isRecord(value)) {
    return null
  }

  const allowedTypes = readAllowedTypes(value.type)
  const enumValues = Array.isArray(value.enum) ? value.enum : undefined
  if (enumValues !== undefined && allowedTypes.length > 0) {
    for (let index = 0; index < enumValues.length; index += 1) {
      const enumValue = enumValues[index]
      if (!matchesAnyJsonType(enumValue, allowedTypes)) {
        return {
          path: `${path}.enum[${index}]`,
          reason: `enum value ${JSON.stringify(enumValue)} does not match declared type ${allowedTypes.join('|')}`,
        }
      }
    }
  }

  if (Object.hasOwn(value, 'const') && allowedTypes.length > 0) {
    const constant = value.const
    if (!matchesAnyJsonType(constant, allowedTypes)) {
      return {
        path: `${path}.const`,
        reason: `const value ${JSON.stringify(constant)} does not match declared type ${allowedTypes.join('|')}`,
      }
    }
  }

  const nested = [
    nestedRecord(value.properties, `${path}.properties`),
    nestedRecord(value.$defs, `${path}.$defs`),
    nestedRecord(value.definitions, `${path}.definitions`),
    nestedArray(value.anyOf, `${path}.anyOf`),
    nestedArray(value.allOf, `${path}.allOf`),
    nestedArray(value.oneOf, `${path}.oneOf`),
    nestedValue(value.items, `${path}.items`),
    nestedValue(value.additionalProperties, `${path}.additionalProperties`),
  ]

  for (const candidates of nested) {
    for (const candidate of candidates) {
      const violation = walkSchema(candidate.value, candidate.path)
      if (violation !== null) {
        return violation
      }
    }
  }

  return null
}

function nestedRecord(value: unknown, path: string): readonly { value: unknown; path: string }[] {
  if (!isRecord(value)) {
    return []
  }
  return Object.entries(value).map(([key, child]) => ({
    value: child,
    path: `${path}.${key}`,
  }))
}

function nestedArray(value: unknown, path: string): readonly { value: unknown; path: string }[] {
  if (!Array.isArray(value)) {
    return []
  }
  return value.map((child, index) => ({
    value: child,
    path: `${path}[${index}]`,
  }))
}

function nestedValue(value: unknown, path: string): readonly { value: unknown; path: string }[] {
  return isRecord(value) || Array.isArray(value) ? [{ value, path }] : []
}

function readAllowedTypes(type: unknown): readonly string[] {
  if (typeof type === 'string') {
    return [type]
  }
  if (Array.isArray(type)) {
    return type.filter((entry): entry is string => typeof entry === 'string')
  }
  return []
}

function matchesAnyJsonType(value: unknown, types: readonly string[]): boolean {
  return types.some((type) => matchesJsonType(value, type))
}

function matchesJsonType(value: unknown, type: string): boolean {
  switch (type) {
    case 'string':
      return typeof value === 'string'
    case 'number':
      return typeof value === 'number'
    case 'integer':
      return typeof value === 'number' && Number.isInteger(value)
    case 'boolean':
      return typeof value === 'boolean'
    case 'object':
      return isRecord(value)
    case 'array':
      return Array.isArray(value)
    case 'null':
      return value === null
    default:
      return true
  }
}

function isRecord(value: unknown): value is JsonSchemaRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
