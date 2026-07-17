import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const convexHost = readFileSync('convex/customerRequestApplication.ts', 'utf8')
const moduleRoot = 'src/modules/customer-request/application/standing-route'

const movedSymbols = [
  'listStandingRouteAssistants',
  'allowStandingRoute',
  'applyStandingRoute',
  'inspectStandingRoute',
  'revokeStandingRoute',
  'projectRepeatPermission',
  'repeatPermissionRef',
  'resolveSelectableCurrentRoute',
] as const

describe('customer-request standing-route thinness', () => {
  it('does not redefine moved standing-route helpers in Convex host', () => {
    for (const symbol of movedSymbols) {
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
    }
  })

  it('keeps thin Convex repeat adapters that delegate through application/public', () => {
    expect(convexHost).toContain("from '@/modules/customer-request/application/public'")
    expect(convexHost).toContain('listStandingRouteAssistants')
    expect(convexHost).toContain('allowStandingRoute')
    expect(convexHost).toContain('applyStandingRoute')
    expect(convexHost).toContain('inspectStandingRoute')
    expect(convexHost).toContain('revokeStandingRoute')
    expect(convexHost).toContain('standingRoutePorts')
    expect(convexHost).toMatch(/export const listRepeatPermissionAssistants\s*=/)
    expect(convexHost).toMatch(/export const allowRepeatRoute\s*=/)
    expect(convexHost).toMatch(/export const useRepeatRoute\s*=/)
    expect(convexHost).toMatch(/export const inspectRepeatRoute\s*=/)
    expect(convexHost).toMatch(/export const revokeRepeatRoute\s*=/)

    const allowStart = convexHost.indexOf('export const allowRepeatRoute = action({')
    expect(allowStart).toBeGreaterThanOrEqual(0)
    const allowBody = convexHost.slice(allowStart, allowStart + 1_200)
    expect(allowBody).toContain('allowStandingRoute')
    expect(allowBody).not.toContain('customerRequestStandingRoutePolicy.issue')
    expect(allowBody).not.toContain('getCurrentRoutePlanGeneration')
  })

  it('keeps standing-route free of Convex runtime, dual compilers, and mandate merge helpers', () => {
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
      expect(source).not.toMatch(/customerRequestRouteMandate\.issue/)
      expect(source).not.toMatch(/compileRouteMandate/)
      expect(source).not.toMatch(/evaluateStandingRouteAuthority/)
      expect(source).not.toMatch(/exportState/)
    }
  })

  it('re-exports standing-route through application/public', () => {
    const publicSource = readFileSync(
      'src/modules/customer-request/application/public.ts',
      'utf8',
    )
    expect(publicSource).toContain("from './standing-route'")
    expect(publicSource).toContain('allowStandingRoute')
    expect(publicSource).toContain('applyStandingRoute')
    expect(publicSource).toContain('listStandingRouteAssistants')
    expect(publicSource).toContain('repeatPermissionRef')
    expect(publicSource).toContain('resolveSelectableCurrentRoute')
  })

  it('does not move confirmRoute mandate body into standing-route', () => {
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/customerRequestRouteMandate/)
      expect(source).not.toMatch(/confirmRoute/)
    }
    expect(convexHost).toMatch(/export const confirmRoute\s*=/)
    expect(convexHost).toContain('customerRequestRouteMandate.issue')
  })
})

function listTsFiles(directory: string): string[] {
  const entries = readdirSync(directory)
  const files: string[] = []
  for (const entry of entries) {
    const path = join(directory, entry)
    const stats = statSync(path)
    if (stats.isDirectory()) files.push(...listTsFiles(path))
    else if (entry.endsWith('.ts')) files.push(path)
  }
  return files
}
