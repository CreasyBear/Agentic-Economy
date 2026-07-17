import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const convexHost = readFileSync('convex/customerRequestApplication.ts', 'utf8')
const moduleRoot = 'src/modules/customer-request/application/compare-resume'

const movedSymbols = [
  'routesAreCurrent',
  'hasTransientBindingUnavailable',
  'routeRefreshCommand',
  'refreshCurrentRouteGeneration',
  'persistRetryableRouteRefresh',
  'projectGenerationRefreshResult',
  'prepareCompare',
  'resumeCustomerRequest',
] as const

describe('customer-request compare-resume thinness', () => {
  it('does not redefine moved compare/resume helpers in Convex host', () => {
    for (const symbol of movedSymbols) {
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
    }
    expect(convexHost).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+prepareCurrentAction\b/)
    expect(convexHost).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+generationRefreshResultView\b/)
  })

  it('keeps thin Convex resume/compare adapters that delegate through application/public', () => {
    expect(convexHost).toContain("from '@/modules/customer-request/application/public'")
    expect(convexHost).toContain('resumeCustomerRequest')
    expect(convexHost).toContain('prepareCompare')
    expect(convexHost).toContain('compareResumePorts')
    expect(convexHost).toMatch(/export const resume\s*=/)
    expect(convexHost).toMatch(/export const compare\s*=/)

    const resumeStart = convexHost.indexOf('async function resumeRequest(')
    expect(resumeStart).toBeGreaterThanOrEqual(0)
    const resumeBody = convexHost.slice(resumeStart, resumeStart + 500)
    expect(resumeBody).toContain('resumeCustomerRequest')
    expect(resumeBody).not.toContain('getCurrentRoutePlanGeneration')
    expect(resumeBody).not.toContain('recoverUnresolvedEgressApplication')
  })

  it('keeps compare-resume free of Convex runtime and dual compilers', () => {
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
      expect(source).not.toMatch(/exportState/)
    }
  })

  it('re-exports compare-resume through application/public', () => {
    const publicSource = readFileSync(
      'src/modules/customer-request/application/public.ts',
      'utf8',
    )
    expect(publicSource).toContain("from './compare-resume'")
    expect(publicSource).toContain('prepareCompare')
    expect(publicSource).toContain('resumeCustomerRequest')
    expect(publicSource).toContain('routesAreCurrent')
    expect(publicSource).toContain('projectGenerationRefreshResult')
  })

  it('does not move standing-route or problem hosts into compare-resume', () => {
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/StandingRoute/)
      expect(source).not.toMatch(/problem-tracking/)
      expect(source).not.toMatch(/confirmRoute/)
    }
    expect(convexHost).toMatch(/export const confirmRoute\s*=/)
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
