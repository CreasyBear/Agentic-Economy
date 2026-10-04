import Decimal from 'decimal.js'
import { readJsonPointer } from '@/modules/common/json-pointer'
import { serviceUnitDefinitionRef, type ServiceUnitDefinition } from '@/modules/capability-contract/public'

const ExactQuantity = Decimal.clone({ precision: 80 })
/** Canonical bounded provider quantities; no estimated timing/payload counts. */
export function declaredQuantityUnits(value: unknown, definition: ServiceUnitDefinition): string | null {
  let decimal: string
  if (definition.encoding === 'integer_number') {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return null
    decimal = String(value)
  } else {
    if (typeof value !== 'string' || !/^(?:0|[1-9]\d{0,39})(?:\.\d{1,12})?$/u.test(value)
      || (definition.encoding === 'integer_string' && value.includes('.'))) return null
    decimal = value
  }
  const quantity = new ExactQuantity(decimal).times(new ExactQuantity(10).pow(definition.quantityExponent))
  if (!quantity.isInteger() || quantity.isNegative() || quantity.greaterThan('9'.repeat(52))) return null
  return quantity.toFixed(0)
}
export function decodeDeclaredServiceUnits(definitions: readonly ServiceUnitDefinition[], output: unknown) {
  return definitions.map(definition => {
    const value = readJsonPointer(output, definition.outputPointer)
    const quantityUnits = declaredQuantityUnits(value, definition)
    return { unitDefinitionRef: serviceUnitDefinitionRef(definition), definition, quantityExponent: definition.quantityExponent,
      state: quantityUnits === null ? 'unknown' as const : 'observed' as const, quantityUnits,
      reason: quantityUnits !== null ? 'provider_reported' as const : value === undefined ? 'usage_missing' as const : 'usage_invalid' as const }
  })
}
export function formatServiceQuantity(units: string, exponent: number): string {
  return new ExactQuantity(units).div(new ExactQuantity(10).pow(exponent)).toFixed(exponent)
}
