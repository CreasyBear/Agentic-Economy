import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../helpers/source-files'

const hostSource = readFileSync('convex/customerRequestV2.ts', 'utf8')
const writePortsSource = readFileSync('convex/customerRequestV2WritePorts.ts', 'utf8')
const moduleRoot = 'src/modules/customer-request/v2-write'

const hostWriteMachines = [
  'commitAggregate',
  'refreshRoutePlanGeneration',
  'recordRoutePlanGenerationRetry',
] as const

const moduleFiles = [
  'ports.ts',
  'types.ts',
  'aggregate-consistency.ts',
  'commit-aggregate.ts',
  'refresh-route-plan-generation.ts',
  'record-route-plan-generation-retry.ts',
  'index.ts',
] as const

function collectModuleSources(root: string): string[] {
  return listTsFiles(root).map((path) => readFileSync(path, 'utf8'))
}

describe('customer-request v2-write thinness', () => {
  it('hosts write machines under v2-write/', () => {
    for (const file of moduleFiles) {
      expect(statSync(join(moduleRoot, file)).isFile()).toBe(true)
    }
    const index = readFileSync(join(moduleRoot, 'index.ts'), 'utf8')
    expect(index).toContain('commitAggregate')
    expect(index).toContain('refreshRoutePlanGeneration')
    expect(index).toContain('recordRoutePlanGenerationRetry')
    expect(index).toContain('CustomerRequestV2WritePorts')
    expect(index).toContain('aggregateIsInternallyConsistent')
  })

  it('keeps host write exports as thin ports-wired shells', () => {
    for (const symbol of hostWriteMachines) {
      expect(hostSource).toMatch(new RegExp(`export const ${symbol}\\s*=`))
    }
    expect(hostSource).toContain("throw new Error('customer_request_tables_unlisted')")
    expect(hostSource).toContain('commitAggregateMachine')
    expect(hostSource).toContain('refreshRoutePlanGenerationMachine')
    expect(hostSource).toContain('recordRoutePlanGenerationRetryMachine')
    expect(hostSource).toContain("from './customerRequestV2WritePorts'")
    expect(hostSource).toContain("from '@/modules/customer-request/v2-write'")

    for (const symbol of hostWriteMachines) {
      const start = hostSource.indexOf(`export const ${symbol} = internalMutation({`)
      expect(start).toBeGreaterThanOrEqual(0)
      const end = hostSource.indexOf('\n})', start)
      expect(end).toBeGreaterThan(start)
      const body = hostSource.slice(start, end)
      expect(body).toContain("throw new Error('customer_request_tables_unlisted')")
      expect(body.split('\n').length).toBeLessThanOrEqual(40)
      expect(body).not.toContain("query('customerRequestV2Commands')")
      expect(body).not.toContain("query('customerRequestV2RoutePlanGenerationCommands')")
      expect(body).not.toContain("query('customerRequestV2Heads')")
      expect(body).not.toContain('ctx.db.insert(')
      expect(body).not.toContain('ctx.db.patch(')
      expect(body).not.toContain('supersedeCurrentRouteMandate')
    }
  })

  it('does not invent a Commit sibling host or WritePlan DTOs', () => {
    expect(statSync('convex/customerRequestV2WritePorts.ts').isFile()).toBe(true)
    for (const forbidden of [
      'convex/customerRequestV2Commit.ts',
      'convex/customerRequestV2Refresh.ts',
      'convex/customerRequestV2Write.ts',
    ]) {
      expect(() => statSync(forbidden)).toThrow()
    }
    expect(writePortsSource.split('\n').length).toBeLessThanOrEqual(1000)
    expect(writePortsSource).toContain('export function customerRequestV2WritePorts')
    expect(writePortsSource).not.toMatch(/\bWritePlan\b/)
    expect(writePortsSource).not.toMatch(/\bintendedPatches\b/)
    for (const source of collectModuleSources(moduleRoot)) {
      expect(source).not.toMatch(/\bWritePlan\b/)
      expect(source).not.toMatch(/\bintendedPatches\b/)
      expect(source).not.toContain("from 'convex/")
      expect(source).not.toContain('from "./_generated')
      expect(source).not.toContain("from './_generated")
    }
  })

  it('keeps aggregate consistency single-sourced for mandate callers', () => {
    expect(hostSource).toContain('aggregateIsInternallyConsistent')
    expect(hostSource).toMatch(
      /export \{\s*aggregateIsInternallyConsistent/,
    )
    expect(hostSource).not.toMatch(
      /(?:^|\n)export function aggregateIsInternallyConsistent\b/,
    )
    const moduleConsistency = readFileSync(join(moduleRoot, 'aggregate-consistency.ts'), 'utf8')
    expect(moduleConsistency).toContain('export function aggregateIsInternallyConsistent')
  })

  it('does not grow route-execution Journal/Cancel/Problem/Dispatch ports', () => {
    for (const path of [
      'convex/customerRequestRouteExecutionJournalPorts.ts',
      'convex/customerRequestRouteExecutionCancelPorts.ts',
      'convex/customerRequestRouteExecutionDispatchPorts.ts',
      'convex/customerRequestRouteExecutionProblemPorts.ts',
    ]) {
      const source = readFileSync(path, 'utf8')
      expect(source).not.toContain('commitAggregate')
      expect(source).not.toContain('customerRequestV2WritePorts')
      expect(source).not.toContain('validateAggregateAgainstCurrentCapabilityGraph')
    }
  })
})
