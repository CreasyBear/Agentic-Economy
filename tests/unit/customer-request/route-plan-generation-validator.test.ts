import { describe, expect, it } from 'vitest'
import type { Infer } from 'convex/values'

import { routePlanGenerationV2Value } from '@/modules/customer-request/internal/convex-v2-schema'
import type { CustomerRequestRoutePlanGeneration } from '@/modules/customer-request/route-plan-generation'

type DeepReadonly<Value> = Value extends (...args: never[]) => unknown
  ? Value
  : Value extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value

type ValidatorType = DeepReadonly<Infer<typeof routePlanGenerationV2Value>>
type DomainType = CustomerRequestRoutePlanGeneration

function validatorAcceptsDomain(value: DomainType): ValidatorType {
  return value
}

describe('route plan generation validator', () => {
  it('accepts every value emitted by the domain contract', () => {
    expect(validatorAcceptsDomain).toBeTypeOf('function')
  })
})
