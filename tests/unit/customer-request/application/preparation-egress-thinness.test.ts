import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const convexHost = readFileSync('convex/customerRequestApplication.ts', 'utf8')
const moduleRoot = 'src/modules/customer-request/application/preparation-egress'
const authorizeRoot = 'src/modules/customer-request/application/authorize-preparation'

const movedPureSymbols = [
  'preparationResultView',
  'projectStoredPreparation',
  'projectEgressCustomerState',
  'projectPreparedAction',
  'preparedActionFailureSummary',
  'customerPurposeLabel',
] as const

describe('customer-request preparation-egress thinness', () => {
  it('does not redefine moved pure projection helpers in Convex', () => {
    for (const symbol of movedPureSymbols) {
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
    }
    expect(convexHost).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+resolvePreparedAction\b/)
    expect(convexHost).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+resumePreparationEgress\b/)
    expect(convexHost).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+runPreparationEgress\b/)
  })

  it('keeps recoverUnresolvedEgress thin and composed authorize via authorize-preparation', () => {
    expect(convexHost).toContain("from '@/modules/customer-request/application/public'")
    expect(convexHost).toContain('recoverUnresolvedEgress as recoverUnresolvedEgressApplication')
    expect(convexHost).toContain('preparationEgressPorts')
    expect(convexHost).toContain('authorizePreparation as authorizePreparationApplication')

    const recoverStart = convexHost.indexOf('async function recoverUnresolvedEgress(')
    expect(recoverStart).toBeGreaterThanOrEqual(0)
    const recoverBody = convexHost.slice(recoverStart, recoverStart + 450)
    expect(recoverBody).toContain('recoverUnresolvedEgressApplication')
    expect(recoverBody).not.toContain('ctx.runAction(internal.customerRequestV2PreparationEgress.run')
    expect(recoverBody).not.toContain('ctx.runMutation(internal.customerRequestV2PreparedAction.prepare')
  })

  it('does not move V2PreparationEgress hosts into the application module', () => {
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/customerRequestV2PreparationEgress/)
      expect(source).not.toMatch(/V2PreparationEgress/)
    }
    expect(readFileSync('convex/customerRequestV2PreparationEgress.ts', 'utf8'))
      .toContain('customerRequestV2PreparationEgress')
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

  it('does not fold authorize-preparation into preparation-egress', () => {
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/authorizePreparation/)
      expect(source).not.toMatch(/AuthorizePreparationPorts/)
    }
    expect(readFileSync(`${authorizeRoot}/authorize.ts`, 'utf8')).toContain('runPreparationEgress')
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
