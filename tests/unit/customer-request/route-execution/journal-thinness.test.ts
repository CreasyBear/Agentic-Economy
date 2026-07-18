import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const convexHost = readFileSync('convex/customerRequestRouteExecution.ts', 'utf8')
const journalPortsSource = readFileSync('convex/customerRequestRouteExecutionJournalPorts.ts', 'utf8')
const cancelPortsSource = readFileSync('convex/customerRequestRouteExecutionCancelPorts.ts', 'utf8')
const moduleRoot = 'src/modules/customer-request/route-execution/journal'
const machinesRoot = 'src/modules/customer-request/route-execution/machines'

const hostStillUsesJournal = [
  'recoverDispatchAttemptAligned',
  'recoverDispatchLeaseStillCurrent',
  'recoverExpiredDispatchKind',
  'routeAttemptIntegrityValid',
  'routeDispatchIntegrityValid',
] as const

const cancelJournalHelpers = [
  'canPreReleaseCancel',
  'canRequestAdapterCancellation',
  'cancelCommandArgsConflict',
  'cancelDisposition',
  'cancelPriorCommandConflicts',
  'cancelReplayKind',
  'cancelRunHeadIntegrityValid',
  'cancelRunNotFound',
] as const

const hostMachines = [
  'startOrResume',
  'leaseNextDispatch',
  'recordOutcome',
] as const

const hostCancelMachines = [
  'cancelCurrent',
  'openCancellationAttempt',
  'resolveCancellationAttempt',
] as const

describe('customer-request route-execution journal thinness', () => {
  it('keeps host start/lease/outcome exports as thin ports-wired shells', () => {
    for (const symbol of hostMachines) {
      expect(convexHost).toMatch(new RegExp(`export const ${symbol}\\s*=`))
    }
    expect(convexHost).toContain('journalMutationPorts(ctx)')
    expect(convexHost).toContain('startOrResumeMachine')
    expect(convexHost).toContain('leaseNextDispatchMachine')
    expect(convexHost).toContain('recordOutcomeMachine')
    expect(convexHost).toContain("from './customerRequestRouteExecutionJournalPorts'")
    expect(convexHost).toContain("from '@/modules/customer-request/route-execution/machines'")

    for (const symbol of hostMachines) {
      const start = convexHost.indexOf(`export const ${symbol} = internalMutation({`)
      expect(start).toBeGreaterThanOrEqual(0)
      const end = convexHost.indexOf('\n})', start)
      expect(end).toBeGreaterThan(start)
      const body = convexHost.slice(start, end)
      expect(body).toContain('journalMutationPorts(ctx)')
      expect(body.split('\n').length).toBeLessThanOrEqual(40)
      expect(body).not.toContain("query('customerRequestRouteRuns')")
      expect(body).not.toContain("query('customerRequestRouteDispatchOutbox')")
      expect(body).not.toContain('ctx.db.insert(')
      expect(body).not.toContain('ctx.db.patch(')
    }
  })

  it('keeps host cancel exports as thin ports-wired shells', () => {
    for (const symbol of hostCancelMachines) {
      expect(convexHost).toMatch(new RegExp(`export const ${symbol}\\s*=`))
    }
    expect(convexHost).toContain('cancelMutationPorts(ctx)')
    expect(convexHost).toContain('cancelOpenPorts(ctx)')
    expect(convexHost).toContain('cancelCurrentMachine')
    expect(convexHost).toContain('openCancellationAttemptMachine')
    expect(convexHost).toContain('resolveCancellationAttemptMachine')
    expect(convexHost).toContain("from './customerRequestRouteExecutionCancelPorts'")
    expect(convexHost).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+resolveCancellationCommand\b/)

    const cancelCurrentStart = convexHost.indexOf('export const cancelCurrent = internalMutation({')
    const openStart = convexHost.indexOf('export const openCancellationAttempt = internalQuery({')
    const resolveStart = convexHost.indexOf(
      'export const resolveCancellationAttempt = internalMutation({',
    )
    for (const start of [cancelCurrentStart, openStart, resolveStart]) {
      expect(start).toBeGreaterThanOrEqual(0)
      const end = convexHost.indexOf('\n})', start)
      expect(end).toBeGreaterThan(start)
      const body = convexHost.slice(start, end)
      expect(body.split('\n').length).toBeLessThanOrEqual(40)
      expect(body).not.toContain("query('customerRequestRouteRuns')")
      expect(body).not.toContain("query('customerRequestRouteCancellationAttempts')")
      expect(body).not.toContain('ctx.db.insert(')
      expect(body).not.toContain('ctx.db.patch(')
      expect(body).not.toContain('ctx.scheduler')
    }
    expect(convexHost.slice(cancelCurrentStart, convexHost.indexOf('\n})', cancelCurrentStart)))
      .toContain('cancelMutationPorts(ctx)')
    expect(convexHost.slice(openStart, convexHost.indexOf('\n})', openStart)))
      .toContain('cancelOpenPorts(ctx)')
    expect(convexHost.slice(resolveStart, convexHost.indexOf('\n})', resolveStart)))
      .toContain('cancelMutationPorts(ctx)')
  })

  it('does not invent Convex Start/Lease/Outcome/Cancel sibling hosts', () => {
    expect(statSync('convex/customerRequestRouteExecutionJournalPorts.ts').isFile()).toBe(true)
    expect(statSync('convex/customerRequestRouteExecutionCancelPorts.ts').isFile()).toBe(true)
    for (const forbidden of [
      'convex/customerRequestRouteExecutionStart.ts',
      'convex/customerRequestRouteExecutionLease.ts',
      'convex/customerRequestRouteExecutionOutcome.ts',
      'convex/customerRequestRouteExecutionCancel.ts',
      'convex/customerRequestRouteExecutionProblem.ts',
    ]) {
      expect(() => statSync(forbidden)).toThrow()
    }
  })

  it('keeps recover journal helpers referenced from the host; cancel helpers in machines', () => {
    expect(convexHost).toContain("from '@/modules/customer-request/route-execution/journal'")
    for (const symbol of hostStillUsesJournal) {
      expect(convexHost).toContain(symbol)
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
    }
    for (const symbol of cancelJournalHelpers) {
      expect(convexHost).not.toContain(symbol)
    }
    const cancelCurrentMachine = readFileSync(join(machinesRoot, 'cancel-current.ts'), 'utf8')
    const cancelPortsAdapter = cancelPortsSource
    expect(cancelCurrentMachine).toContain('cancelCommandArgsConflict')
    expect(cancelCurrentMachine).toContain('cancelDisposition')
    expect(cancelPortsAdapter).toContain('cancelReplayKind')
    expect(cancelPortsAdapter).toContain('patchPendingCancelCommandResult')
  })

  it('keeps journal free of Convex runtime and write-plan DTOs', () => {
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
      expect(source).not.toMatch(/\bpatches:\s*\[/)
      expect(source).not.toMatch(/JournalMutationPorts/)
      expect(source).not.toMatch(/CancelMutationPorts/)
      expect(source).not.toMatch(/startOrResume/)
    }
  })

  it('keeps host parseBoundedJson and exportedStepState', () => {
    expect(convexHost).toMatch(/(?:^|\n)function\s+parseBoundedJson\b/)
    expect(convexHost).toContain('const exportedStepState = v.union(')
  })

  it('keeps exportCustomerEvidence as a thin DB-load adapter', () => {
    expect(convexHost).toMatch(/export const exportCustomerEvidence\s*=/)
    expect(convexHost).toContain('assembleCustomerEvidenceExport')
    expect(convexHost).toContain('evidenceLoadPorts')
    expect(convexHost).not.toContain('projectCustomerEvidenceExport({')
    expect(convexHost).not.toContain('providerOrigin: new URL(')
    expect(convexHost).not.toContain('Result evidence')
  })

  it('keeps journal and cancel mutation ports factories under 1000 lines', () => {
    expect(journalPortsSource.split('\n').length).toBeLessThanOrEqual(1000)
    expect(cancelPortsSource.split('\n').length).toBeLessThanOrEqual(1000)
    expect(journalPortsSource).toContain('export function journalMutationPorts')
    expect(cancelPortsSource).toContain('export function cancelMutationPorts')
    expect(journalPortsSource).not.toMatch(/\bWritePlan\b/)
    expect(journalPortsSource).not.toMatch(/\bintendedPatches\b/)
    expect(cancelPortsSource).not.toMatch(/\bWritePlan\b/)
    expect(cancelPortsSource).not.toMatch(/\bintendedPatches\b/)
  })

  it('keeps machines free of Convex runtime and write-plan DTOs', () => {
    for (const file of listTsFiles(machinesRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from\s+['"]\.\/_generated/)
      expect(source).not.toMatch(/from\s+['"][^'"]*_generated[^'"]*['"]/)
      expect(source).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
      expect(source).not.toMatch(/\bActionCtx\b/)
      expect(source).not.toMatch(/\bMutationCtx\b/)
      expect(source).not.toMatch(/\bQueryCtx\b/)
      expect(source).not.toMatch(/\bDoc\s*</)
      expect(source).not.toMatch(/\bWritePlan\b/)
      expect(source).not.toMatch(/\bwritePlan\b/)
      expect(source).not.toMatch(/\bintendedPatches\b/)
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
