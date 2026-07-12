import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const root = process.cwd()

describe('customer request module boundaries', () => {
  it('makes CustomerRequest canonical and retires the rejected CustomerPlan prototype', () => {
    expect(existsSync(join(root, 'src/modules/customer-request/public.ts'))).toBe(true)
    expect(existsSync(join(root, 'src/modules/customer-request/runtime.ts'))).toBe(true)
    expect(existsSync(join(root, 'src/modules/customer-plan/public.ts'))).toBe(false)
    expect(existsSync(join(root, 'src/modules/customer-plan/kernel-adapter.ts'))).toBe(false)
  })

  it('keeps the customer contract independent from routing-kernel implementation details', () => {
    const publicContract = readFileSync(join(root, 'src/modules/customer-request/public.ts'), 'utf8')

    expect(publicContract).not.toMatch(/modules\/routing-kernel|RootRunSnapshot|NeutralRoutingKernel/)
  })
})
