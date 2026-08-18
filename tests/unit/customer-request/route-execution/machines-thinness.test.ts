import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../../helpers/source-files'

const machinesRoot = 'src/modules/customer-request/route-execution/machines'
const journalRoot = 'src/modules/customer-request/route-execution/journal'
const journalPortsSource = readFileSync('convex/customerRequestRouteExecutionJournalPorts.ts', 'utf8')
const cancelPortsSource = readFileSync('convex/customerRequestRouteExecutionCancelPorts.ts', 'utf8')
const dispatchPortsSource = readFileSync(
  'convex/customerRequestRouteExecutionDispatchPorts.ts',
  'utf8',
)
const problemPortsSource = readFileSync(
  'convex/customerRequestRouteExecutionProblemPorts.ts',
  'utf8',
)
const hostSource = readFileSync('convex/customerRequestRouteExecution.ts', 'utf8')

const machineFiles = [
  'start-or-resume.ts',
  'record-outcome.ts',
  'cancel-current.ts',
  'cancel-open-attempt.ts',
  'cancel-resolve-attempt.ts',
  'cancel-ports.ts',
  'dispatch-lifecycle-ports.ts',
  'mark-dispatched.ts',
  'record-not-released.ts',
  'reconcile-transport-work.ts',
  'problem-report.ts',
  'problem-business-report.ts',
  'problem-update-status.ts',
  'problem-reply.ts',
  'problem-ports.ts',
  'ports.ts',
  'types.ts',
  'index.ts',
] as const

describe('customer-request route-execution machines thinness', () => {
  it('hosts start/outcome/cancel/dispatch machines under machines/', () => {
    for (const file of machineFiles) {
      expect(statSync(join(machinesRoot, file)).isFile()).toBe(true)
    }
    const index = readFileSync(join(machinesRoot, 'index.ts'), 'utf8')
    expect(index).toContain('startOrResume')
    expect(index).toContain('recordOutcome')
    expect(index).toContain('cancelCurrent')
    expect(index).toContain('openCancellationAttempt')
    expect(index).toContain('resolveCancellationAttempt')
    expect(index).toContain('markDispatched')
    expect(index).toContain('recordNotReleased')
    expect(index).toContain('reconcileRouteTransportWorkCompletion')
    expect(index).toContain('JournalMutationPorts')
    expect(index).toContain('CancelMutationPorts')
    expect(index).toContain('DispatchLifecyclePorts')
    expect(index).toContain('ProblemMutationPorts')
    expect(index).toContain('reportProblem')
    expect(index).toContain('recordProblemBusinessReport')
    expect(index).toContain('updateProblemStatus')
    expect(index).toContain('replyProblem')
  })

  it('keeps machines free of Convex runtime; effects only via ports', () => {
    for (const file of listTsFiles(machinesRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/from\s+['"]\.\/_generated/)
      expect(source).not.toMatch(/from\s+['"][^'"]*_generated[^'"]*['"]/)
      expect(source).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
      expect(source).not.toMatch(/\bActionCtx\b/)
      expect(source).not.toMatch(/\bMutationCtx\b/)
      expect(source).not.toMatch(/\bQueryCtx\b/)
      expect(source).not.toMatch(/\bDoc\s*</)
      expect(source).not.toMatch(/\bctx\.db\b/)
      expect(source).not.toMatch(/\bctx\.scheduler\b/)
    }
    const start = readFileSync(join(machinesRoot, 'start-or-resume.ts'), 'utf8')
    const outcome = readFileSync(join(machinesRoot, 'record-outcome.ts'), 'utf8')
    for (const source of [start, outcome]) {
      expect(source).toContain('JournalMutationPorts')
      expect(source).toContain('ports.')
    }
    const cancelCurrent = readFileSync(join(machinesRoot, 'cancel-current.ts'), 'utf8')
    const cancelOpen = readFileSync(join(machinesRoot, 'cancel-open-attempt.ts'), 'utf8')
    const cancelResolve = readFileSync(join(machinesRoot, 'cancel-resolve-attempt.ts'), 'utf8')
    expect(cancelCurrent).toContain('CancelMutationPorts')
    expect(cancelOpen).toContain('CancelOpenPorts')
    expect(cancelResolve).toContain('CancelMutationPorts')
    for (const source of [cancelCurrent, cancelOpen, cancelResolve]) {
      expect(source).toContain('ports.')
    }
    const markDispatched = readFileSync(join(machinesRoot, 'mark-dispatched.ts'), 'utf8')
    const notReleased = readFileSync(join(machinesRoot, 'record-not-released.ts'), 'utf8')
    expect(markDispatched).toContain('DispatchLifecyclePorts')
    expect(notReleased).toContain('DispatchLifecyclePorts')
    for (const source of [markDispatched, notReleased]) {
      expect(source).toContain('ports.')
    }
    const problemReport = readFileSync(join(machinesRoot, 'problem-report.ts'), 'utf8')
    const problemBusiness = readFileSync(join(machinesRoot, 'problem-business-report.ts'), 'utf8')
    const problemUpdate = readFileSync(join(machinesRoot, 'problem-update-status.ts'), 'utf8')
    const problemReply = readFileSync(join(machinesRoot, 'problem-reply.ts'), 'utf8')
    expect(problemReport).toContain('ProblemMutationPorts')
    expect(problemBusiness).toContain('ProblemMutationPorts')
    expect(problemUpdate).toContain('ProblemMutationPorts')
    expect(problemReply).toContain('ProblemMutationPorts')
    for (const source of [problemReport, problemBusiness, problemUpdate, problemReply]) {
      expect(source).toContain('ports.')
    }
  })

  it('forbids WritePlan DTOs in machines and journal', () => {
    for (const file of [...listTsFiles(machinesRoot), ...listTsFiles(journalRoot)]) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/\bWritePlan\b/)
      expect(source).not.toMatch(/\bwritePlan\b/)
      expect(source).not.toMatch(/\bintendedPatches\b/)
    }
  })

  it('keeps journal free of machines / ports imports', () => {
    for (const file of listTsFiles(journalRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/route-execution\/machines/)
      expect(source).not.toMatch(/JournalMutationPorts/)
      expect(source).not.toMatch(/CancelMutationPorts/)
      expect(source).not.toMatch(/DispatchLifecyclePorts/)
      expect(source).not.toMatch(/ProblemMutationPorts/)
      expect(source).not.toMatch(/from\s+['"]\.\.\/machines/)
    }
  })

  it('wires host through journal, cancel, dispatch, and problem ports without sibling hosts', () => {
    expect(hostSource).toContain("throw new Error('customer_request_tables_unlisted')")
    expect(hostSource).toContain("throw new Error('customer_request_tables_unlisted')")
    expect(hostSource).toContain("throw new Error('customer_request_tables_unlisted')")
    expect(hostSource).toContain("throw new Error('customer_request_tables_unlisted')")
    expect(hostSource).toContain("throw new Error('customer_request_tables_unlisted')")
    expect(hostSource).toContain("throw new Error('customer_request_tables_unlisted')")
    expect(hostSource).toContain("throw new Error('customer_request_tables_unlisted')")
    expect(journalPortsSource).toContain('export function journalMutationPorts')
    expect(cancelPortsSource).toContain('export function cancelMutationPorts')
    expect(cancelPortsSource).toContain('export function cancelOpenPorts')
    expect(dispatchPortsSource).toContain('export function dispatchLifecyclePorts')
    expect(dispatchPortsSource).toContain('export function dispatchLifecycleOpenPorts')
    expect(problemPortsSource).toContain('export function problemMutationPorts')
    expect(problemPortsSource).toContain('export function problemSupportReadPorts')
    expect(journalPortsSource.split('\n').length).toBeLessThanOrEqual(1000)
    expect(cancelPortsSource.split('\n').length).toBeLessThanOrEqual(1000)
    expect(dispatchPortsSource.split('\n').length).toBeLessThanOrEqual(1000)
    expect(problemPortsSource.split('\n').length).toBeLessThanOrEqual(1000)
    for (const forbidden of [
      'convex/customerRequestRouteExecutionStart.ts',
      'convex/customerRequestRouteExecutionLease.ts',
      'convex/customerRequestRouteExecutionOutcome.ts',
      'convex/customerRequestRouteExecutionCancel.ts',
      'convex/customerRequestRouteExecutionProblem.ts',
      'convex/customerRequestRouteExecutionDispatch.ts',
      'convex/customerRequestRouteExecutionRecover.ts',
      'convex/customerRequestRouteExecutionMark.ts',
    ]) {
      expect(() => statSync(forbidden)).toThrow()
    }
  })

  it('keeps each machines file under 1000 lines', () => {
    for (const file of listTsFiles(machinesRoot)) {
      const lines = readFileSync(file, 'utf8').split('\n').length
      expect(lines, file).toBeLessThanOrEqual(1000)
    }
  })
})


