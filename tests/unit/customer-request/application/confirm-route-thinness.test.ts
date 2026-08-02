import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../../helpers/source-files'

const convexHost = readFileSync('convex/customerRequestApplication.ts', 'utf8')
const portsSource = readFileSync('convex/customerRequestConfirmRoutePorts.ts', 'utf8')
const moduleRoot = 'src/modules/customer-request/application/confirm-route'
const standingRoot = 'src/modules/customer-request/application/standing-route'

const movedSymbols = [
  'confirmCustomerRoute',
] as const

describe('customer-request confirm-route thinness', () => {
  it('does not redefine moved confirm-route helpers in Convex host', () => {
    for (const symbol of movedSymbols) {
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
    }
  })

  it('keeps thin Convex confirm adapter that delegates through application/public', () => {
    expect(convexHost).toContain("from '@/modules/customer-request/application/public'")
    expect(convexHost).toContain('confirmCustomerRoute')
    expect(convexHost).toContain('confirmRoutePorts')
    expect(convexHost).toMatch(/export const confirmRoute\s*=/)

    const confirmStart = convexHost.indexOf('export const confirmRoute = action({')
    expect(confirmStart).toBeGreaterThanOrEqual(0)
    const confirmBody = convexHost.slice(confirmStart, confirmStart + 900)
    expect(confirmBody).toContain('confirmCustomerRoute')
    expect(confirmBody).toContain('confirmRoutePorts')
    expect(confirmBody).not.toContain('getCurrentRoutePlanGeneration')
    expect(confirmBody).not.toContain('customerRequestRouteMandate.issue')
    expect(confirmBody).not.toContain('projectConfirmedRoute')
    expect(confirmBody).not.toContain('maximumTotalCost')
  })

  it('wires issueConfirmMandate only through confirm-route ports', () => {
    expect(portsSource).toContain('issueConfirmMandate')
    expect(portsSource).toContain('customerRequestRouteMandate.issue')
    expect(portsSource).not.toMatch(/compileRouteMandate/)
    expect(portsSource).not.toMatch(/evaluateStandingRouteAuthority/)
  })

  it('keeps confirm-route free of Convex runtime and mandate merge helpers', () => {
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
      expect(source).not.toMatch(/\brefine\b/)
      expect(source).not.toMatch(/publish/)
      expect(source).not.toMatch(/journal/)
    }
  })

  it('re-exports confirm-route through application/public', () => {
    const publicSource = readFileSync(
      'src/modules/customer-request/application/public.ts',
      'utf8',
    )
    expect(publicSource).toContain("from './confirm-route'")
    expect(publicSource).toContain('confirmCustomerRoute')
    expect(publicSource).toContain('ConfirmRoutePorts')
    expect(publicSource).toContain('IssueConfirmMandateResult')
  })

  it('does not add confirm/mandate symbols into standing-route', () => {
    for (const file of listTsFiles(standingRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/confirmCustomerRoute/)
      expect(source).not.toMatch(/issueConfirmMandate/)
      expect(source).not.toMatch(/ConfirmRoutePorts/)
      expect(source).not.toMatch(/customerRequestRouteMandate/)
    }
  })

  it('does not export use-prefixed confirm helpers', () => {
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/export\s+(?:async\s+)?function\s+use[A-Z]/)
      expect(source).not.toMatch(/export\s+\{[^}]*\buse[A-Z]/)
    }
  })
})


