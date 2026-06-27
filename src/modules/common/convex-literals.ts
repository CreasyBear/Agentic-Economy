import { v } from 'convex/values'
import type { GenericValidator } from 'convex/values'

export type ConvexLiteralValue = string | number | boolean
export type AtLeastTwoLiterals<Value extends ConvexLiteralValue> = readonly [Value, Value, ...Value[]]

export function literalUnion<const Values extends AtLeastTwoLiterals<ConvexLiteralValue>>(
  values: Values
): GenericValidator {
  const validators = values.map((value) => v.literal(value)) as [
    GenericValidator,
    GenericValidator,
    ...GenericValidator[],
  ]

  return v.union(...validators)
}
