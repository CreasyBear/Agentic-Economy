import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../../helpers/source-files'

const convexHost = readFileSync('convex/customerRequestRouteExecution.ts', 'utf8')
const portsSource = readFileSync('convex/customerRequestEvidenceLoadPorts.ts', 'utf8')
const moduleRoot = 'src/modules/customer-request/route-execution/evidence-load'
const journalRoot = 'src/modules/customer-request/route-execution/journal'

const movedSymbols = [
  'assembleCustomerEvidenceExport',
  'assembleSupportProblemList',
  'loadProblemUpdates',
  'loadProblemBusinessReports',
  'assertProblemUpdatesIntegrity',
  'assertProblemBusinessReportsIntegrity',
] as const

const hostMachines = [
  'startOrResume',
  'recordOutcome',
] as const

describe('customer-request route-execution evidence-load thinness', () => {
  it('does not redefine moved evidence-load helpers in Convex host', () => {
    for (const symbol of movedSymbols) {
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
    }
    expect(convexHost).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+readProblemUpdates\b/)
    expect(convexHost).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+readProblemBusinessReports\b/)
  })

  it('keeps exportCustomerEvidence as a thin ports adapter', () => {
    expect(convexHost).toMatch(/export const exportCustomerEvidence\s*=/)
    expect(convexHost).toContain('assembleCustomerEvidenceExport')
    expect(convexHost).toContain('evidenceLoadPorts')
    expect(convexHost).toContain("from './customerRequestEvidenceLoadPorts'")
    expect(convexHost).not.toContain('projectCustomerEvidenceExport({')
    expect(convexHost).not.toContain('providerOrigin: new URL(')
    expect(convexHost).not.toContain('Result evidence')

    const exportStart = convexHost.indexOf('export const exportCustomerEvidence = internalQuery({')
    expect(exportStart).toBeGreaterThanOrEqual(0)
    const exportEnd = convexHost.indexOf('\n})', exportStart)
    expect(exportEnd).toBeGreaterThan(exportStart)
    const exportBody = convexHost.slice(exportStart, exportEnd)
    expect(exportBody).toContain("throw new Error('customer_request_tables_unlisted')")
    expect(exportBody).not.toContain("query('customerRequestRouteRunHeads')")
    expect(exportBody).not.toContain("query('capabilityTransportBindings')")
    expect(exportBody.split('\n').length).toBeLessThanOrEqual(120)
  })

  it('keeps listProblemsForSupport load glue behind assembleSupportProblemList', () => {
    expect(convexHost).toContain('assembleSupportProblemList')
    const listStart = convexHost.indexOf('export const listProblemsForSupport = internalQuery({')
    expect(listStart).toBeGreaterThanOrEqual(0)
    const listEnd = convexHost.indexOf('const supportProblemExport = v.object({', listStart)
    expect(listEnd).toBeGreaterThan(listStart)
    const listBody = convexHost.slice(listStart, listEnd)
    expect(listBody).toContain("throw new Error('customer_request_tables_unlisted')")
    expect(listBody).not.toContain('projectSupportProblemList')
    expect(listBody).not.toContain("query('customerRequestRouteProblemReports')")
  })

  it('keeps host start/outcome machines in Convex', () => {
    for (const symbol of hostMachines) {
      expect(convexHost).toMatch(new RegExp(`export const ${symbol}\\s*=`))
    }
  })

  it('keeps evidence-load free of Convex runtime and write-plan DTOs', () => {
    for (const file of listTsFiles(moduleRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from\s+['"]\.\/_generated/)
      expect(source).not.toMatch(/from\s+['"][^'"]*_generated[^'"]*['"]/)
      expect(source).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
      expect(source).not.toMatch(/\bActionCtx\b/)
      expect(source).not.toMatch(/\bMutationCtx\b/)
      expect(source).not.toMatch(/\bQueryCtx\b/)
      expect(source).not.toMatch(/\bDoc\s*</)
      expect(source).not.toMatch(/\bwritePlan\b/)
      expect(source).not.toMatch(/\bWritePlan\b/)
      expect(source).not.toMatch(/\bintendedPatches\b/)
    }
  })

  it('keeps journal free of WritePlan and does not absorb evidence-load ports', () => {
    for (const file of listTsFiles(journalRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/\bWritePlan\b/)
      expect(source).not.toMatch(/\bwritePlan\b/)
      expect(source).not.toMatch(/EvidenceLoadPorts/)
      expect(source).not.toMatch(/assembleCustomerEvidenceExport/)
      expect(source).not.toMatch(/loadProblemUpdates/)
    }
  })

  it('keeps evidenceLoadPorts factory thin', () => {
    expect(statSync('convex/customerRequestEvidenceLoadPorts.ts').isFile()).toBe(true)
    expect(portsSource.split('\n').length).toBeLessThanOrEqual(80)
    expect(portsSource).toContain('export function evidenceLoadPorts')
    expect(portsSource).toContain('listProblemUpdatesByReportRef:')
    expect(portsSource).toContain('getBindingByBindingId:')
    expect(portsSource).not.toMatch(/\bexport\s+(?:async\s+)?function\s+assembleCustomerEvidenceExport\b/)
    expect(portsSource).not.toMatch(/\bexport\s+(?:async\s+)?function\s+loadProblemUpdates\b/)
  })

  it('keeps each evidence-load file under 1000 lines', () => {
    for (const file of [
      ...listTsFiles(moduleRoot),
      'convex/customerRequestEvidenceLoadPorts.ts',
    ]) {
      const lines = readFileSync(file, 'utf8').split('\n').length
      expect(lines, file).toBeLessThanOrEqual(1000)
    }
  })
})


