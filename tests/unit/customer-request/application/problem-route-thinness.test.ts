import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../../helpers/source-files'

const convexHost = readFileSync('convex/customerRequestApplication.ts', 'utf8')
const moduleRoot = 'src/modules/customer-request/application/problem-route'

const movedSymbols = [
  'reportRouteProblem',
  'recordRouteProblemBusinessReport',
  'updateRouteProblemStatus',
  'replyRouteProblem',
  'exportRouteEvidence',
  'readRouteProblemForBusiness',
  'listRouteProblemsForSupport',
  'exportRouteProblemForSupport',
  'projectProblemReported',
  'projectProblemStatusChange',
] as const

describe('customer-request problem-route thinness', () => {
  it('does not redefine moved problem-route helpers in Convex host', () => {
    for (const symbol of movedSymbols) {
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
    }
  })

  it('keeps thin Convex problem adapters that delegate through application/public', () => {
    expect(convexHost).toContain("from '@/modules/customer-request/application/public'")
    expect(convexHost).toContain('reportRouteProblemApplication')
    expect(convexHost).toContain('recordRouteProblemBusinessReportApplication')
    expect(convexHost).toContain('updateRouteProblemStatusApplication')
    expect(convexHost).toContain('replyRouteProblemApplication')
    expect(convexHost).toContain('exportRouteEvidenceApplication')
    expect(convexHost).toContain('problemRoutePorts')
    expect(convexHost).toMatch(/export const reportRouteProblem\s*=/)
    expect(convexHost).toMatch(/export const recordRouteProblemBusinessReport\s*=/)
    expect(convexHost).toMatch(/export const updateRouteProblemStatus\s*=/)
    expect(convexHost).toMatch(/export const replyRouteProblem\s*=/)
    expect(convexHost).toMatch(/export const exportRouteEvidence\s*=/)

    const reportStart = convexHost.indexOf('export const reportRouteProblem = action({')
    expect(reportStart).toBeGreaterThanOrEqual(0)
    const reportBody = convexHost.slice(reportStart, reportStart + 2_000)
    expect(reportBody).toContain('reportRouteProblemApplication')
    expect(reportBody).not.toContain('customerRequestRouteExecution.reportProblem')
    expect(reportBody).not.toContain('projectCustomerRequestProblemTracking')
  })

  it('keeps problem-route free of Convex runtime and problem-support relocation', () => {
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from\s+['"]\.\/_generated/)
      expect(source).not.toMatch(/from\s+['"][^'"]*_generated[^'"]*['"]/)
      expect(source).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
      expect(source).not.toMatch(/\bActionCtx\b/)
      expect(source).not.toMatch(/\bMutationCtx\b/)
      expect(source).not.toMatch(/\bDoc\s*</)
      expect(source).not.toMatch(/decideCustomerProblemReport/)
      expect(source).not.toMatch(/decideBusinessProblemClaim/)
      expect(source).not.toMatch(/decideSupportProblemStatus/)
      expect(source).not.toMatch(/decideCustomerProblemReply/)
      expect(source).not.toMatch(/customerRequestRouteMandate/)
      expect(source).not.toMatch(/confirmRoute/)
    }
  })

  it('re-exports problem-route through application/public', () => {
    const publicSource = readFileSync(
      'src/modules/customer-request/application/public.ts',
      'utf8',
    )
    expect(publicSource).toContain("from './problem-route'")
    expect(publicSource).toContain('reportRouteProblem')
    expect(publicSource).toContain('exportRouteEvidence')
    expect(publicSource).toContain('projectProblemReported')
    expect(publicSource).toContain('ProblemRoutePorts')
  })

  it('does not move confirmRoute mandate body into problem-route', () => {
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/customerRequestRouteMandate/)
      expect(source).not.toMatch(/confirmRoute/)
    }
    expect(convexHost).toMatch(/export const confirmRoute\s*=/)
    expect(readFileSync('convex/customerRequestConfirmRoutePorts.ts', 'utf8'))
      .toContain('customerRequestRouteMandate.issue')
  })

  it('leaves problem-support decision modules in place', () => {
    expect(statSync('src/modules/customer-request/route-execution/problem-support/commands.ts').isFile()).toBe(true)
    expect(statSync('src/modules/customer-request/route-execution/problem-support/projections.ts').isFile()).toBe(true)
    expect(statSync('src/modules/customer-request/route-execution/problem-support/tracking.ts').isFile()).toBe(true)
  })
})


