import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../../helpers/source-files'

const convexHost = readFileSync('convex/customerRequestRouteExecution.ts', 'utf8')
const problemPortsSource = readFileSync(
  'convex/customerRequestRouteExecutionProblemPorts.ts',
  'utf8',
)
const machinesRoot = 'src/modules/customer-request/route-execution/machines'
const problemSupportRoot = 'src/modules/customer-request/route-execution/problem-support'

describe('customer-request route-execution problem support-read thinness', () => {
  it('keeps exportProblemForSupport as a thin auth + ports + project shell', () => {
    expect(convexHost).toMatch(/export const exportProblemForSupport\s*=/)
    expect(convexHost).toContain('problemSupportReadPorts(ctx)')
    expect(convexHost).toContain('loadSupportExportMaterial')
    expect(convexHost).toContain('projectSupportProblemExport')
    expect(convexHost).toContain("from './customerRequestRouteExecutionProblemPorts'")

    const start = convexHost.indexOf('export const exportProblemForSupport = internalQuery({')
    expect(start).toBeGreaterThanOrEqual(0)
    const end = convexHost.indexOf('const exportedStepState = v.union(', start)
    expect(end).toBeGreaterThan(start)
    const body = convexHost.slice(start, end)
    expect(body).toContain('resolveAdminAuthority')
    expect(body).toContain('problemSupportReadPorts(ctx)')
    expect(body).toContain('ports.loadSupportExportMaterial')
    expect(body).toContain('projectSupportProblemExport')
    expect(body.split('\n').length).toBeLessThanOrEqual(50)
    expect(body).not.toContain('Promise.all')
    expect(body).not.toContain('.collect()')
    expect(body).not.toContain("query('customerRequestRouteProblemReports')")
    expect(body).not.toContain("query('customerRequestRouteStepAttempts')")
    expect(body).not.toContain("query('customerRequestV2Revisions')")
    expect(body).not.toContain("query('customerRequestRouteMandateIssues')")
    expect(body).not.toContain("query('customerRequestRouteRuns')")
    expect(body).not.toContain("query('customerRequestRouteMandateRevocations')")
    expect(body).not.toContain("query('customerRequestRouteStepReservations')")
    expect(body).not.toContain('loadProblemUpdates')
    expect(body).not.toContain('loadProblemBusinessReports')
    expect(body).not.toContain('evidenceLoadPorts(ctx)')
    expect(body).not.toContain('businessNames.set')
  })

  it('hosts ProblemSupportReadPorts on the ProblemPorts adapter under 1000 lines', () => {
    expect(statSync('convex/customerRequestRouteExecutionProblemPorts.ts').isFile()).toBe(true)
    expect(() => statSync('convex/customerRequestRouteExecutionProblem.ts')).toThrow()
    expect(problemPortsSource).toContain('export function problemSupportReadPorts')
    expect(problemPortsSource).toContain('loadSupportExportMaterial')
    expect(problemPortsSource.split('\n').length).toBeLessThanOrEqual(1000)
    expect(problemPortsSource).not.toMatch(/\bWritePlan\b/)
    expect(problemPortsSource).not.toMatch(/\bintendedPatches\b/)

    const ports = readFileSync(join(machinesRoot, 'problem-ports.ts'), 'utf8')
    expect(ports).toContain('export type ProblemSupportReadPorts')
    expect(ports).toContain('loadSupportExportMaterial')
    const index = readFileSync(join(machinesRoot, 'index.ts'), 'utf8')
    expect(index).toContain('ProblemSupportReadPorts')
  })

  it('keeps problem-support free of read-ports / machines imports', () => {
    for (const file of listTsFiles(problemSupportRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/route-execution\/machines/)
      expect(source).not.toMatch(/ProblemMutationPorts/)
      expect(source).not.toMatch(/ProblemSupportReadPorts/)
      expect(source).not.toMatch(/from\s+['"]\.\.\/machines/)
      expect(source).not.toMatch(/\bWritePlan\b/)
      expect(source).not.toMatch(/\bintendedPatches\b/)
    }
  })

  it('does not absorb support export into journal/cancel/dispatch ports', () => {
    for (const file of [
      'convex/customerRequestRouteExecutionJournalPorts.ts',
      'convex/customerRequestRouteExecutionCancelPorts.ts',
      'convex/customerRequestRouteExecutionDispatchPorts.ts',
    ]) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toContain('loadSupportExportMaterial')
      expect(source).not.toContain('projectSupportProblemExport')
      expect(source).not.toContain('ProblemSupportReadPorts')
    }
  })
})


