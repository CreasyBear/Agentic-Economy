export function requiredString<Row extends object>(row: Row, field: keyof Row): string {
  const value = row[field]
  if (typeof value !== 'string') throw new Error(`invalid_projection_${String(field)}`)
  return value
}

export function optionalString<Row extends object>(row: Row, field: keyof Row): string | undefined {
  const value = row[field]
  if (value === undefined) return undefined
  if (typeof value !== 'string') throw new Error(`invalid_projection_${String(field)}`)
  return value
}

export function requiredNumber<Row extends object>(row: Row, field: keyof Row): number {
  const value = row[field]
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`invalid_projection_${String(field)}`)
  return value
}

export function optionalNumber<Row extends object>(row: Row, field: keyof Row): number | undefined {
  const value = row[field]
  if (value === undefined) return undefined
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`invalid_projection_${String(field)}`)
  return value
}

export function readLiteral<Value extends string>(value: unknown, values: readonly Value[], field: string): Value {
  if (typeof value !== 'string') throw new Error(`invalid_projection_${field}`)
  const match = values.find((candidate) => candidate === value)
  if (match === undefined) throw new Error(`invalid_projection_${field}`)
  return match
}
