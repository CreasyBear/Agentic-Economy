import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../../helpers/source-files'

const convexHost = readFileSync('convex/customerRequestApplication.ts', 'utf8')
const portsSource = readFileSync('convex/customerRequestRefinePorts.ts', 'utf8')
const moduleRoot = 'src/modules/customer-request/application/refine'
const confirmRoot = 'src/modules/customer-request/application/confirm-route'
const standingRoot = 'src/modules/customer-request/application/standing-route'
const compareRoot = 'src/modules/customer-request/application/compare-resume'

const movedSymbols = [
  'refineCustomerRequest',
] as const

describe('customer-request refine thinness', () => {
  it('does not redefine moved refine helpers in Convex host', () => {
    for (const symbol of movedSymbols) {
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
    }
  })

  it('keeps thin Convex refine adapter that delegates through application/public', () => {
    expect(convexHost).toContain("from '@/modules/customer-request/application/public'")
    expect(convexHost).toContain('refineCustomerRequest')
    expect(convexHost).toContain('refinePorts')
    expect(convexHost).toMatch(/export const refine\s*=/)

    const refineStart = convexHost.indexOf('export const refine = action({')
    expect(refineStart).toBeGreaterThanOrEqual(0)
    const refineEnd = convexHost.indexOf('export const provideFacts = action({', refineStart)
    expect(refineEnd).toBeGreaterThan(refineStart)
    const refineBody = convexHost.slice(refineStart, refineEnd)
    expect(refineBody).toContain('refineCustomerRequest')
    expect(refineBody).toContain('refinePorts')
    expect(refineBody).not.toContain('rebindStoredFacts')
    expect(refineBody).not.toContain('recordNoopCommand')
    expect(refineBody).not.toContain('reported-option-unavailable')
    expect(refineBody).not.toContain('routeExclusions.push')
    expect(refineBody).not.toContain('invalid_amendment')
    expect(refineBody).not.toContain('loadCurrentRouteGeneration')
    expect(refineBody.split('\n').length).toBeLessThanOrEqual(35)
  })

  it('wires compile/interpret only through refine ports', () => {
    expect(portsSource).toContain('compileCommit')
    expect(portsSource).toContain('interpretCompileCommit')
    expect(portsSource).toContain('recordNoopCommand')
    expect(portsSource).toContain('customerRequestV2.recordNoopCommand')
    expect(portsSource).not.toMatch(/compileCustomerRequest/)
    expect(portsSource).not.toMatch(/createConfiguredRequestInterpreter/)
  })

  it('keeps refine free of Convex runtime and dual compilers', () => {
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from\s+['"]\.\/_generated/)
      expect(source).not.toMatch(/from\s+['"][^'"]*_generated[^'"]*['"]/)
      expect(source).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
      expect(source).not.toMatch(/\bActionCtx\b/)
      expect(source).not.toMatch(/\bMutationCtx\b/)
      expect(source).not.toMatch(/\bDoc\s*</)
      expect(source).not.toMatch(/compileCustomerRequest/)
      expect(source).not.toMatch(/createConfiguredRequestInterpreter/)
      expect(source).not.toMatch(/customerRequestRouteMandate/)
      expect(source).not.toMatch(/compileRouteMandate/)
      expect(source).not.toMatch(/exportState/)
      expect(source).not.toMatch(/\bwithdraw\b/)
      expect(source).not.toMatch(/journal/)
    }
  })

  it('re-exports refine through application/public', () => {
    const publicSource = readFileSync(
      'src/modules/customer-request/application/public.ts',
      'utf8',
    )
    expect(publicSource).toContain("from './refine'")
    expect(publicSource).toContain('refineCustomerRequest')
    expect(publicSource).toContain('RefineCustomerRequestPorts')
    expect(publicSource).toContain('RefineCustomerRequestInput')
  })

  it('does not add refine symbols into confirm/standing/compare packages', () => {
    for (const root of [confirmRoot, standingRoot, compareRoot]) {
      for (const file of listTsFiles(root)) {
        const source = readFileSync(file, 'utf8')
        expect(source).not.toMatch(/refineCustomerRequest/)
        expect(source).not.toMatch(/RefineCustomerRequestPorts/)
        expect(source).not.toMatch(/recordNoopCommand/)
        expect(source).not.toMatch(/reported-option-unavailable/)
      }
    }
  })

  it('does not export use-prefixed refine helpers', () => {
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/export\s+(?:async\s+)?function\s+use[A-Z]/)
      expect(source).not.toMatch(/export\s+\{[^}]*\buse[A-Z]/)
    }
  })

  it('leaves authorizePreparation as a thin host adapter and withdraw outside refine', () => {
    expect(convexHost).toMatch(/export const authorizePreparation\s*=/)
    expect(convexHost).toContain('authorizePreparation as authorizePreparationApplication')
    expect(convexHost).toContain('authorizePreparationPorts')
    const capabilityHost = readFileSync('convex/capabilitySupply.ts', 'utf8')
    expect(capabilityHost).toMatch(/export const withdrawCapability\s*=/)
  })
})


