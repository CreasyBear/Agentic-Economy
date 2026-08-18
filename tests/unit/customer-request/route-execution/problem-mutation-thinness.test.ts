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

const hostProblemMachines = [
  'reportProblem',
  'recordProblemBusinessReport',
  'updateProblemStatus',
  'replyProblem',
] as const

const problemMachineFiles = [
  'problem-report.ts',
  'problem-business-report.ts',
  'problem-update-status.ts',
  'problem-reply.ts',
  'problem-ports.ts',
] as const

describe('customer-request route-execution problem mutation thinness', () => {
  it('keeps host problem mutation exports as thin ports-wired shells', () => {
    for (const symbol of hostProblemMachines) {
      expect(convexHost).toMatch(new RegExp(`export const ${symbol}\\s*=`))
    }
    expect(convexHost).toContain("throw new Error('customer_request_tables_unlisted')")
    expect(convexHost).toContain('reportProblemMachine')
    expect(convexHost).toContain('recordProblemBusinessReportMachine')
    expect(convexHost).toContain('updateProblemStatusMachine')
    expect(convexHost).toContain('replyProblemMachine')
    expect(convexHost).toContain("from './customerRequestRouteExecutionProblemPorts'")

    for (const symbol of hostProblemMachines) {
      const start = convexHost.indexOf(`export const ${symbol} = internalMutation({`)
      expect(start).toBeGreaterThanOrEqual(0)
      const end = convexHost.indexOf('\n})', start)
      expect(end).toBeGreaterThan(start)
      const body = convexHost.slice(start, end)
      expect(body).toContain("throw new Error('customer_request_tables_unlisted')")
      expect(body.split('\n').length).toBeLessThanOrEqual(40)
      expect(body).not.toContain("query('customerRequestRouteProblemReports')")
      expect(body).not.toContain("query('customerRequestRouteProblemUpdates')")
      expect(body).not.toContain("query('customerRequestRouteProblemBusinessReports')")
      expect(body).not.toContain('ctx.db.insert(')
      expect(body).not.toContain('ctx.db.patch(')
      expect(body).not.toContain('decideCustomerProblemReport')
      expect(body).not.toContain('decideBusinessProblemClaim')
      expect(body).not.toContain('decideSupportProblemStatus')
      expect(body).not.toContain('decideCustomerProblemReply')
    }
  })

  it('does not invent a Convex Problem sibling host', () => {
    expect(statSync('convex/customerRequestRouteExecutionProblemPorts.ts').isFile()).toBe(true)
    expect(() => statSync('convex/customerRequestRouteExecutionProblem.ts')).toThrow()
  })

  it('hosts problem machines under machines/ with ProblemMutationPorts', () => {
    for (const file of problemMachineFiles) {
      expect(statSync(join(machinesRoot, file)).isFile()).toBe(true)
    }
    const index = readFileSync(join(machinesRoot, 'index.ts'), 'utf8')
    expect(index).toContain('reportProblem')
    expect(index).toContain('recordProblemBusinessReport')
    expect(index).toContain('updateProblemStatus')
    expect(index).toContain('replyProblem')
    expect(index).toContain('ProblemMutationPorts')
    expect(index).toContain('ProblemSupportReadPorts')
    const ports = readFileSync(join(machinesRoot, 'problem-ports.ts'), 'utf8')
    expect(ports).toContain('export type ProblemMutationPorts')
    expect(ports).toContain('export type ProblemSupportReadPorts')
    expect(ports).not.toMatch(/\bWritePlan\b/)
    expect(ports).not.toMatch(/\bintendedPatches\b/)
  })

  it('keeps problem machines free of Convex runtime and write-plan DTOs', () => {
    for (const file of problemMachineFiles) {
      const source = readFileSync(join(machinesRoot, file), 'utf8')
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
    for (const file of [
      'problem-report.ts',
      'problem-business-report.ts',
      'problem-update-status.ts',
      'problem-reply.ts',
    ] as const) {
      expect(readFileSync(join(machinesRoot, file), 'utf8')).toContain('ports.')
    }
  })

  it('keeps problem-support free of machines / ProblemMutationPorts imports', () => {
    for (const file of listTsFiles(problemSupportRoot)) {
      const source = readFileSync(file, 'utf8')
      expect(source).not.toMatch(/route-execution\/machines/)
      expect(source).not.toMatch(/ProblemMutationPorts/)
      expect(source).not.toMatch(/from\s+['"]\.\.\/machines/)
      expect(source).not.toMatch(/\bWritePlan\b/)
      expect(source).not.toMatch(/\bintendedPatches\b/)
    }
  })

  it('keeps problem mutation ports factory under 1000 lines', () => {
    expect(problemPortsSource.split('\n').length).toBeLessThanOrEqual(1000)
    expect(problemPortsSource).toContain('export function problemMutationPorts')
    expect(problemPortsSource).toContain('export function problemSupportReadPorts')
    expect(problemPortsSource).not.toMatch(/\bWritePlan\b/)
    expect(problemPortsSource).not.toMatch(/\bintendedPatches\b/)
  })
})


