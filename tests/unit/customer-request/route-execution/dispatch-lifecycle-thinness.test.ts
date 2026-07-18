import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const machinesRoot = 'src/modules/customer-request/route-execution/machines'
const hostSource = readFileSync('convex/customerRequestRouteExecution.ts', 'utf8')
const dispatchPortsSource = readFileSync(
  'convex/customerRequestRouteExecutionDispatchPorts.ts',
  'utf8',
)
const journalPortsSource = readFileSync(
  'convex/customerRequestRouteExecutionJournalPorts.ts',
  'utf8',
)
const cancelPortsSource = readFileSync(
  'convex/customerRequestRouteExecutionCancelPorts.ts',
  'utf8',
)
const problemPortsSource = readFileSync(
  'convex/customerRequestRouteExecutionProblemPorts.ts',
  'utf8',
)

const hostDispatchMachines = [
  'openLeasedDispatch',
  'recoverExpiredDispatch',
  'markDispatched',
  'recordNotReleased',
  'markAccepted',
] as const

const dispatchMachineFiles = [
  'dispatch-lifecycle-ports.ts',
  'current-leased-invocation.ts',
  'open-leased-dispatch.ts',
  'recover-expired-dispatch.ts',
  'mark-dispatched.ts',
  'record-not-released.ts',
  'mark-accepted.ts',
] as const

const recoverJournalHelpers = [
  'recoverDispatchAttemptAligned',
  'recoverDispatchLeaseStillCurrent',
  'recoverExpiredDispatchKind',
] as const

describe('customer-request route-execution dispatch lifecycle thinness', () => {
  it('hosts dispatch lifecycle machines under machines/', () => {
    for (const file of dispatchMachineFiles) {
      expect(statSync(join(machinesRoot, file)).isFile()).toBe(true)
    }
    const index = readFileSync(join(machinesRoot, 'index.ts'), 'utf8')
    expect(index).toContain('openLeasedDispatch')
    expect(index).toContain('recoverExpiredDispatch')
    expect(index).toContain('markDispatched')
    expect(index).toContain('recordNotReleased')
    expect(index).toContain('markAccepted')
    expect(index).toContain('currentLeasedInvocation')
    expect(index).toContain('DispatchLifecyclePorts')
    expect(index).toContain('DispatchLifecycleOpenPorts')
  })

  it('keeps host dispatch exports as thin ports-wired shells', () => {
    for (const symbol of hostDispatchMachines) {
      expect(hostSource).toMatch(new RegExp(`export const ${symbol}\\s*=`))
    }
    expect(hostSource).toContain('dispatchLifecyclePorts(ctx)')
    expect(hostSource).toContain('dispatchLifecycleOpenPorts(ctx)')
    expect(hostSource).toContain('openLeasedDispatchMachine')
    expect(hostSource).toContain('recoverExpiredDispatchMachine')
    expect(hostSource).toContain('markDispatchedMachine')
    expect(hostSource).toContain('recordNotReleasedMachine')
    expect(hostSource).toContain('markAcceptedMachine')
    expect(hostSource).toContain("from './customerRequestRouteExecutionDispatchPorts'")
    expect(hostSource).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+currentLeasedInvocation\b/)

    const openStart = hostSource.indexOf('export const openLeasedDispatch = internalQuery({')
    const recoverStart = hostSource.indexOf(
      'export const recoverExpiredDispatch = internalMutation({',
    )
    const markDispatchedStart = hostSource.indexOf(
      'export const markDispatched = internalMutation({',
    )
    const notReleasedStart = hostSource.indexOf(
      'export const recordNotReleased = internalMutation({',
    )
    const markAcceptedStart = hostSource.indexOf(
      'export const markAccepted = internalMutation({',
    )
    for (const start of [
      openStart, recoverStart, markDispatchedStart, notReleasedStart, markAcceptedStart,
    ]) {
      expect(start).toBeGreaterThanOrEqual(0)
      const end = hostSource.indexOf('\n})', start)
      expect(end).toBeGreaterThan(start)
      const body = hostSource.slice(start, end)
      expect(body.split('\n').length).toBeLessThanOrEqual(40)
      expect(body).not.toContain("query('customerRequestRouteRuns')")
      expect(body).not.toContain("query('customerRequestRouteDispatchOutbox')")
      expect(body).not.toContain("query('customerRequestRouteStepAttempts')")
      expect(body).not.toContain('ctx.db.insert(')
      expect(body).not.toContain('ctx.db.patch(')
      expect(body).not.toContain('ctx.scheduler')
    }
    expect(hostSource.slice(openStart, hostSource.indexOf('\n})', openStart)))
      .toContain('dispatchLifecycleOpenPorts(ctx)')
    expect(hostSource.slice(recoverStart, hostSource.indexOf('\n})', recoverStart)))
      .toContain('dispatchLifecyclePorts(ctx)')
    expect(hostSource.slice(markDispatchedStart, hostSource.indexOf('\n})', markDispatchedStart)))
      .toContain('dispatchLifecyclePorts(ctx)')
    expect(hostSource.slice(notReleasedStart, hostSource.indexOf('\n})', notReleasedStart)))
      .toContain('dispatchLifecyclePorts(ctx)')
    expect(hostSource.slice(markAcceptedStart, hostSource.indexOf('\n})', markAcceptedStart)))
      .toContain('dispatchLifecyclePorts(ctx)')
  })

  it('keeps recover journal helpers in dispatch machines, not the host', () => {
    for (const symbol of recoverJournalHelpers) {
      expect(hostSource).not.toContain(symbol)
    }
    const recoverMachine = readFileSync(join(machinesRoot, 'recover-expired-dispatch.ts'), 'utf8')
    expect(recoverMachine).toContain('recoverDispatchLeaseStillCurrent')
    expect(recoverMachine).toContain('recoverDispatchAttemptAligned')
    expect(recoverMachine).toContain('recoverExpiredDispatchKind')
    expect(dispatchPortsSource).toContain('markUnknownOutcome')
    expect(dispatchPortsSource).toContain('readRunProjection')
    expect(dispatchPortsSource).toContain('customerRequestRouteTransportWorker.runNext')
  })

  it('does not invent Convex Dispatch/Recover/Mark sibling hosts', () => {
    expect(statSync('convex/customerRequestRouteExecutionDispatchPorts.ts').isFile()).toBe(true)
    for (const forbidden of [
      'convex/customerRequestRouteExecutionDispatch.ts',
      'convex/customerRequestRouteExecutionRecover.ts',
      'convex/customerRequestRouteExecutionMark.ts',
    ]) {
      expect(() => statSync(forbidden)).toThrow()
    }
  })

  it('keeps dispatch lifecycle in its own adapter, not Journal/Cancel/Problem ports', () => {
    expect(dispatchPortsSource).toContain('export function dispatchLifecyclePorts')
    expect(dispatchPortsSource).toContain('export function dispatchLifecycleOpenPorts')
    expect(dispatchPortsSource.split('\n').length).toBeLessThanOrEqual(1000)
    expect(dispatchPortsSource).not.toMatch(/\bWritePlan\b/)
    expect(dispatchPortsSource).not.toMatch(/\bintendedPatches\b/)
    for (const source of [journalPortsSource, cancelPortsSource, problemPortsSource]) {
      expect(source).not.toContain('commitDispatchRequeued')
      expect(source).not.toContain('commitMarkDispatched')
      expect(source).not.toContain('commitNotReleasedFailed')
      expect(source).not.toContain('commitMarkAccepted')
      expect(source).not.toContain('commitDispatchOutcomeUnknown')
    }
  })

  it('keeps dispatch machines free of Convex runtime and write-plan DTOs', () => {
    for (const file of dispatchMachineFiles) {
      const source = readFileSync(join(machinesRoot, file), 'utf8')
      expect(source).not.toMatch(/from\s+['"]\.\/_generated/)
      expect(source).not.toMatch(/from\s+['"][^'"]*_generated[^'"]*['"]/)
      expect(source).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
      expect(source).not.toMatch(/\bActionCtx\b/)
      expect(source).not.toMatch(/\bMutationCtx\b/)
      expect(source).not.toMatch(/\bQueryCtx\b/)
      expect(source).not.toMatch(/\bDoc\s*</)
      expect(source).not.toMatch(/\bctx\.db\b/)
      expect(source).not.toMatch(/\bctx\.scheduler\b/)
      expect(source).not.toMatch(/\bWritePlan\b/)
      expect(source).not.toMatch(/\bwritePlan\b/)
      expect(source).not.toMatch(/\bintendedPatches\b/)
    }
    const open = readFileSync(join(machinesRoot, 'open-leased-dispatch.ts'), 'utf8')
    const recover = readFileSync(join(machinesRoot, 'recover-expired-dispatch.ts'), 'utf8')
    const markDispatched = readFileSync(join(machinesRoot, 'mark-dispatched.ts'), 'utf8')
    const notReleased = readFileSync(join(machinesRoot, 'record-not-released.ts'), 'utf8')
    const markAccepted = readFileSync(join(machinesRoot, 'mark-accepted.ts'), 'utf8')
    const leased = readFileSync(join(machinesRoot, 'current-leased-invocation.ts'), 'utf8')
    expect(open).toContain('DispatchLifecycleOpenPorts')
    expect(recover).toContain('DispatchLifecyclePorts')
    expect(markDispatched).toContain('DispatchLifecyclePorts')
    expect(notReleased).toContain('DispatchLifecyclePorts')
    expect(markAccepted).toContain('DispatchLifecyclePorts')
    expect(leased).toContain('DispatchLifecycleOpenPorts')
    for (const source of [open, recover, markDispatched, notReleased, markAccepted, leased]) {
      expect(source).toContain('ports.')
    }
  })
})
