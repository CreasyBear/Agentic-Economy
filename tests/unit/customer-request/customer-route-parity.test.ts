import { describe, expect, it } from 'vitest'
import type { Infer } from 'convex/values'

import type { customerRoute } from '../../../convex/customerRequestApplication'
import type { CustomerRoutePlan } from '@/modules/customer-request/agent-contract'

type DeepReadonly<Value> = Value extends (...args: never[]) => unknown
  ? Value
  : Value extends readonly (infer Item)[]
    ? readonly DeepReadonly<Item>[]
    : Value extends object
      ? { readonly [Key in keyof Value]: DeepReadonly<Value[Key]> }
      : Value

// Convex models optional fields as clean-optional (absent key, no explicit `| undefined`), which
// is the wire shape it accepts. zod's `.optional()` OUTPUT type instead carries explicit
// `| undefined`. This parity gate asserts the validator accepts the domain's WIRE values, so we
// normalize the domain's optional output fields to the absent-optional shape Convex represents.
type OptionalToAbsent<Value> = Value extends object
  ? { [Key in keyof Value as undefined extends Value[Key] ? Key : never]?: Exclude<Value[Key], undefined> } &
    { [Key in keyof Value as undefined extends Value[Key] ? never : Key]: Value[Key] }
  : Value

type ValidatorType = DeepReadonly<Infer<typeof customerRoute>>
type DomainType = DeepReadonly<OptionalToAbsent<CustomerRoutePlan>>

function validatorAcceptsDomain(value: DomainType): ValidatorType {
  return value
}

describe('customer route parity gate', () => {
  it('host customerRoute validator accepts every value emitted by the module route-plan contract', () => {
    expect(validatorAcceptsDomain).toBeTypeOf('function')
  })
})
