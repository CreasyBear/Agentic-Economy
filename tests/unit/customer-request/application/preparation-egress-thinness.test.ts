import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../../helpers/source-files'

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

  it('keeps recoverUnresolvedEgress out of the Convex host and authorizes via authorize-preparation', () => {
    expect(convexHost).toContain("from '@/modules/customer-request/application/public'")
    expect(convexHost).toContain('authorizePreparation as authorizePreparationApplication')
    expect(convexHost).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+recoverUnresolvedEgress\b/)
    expect(convexHost).not.toContain('recoverUnresolvedEgress as recoverUnresolvedEgressApplication')
    expect(convexHost).not.toContain('preparationEgressPorts')

    const portsSource = readFileSync('convex/customerRequestProvideFactsPorts.ts', 'utf8')
      + readFileSync('convex/customerRequestRefinePorts.ts', 'utf8')
      + readFileSync('convex/customerRequestCompareResumePorts.ts', 'utf8')
    expect(portsSource).toContain('recoverUnresolvedEgress')
    expect(portsSource).toContain('preparationEgressPorts')
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


