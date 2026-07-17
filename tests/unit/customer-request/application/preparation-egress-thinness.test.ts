import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const convexHost = readFileSync('convex/customerRequestApplication.ts', 'utf8')
const moduleRoot = 'src/modules/customer-request/application/preparation-egress'

const movedPureSymbols = [
  'preparationResultView',
  'projectStoredPreparation',
  'projectEgressCustomerState',
  'projectPreparedAction',
  'preparedActionFailureSummary',
  'customerPurposeLabel',
] as const

const movedResolveSymbols = [
  'runPreparationEgress',
  'recoverUnresolvedEgress',
] as const

describe('customer-request preparation-egress thinness', () => {
  it('does not redefine moved pure projection helpers in Convex', () => {
    for (const symbol of movedPureSymbols) {
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
    }
    expect(convexHost).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+resolvePreparedAction\b/)
    expect(convexHost).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+resumePreparationEgress\b/)
  })

  it('keeps Convex wrappers thin and imports deepened behaviors from application/public', () => {
    expect(convexHost).toContain("from '@/modules/customer-request/application/public'")
    expect(convexHost).toContain('runPreparationEgress as runPreparationEgressApplication')
    expect(convexHost).toContain('recoverUnresolvedEgress as recoverUnresolvedEgressApplication')
    expect(convexHost).toContain('resumePreparationEgress as resumePreparationEgressApplication')
    expect(convexHost).toContain('preparationResultView')
    expect(convexHost).toContain('projectStoredPreparation')
    expect(convexHost).toContain('preparationEgressPorts')

    for (const symbol of movedResolveSymbols) {
      // Thin adapters may keep the local name; bodies must delegate, not reimplement.
      const start = convexHost.indexOf(`async function ${symbol}(`)
      expect(start).toBeGreaterThanOrEqual(0)
      const body = convexHost.slice(start, start + 450)
      expect(body).toContain(`${symbol}Application`)
      expect(body).not.toContain('ctx.runAction(internal.customerRequestV2PreparationEgress.run')
      expect(body).not.toContain('ctx.runMutation(internal.customerRequestV2PreparedAction.prepare')
      expect(body).not.toContain('preparedActionFailureSummary')
      expect(body).not.toContain('projectEgressCustomerState')
    }
  })

  it('does not move V2PreparationEgress hosts into the application module', () => {
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/customerRequestV2PreparationEgress/)
      expect(source).not.toMatch(/V2PreparationEgress/)
    }
    expect(convexHost).toContain('customerRequestV2PreparationEgress')
  })

  it('keeps preparation-egress free of Convex runtime and dual compilers', () => {
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
    }
  })

  it('re-exports preparation-egress through application/public', () => {
    const publicSource = readFileSync(
      'src/modules/customer-request/application/public.ts',
      'utf8',
    )
    expect(publicSource).toContain("from './preparation-egress'")
    expect(publicSource).toContain('runPreparationEgress')
    expect(publicSource).toContain('preparationResultView')
    expect(publicSource).toContain('recoverUnresolvedEgress')
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
