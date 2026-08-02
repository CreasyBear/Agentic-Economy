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
  'markDispatched',
  'recordNotReleased',
] as const

const dispatchMachineFiles = [
  'dispatch-lifecycle-ports.ts',
  'mark-dispatched.ts',
  'record-not-released.ts',

] as const
describe('customer-request route-execution dispatch lifecycle thinness', () => {
  it('hosts dispatch lifecycle machines under machines/', () => {
    for (const file of dispatchMachineFiles) {
      expect(statSync(join(machinesRoot, file)).isFile()).toBe(true)
    }
    const index = readFileSync(join(machinesRoot, 'index.ts'), 'utf8')
    for (const symbol of ['markDispatched', 'recordNotReleased']) {
      expect(index).toContain(symbol)
    }
    expect(index).toContain('DispatchLifecyclePorts')
    expect(index).toContain('DispatchLifecycleOpenPorts')
  })

  it('keeps host dispatch exports as thin ports-wired shells', () => {
    for (const symbol of hostDispatchMachines) {
      expect(hostSource).toMatch(new RegExp(`export const ${symbol}\\s*=`))
    }
    expect(hostSource).toContain('dispatchLifecyclePorts(ctx)')
    expect(hostSource).toContain('dispatchLifecycleOpenPorts(ctx)')
    expect(hostSource).toContain('markDispatchedMachine')
    expect(hostSource).toContain('recordNotReleasedMachine')
    expect(hostSource).toContain("from './customerRequestRouteExecutionDispatchPorts'")

    for (const symbol of hostDispatchMachines) {
      const start = hostSource.indexOf(`export const ${symbol} =`)
      expect(start).toBeGreaterThanOrEqual(0)
      const end = hostSource.indexOf('\n})', start)
      expect(end).toBeGreaterThan(start)
      const body = hostSource.slice(start, end)
      expect(body.split('\n').length).toBeLessThanOrEqual(40)
      expect(body).not.toContain('ctx.db.insert(')
      expect(body).not.toContain('ctx.db.patch(')
      expect(body).not.toContain('ctx.scheduler')
    }
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
    const markDispatched = readFileSync(join(machinesRoot, 'mark-dispatched.ts'), 'utf8')
    const notReleased = readFileSync(join(machinesRoot, 'record-not-released.ts'), 'utf8')
    expect(markDispatched).toContain('DispatchLifecyclePorts')
    expect(notReleased).toContain('DispatchLifecyclePorts')
    for (const source of [markDispatched, notReleased]) {
      expect(source).toContain('ports.')
    }
    expect(dispatchPortsSource).toContain('openDispatchFromJournal')
  })
})
