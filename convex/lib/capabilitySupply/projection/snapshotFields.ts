import { isRecord } from '@/modules/common/is-record'

export function readRecord(value: unknown, error: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(error)
  return value
}

export function readString(value: unknown, error: string, nonEmpty = false): string {
  if (typeof value !== 'string' || (nonEmpty && value.trim().length === 0)) throw new Error(error)
  return value
}

export function readOptionalString(value: unknown, error: string): string | undefined {
  return value === undefined ? undefined : readString(value, error)
}

export function readNumber(value: unknown, error: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(error)
  return value
}

export function readOptionalNumber(value: unknown, error: string): number | undefined {
  return value === undefined ? undefined : readNumber(value, error)
}

export function readBoolean(value: unknown, error: string): boolean {
  if (typeof value !== 'boolean') throw new Error(error)
  return value
}

export function readArray(value: unknown, error: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(error)
  return value
}

export function readLiteral<Value extends string>(value: unknown, values: readonly Value[], error: string): Value {
  if (!values.includes(value as Value)) throw new Error(error)
  return value as Value
}
