import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { findFiles } from '@/lib/ui/contract-scans'

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

  it('keeps intent compilation structurally unable to call providers or grant approval', () => {
    const compiler = readFileSync(join(root, 'src/modules/customer-request/compiler.ts'), 'utf8')

    expect(compiler).not.toMatch(/modules\/routing-kernel|CustomerRequestActionRouter|ApprovalGrant|execute\s*:/)
  })

  it('keeps uncommitted route-step authority construction behind the admission mutation', () => {
    const consumers = findFiles([
      { root: 'src', includeExtensions: ['.ts', '.tsx'] },
      { root: 'convex', includeExtensions: ['.ts'], exclude: ['convex/_generated'] },
    ]).filter((file) => file !== 'src/modules/customer-request/route-mandate-admission.ts'
      && !file.endsWith('.test.ts')
      && /deriveRouteStepAuthority|bindRouteStepGrantToReservation/.test(readFileSync(file, 'utf8')))

    expect(consumers).toEqual(['convex/customerRequestRouteMandateAdmission.ts'])
    expect(readFileSync(join(root, 'src/modules/customer-request/public.ts'), 'utf8'))
      .not.toMatch(/deriveRouteStepAuthority|bindRouteStepGrantToReservation/)
  })
})
