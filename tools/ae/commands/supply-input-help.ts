import { convertSchemaToJsonSchema, type JSONSchema } from '@tanstack/ai'
import type { z } from 'zod'

/**
 * Required `--input` fields and a minimal matching example for one supply
 * write subcommand, derived from the exact zod schema the command already
 * validates `--input` against (`descriptor.action.schema`). Never hand-write
 * a second required-field list here: if the schema changes, this derivation
 * changes with it.
 */

type JsonObjectSchema = JSONSchema & Readonly<{ type: 'object'; properties: Record<string, JSONSchema> }>

function firstBranch(schema: JSONSchema): JSONSchema | undefined {
  return schema.anyOf?.[0] ?? schema.oneOf?.[0]
}

function objectSchemaOf(schema: JSONSchema | undefined): JsonObjectSchema | undefined {
  if (schema === undefined) return undefined
  if (schema.type === 'object' && schema.properties !== undefined) return schema as JsonObjectSchema
  const branch = firstBranch(schema)
  return branch === undefined ? undefined : objectSchemaOf(branch)
}

/** A schema-shaped placeholder value; not guaranteed to satisfy cross-field refinements. */
function exampleValueFor(schema: JSONSchema | undefined): unknown {
  if (schema === undefined) return 'example'
  if (schema.enum !== undefined && schema.enum.length > 0) return schema.enum[0]
  if (schema.const !== undefined) return schema.const
  const branch = firstBranch(schema)
  if (branch !== undefined) return exampleValueFor(branch)
  if (schema.type === 'object') {
    const required = schema.required ?? []
    const value: Record<string, unknown> = {}
    for (const key of required) value[key] = exampleValueFor(schema.properties?.[key])
    return value
  }
  if (schema.type === 'array') return []
  if (schema.type === 'integer' || schema.type === 'number') {
    if (typeof schema.minimum === 'number') return schema.minimum
    if (typeof schema.exclusiveMinimum === 'number') return schema.exclusiveMinimum + 1
    return 1
  }
  if (schema.type === 'boolean') return true
  if (typeof schema.pattern === 'string' && schema.pattern.includes('sha256')) return `sha256:${'a'.repeat(64)}`
  if (typeof schema.pattern === 'string' && schema.pattern.includes('0x')) return `0x${'1'.repeat(40)}`
  if (schema.format === 'uri') return 'https://example.com/pay'
  return 'example'
}

function requiredFieldLabel(name: string, propertySchema: JSONSchema | undefined): string {
  const nested = objectSchemaOf(propertySchema)
  if (nested?.required !== undefined && nested.required.length > 0) {
    return `${name} (${nested.required.join(', ')})`
  }
  return name
}

export type RequiredInputFieldsSummary = Readonly<{
  /** Top-level required field names; nested required object fields are parenthesized. */
  fields: readonly string[]
  /** A minimal JSON object built from the same required keys. */
  example: Record<string, unknown>
}>

export function requiredInputFieldsSummary(schema: z.ZodType): RequiredInputFieldsSummary {
  const jsonSchema = objectSchemaOf(convertSchemaToJsonSchema(schema))
  const required = jsonSchema?.required ?? []
  return {
    fields: required.map((name) => requiredFieldLabel(name, jsonSchema?.properties[name])),
    example: Object.fromEntries(required.map((name) => [name, exampleValueFor(jsonSchema?.properties[name])])),
  }
}

/** Help-text lines: `Required input fields: …` followed by a runnable `--input` example. */
export function requiredInputFieldsGuidance(schema: z.ZodType): readonly string[] {
  const { fields, example } = requiredInputFieldsSummary(schema)
  if (fields.length === 0) return []
  return [
    `Required input fields: ${fields.join(', ')}.`,
    `Example: --input '${JSON.stringify(example)}'`,
  ]
}
