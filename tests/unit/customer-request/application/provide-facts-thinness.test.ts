import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const convexHost = readFileSync('convex/customerRequestApplication.ts', 'utf8')
const portsSource = readFileSync('convex/customerRequestProvideFactsPorts.ts', 'utf8')
const moduleRoot = 'src/modules/customer-request/application/provide-facts'
const refineRoot = 'src/modules/customer-request/application/refine'
const confirmRoot = 'src/modules/customer-request/application/confirm-route'
const standingRoot = 'src/modules/customer-request/application/standing-route'
const compareRoot = 'src/modules/customer-request/application/compare-resume'

const movedSymbols = [
  'provideCustomerRequestFacts',
] as const

describe('customer-request provide-facts thinness', () => {
  it('does not redefine moved provide-facts helpers in Convex host', () => {
    for (const symbol of movedSymbols) {
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
    }
  })

  it('keeps thin Convex provideFacts adapter that delegates through application/public', () => {
    expect(convexHost).toContain("from '@/modules/customer-request/application/public'")
    expect(convexHost).toContain('provideCustomerRequestFacts')
    expect(convexHost).toContain('provideFactsPorts')
    expect(convexHost).toMatch(/export const provideFacts\s*=/)

    const provideStart = convexHost.indexOf('export const provideFacts = action({')
    expect(provideStart).toBeGreaterThanOrEqual(0)
    const provideEnd = convexHost.indexOf('export const resume = action({', provideStart)
    expect(provideEnd).toBeGreaterThan(provideStart)
    const provideBody = convexHost.slice(provideStart, provideEnd)
    expect(provideBody).toContain('provideCustomerRequestFacts')
    expect(provideBody).toContain('provideFactsPorts')
    expect(provideBody).not.toContain('bindRequirementAnswer')
    expect(provideBody).not.toContain('rebindStoredFacts')
    expect(provideBody).not.toContain('requirement-answer')
    expect(provideBody).not.toContain('registrySnapshotDigest')
    expect(provideBody).not.toContain('loadRequestGraph')
    expect(provideBody.split('\n').length).toBeLessThanOrEqual(30)
  })

  it('wires compileCommit only through provide-facts ports', () => {
    expect(portsSource).toContain('compileCommit')
    expect(portsSource).not.toContain('interpretCompileCommit')
    expect(portsSource).not.toMatch(/compileCustomerRequest/)
    expect(portsSource).not.toMatch(/createConfiguredRequestInterpreter/)
  })

  it('keeps provide-facts free of Convex runtime and dual compilers', () => {
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
      expect(source).not.toMatch(/interpretCompileCommit/)
      expect(source).not.toMatch(/\bwritableView\b/)
    }
  })

  it('re-exports provide-facts through application/public', () => {
    const publicSource = readFileSync(
      'src/modules/customer-request/application/public.ts',
      'utf8',
    )
    expect(publicSource).toContain("from './provide-facts'")
    expect(publicSource).toContain('provideCustomerRequestFacts')
    expect(publicSource).toContain('ProvideFactsPorts')
    expect(publicSource).toContain('ProvideFactsInput')
  })

  it('does not add provide-facts symbols into refine/confirm/standing/compare packages', () => {
    for (const root of [refineRoot, confirmRoot, standingRoot, compareRoot]) {
      for (const file of listTsFiles(root)) {
        const source = readFileSync(file, 'utf8')
        expect(source).not.toMatch(/provideCustomerRequestFacts/)
        expect(source).not.toMatch(/ProvideFactsPorts/)
        expect(source).not.toMatch(/requirement-answer/)
      }
    }
  })

  it('does not export use-prefixed provide-facts helpers', () => {
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/export\s+(?:async\s+)?function\s+use[A-Z]/)
      expect(source).not.toMatch(/export\s+\{[^}]*\buse[A-Z]/)
    }
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
