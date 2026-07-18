import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const hostSource = readFileSync('convex/customerRequestV2.ts', 'utf8')
const readPortsSource = readFileSync('convex/customerRequestV2ReadPorts.ts', 'utf8')
const writePortsSource = readFileSync('convex/customerRequestV2WritePorts.ts', 'utf8')
const preparationPortsSource = readFileSync('convex/customerRequestV2PreparationPorts.ts', 'utf8')
const moduleRoot = 'src/modules/customer-request/v2-read'

const hostReadMachines = [
  'getCurrentAggregate',
  'getRoutePlanGeneration',
  'getRoutePlanGenerationRefreshReplay',
] as const

const moduleFiles = [
  'ports.ts',
  'types.ts',
  'get-current-aggregate.ts',
  'get-route-plan-generation.ts',
  'get-route-plan-generation-refresh-replay.ts',
  'index.ts',
] as const

function collectModuleSources(root: string): string[] {
  const sources: string[] = []
  for (const entry of readdirSync(root)) {
    const path = join(root, entry)
    if (statSync(path).isDirectory()) {
      sources.push(...collectModuleSources(path))
      continue
    }
    if (path.endsWith('.ts')) sources.push(readFileSync(path, 'utf8'))
  }
  return sources
}

describe('customer-request v2-read thinness', () => {
  it('hosts read machines under v2-read/', () => {
    for (const file of moduleFiles) {
      expect(statSync(join(moduleRoot, file)).isFile()).toBe(true)
    }
    const index = readFileSync(join(moduleRoot, 'index.ts'), 'utf8')
    expect(index).toContain('getCurrentAggregate')
    expect(index).toContain('getRoutePlanGeneration')
    expect(index).toContain('getRoutePlanGenerationRefreshReplay')
    expect(index).toContain('CustomerRequestV2ReadPorts')
  })

  it('keeps host read exports as thin ports-wired shells', () => {
    for (const symbol of hostReadMachines) {
      expect(hostSource).toMatch(new RegExp(`export const ${symbol}\\s*=`))
    }
    expect(hostSource).toContain('customerRequestV2ReadPorts(ctx)')
    expect(hostSource).toContain('getCurrentAggregateMachine')
    expect(hostSource).toContain('getRoutePlanGenerationMachine')
    expect(hostSource).toContain('getRoutePlanGenerationRefreshReplayMachine')
    expect(hostSource).toContain("from './customerRequestV2ReadPorts'")
    expect(hostSource).toContain("from '@/modules/customer-request/v2-read'")

    for (const symbol of hostReadMachines) {
      const start = hostSource.indexOf(`export const ${symbol} = internalQuery({`)
      expect(start).toBeGreaterThanOrEqual(0)
      const end = hostSource.indexOf('\n})', start)
      expect(end).toBeGreaterThan(start)
      const body = hostSource.slice(start, end)
      expect(body).toContain('customerRequestV2ReadPorts(ctx)')
      expect(body.split('\n').length).toBeLessThanOrEqual(40)
      expect(body).not.toContain("query('customerRequestV2Heads')")
      expect(body).not.toContain("query('customerRequestV2Revisions')")
      expect(body).not.toContain("query('customerRequestV2RoutePlanHeads')")
      expect(body).not.toContain("query('customerRequestV2RoutePlanGenerationCommands')")
      expect(body).not.toContain("query('customerRequestV2RoutePlanGenerations')")
      expect(body).not.toContain('readExactRoutePlanGeneration(')
      expect(body).not.toContain('readGenerationRefreshCommandResult(')
      expect(body).not.toContain('readCurrentDecisionAggregate(')
    }
  })

  it('does not invent a Read sibling host or WritePlan DTOs', () => {
    expect(statSync('convex/customerRequestV2ReadPorts.ts').isFile()).toBe(true)
    for (const forbidden of [
      'convex/customerRequestV2GetCurrent.ts',
      'convex/customerRequestV2Read.ts',
      'convex/customerRequestV2AggregateRead.ts',
    ]) {
      expect(() => statSync(forbidden)).toThrow()
    }
    expect(readPortsSource.split('\n').length).toBeLessThanOrEqual(1000)
    expect(readPortsSource).toContain('export function customerRequestV2ReadPorts')
    expect(readPortsSource).toContain('export async function readExactRoutePlanGeneration')
    expect(readPortsSource).toContain('export async function readGenerationRefreshCommandResult')
    expect(readPortsSource).toContain('export async function readCurrentDecisionAggregate')
    expect(readPortsSource).toContain('export async function readVerifiedCommandReplay')
    expect(readPortsSource).not.toMatch(/\bWritePlan\b/)
    expect(readPortsSource).not.toMatch(/\bintendedPatches\b/)
    for (const source of collectModuleSources(moduleRoot)) {
      expect(source).not.toMatch(/\bWritePlan\b/)
      expect(source).not.toMatch(/\bintendedPatches\b/)
      expect(source).not.toContain("from 'convex/")
      expect(source).not.toContain('from "./_generated')
      expect(source).not.toContain("from './_generated")
    }
  })

  it('does not reopen ADR-014 write ports or absorb reads into WritePorts', () => {
    expect(writePortsSource).not.toContain('getCurrentAggregate')
    expect(writePortsSource).not.toContain('getRoutePlanGenerationRefreshReplay')
    expect(writePortsSource).not.toContain('customerRequestV2ReadPorts(')
    expect(writePortsSource).not.toContain('CustomerRequestV2ReadPorts')
    expect(writePortsSource).not.toContain('export async function readExactRoutePlanGeneration')
    expect(writePortsSource).not.toContain('export async function readGenerationRefreshCommandResult')
    expect(writePortsSource).not.toContain('export async function readCurrentDecisionAggregate')
    expect(writePortsSource).not.toContain('export async function readVerifiedCommandReplay')
    expect(writePortsSource).toContain("from './customerRequestV2ReadPorts'")
    expect(readPortsSource).not.toContain('customerRequestV2WritePorts')
    expect(readPortsSource).not.toContain('CustomerRequestV2WritePorts')
    expect(readPortsSource).not.toContain('commitAggregate')
    for (const source of collectModuleSources(moduleRoot)) {
      expect(source).not.toContain('CustomerRequestV2WritePorts')
      expect(source).not.toContain('commitAggregate')
      expect(source).not.toContain('refreshRoutePlanGeneration')
      expect(source).not.toContain('recordRoutePlanGenerationRetry')
    }
  })

  it('does not reopen ADR-016 preparation ports for reads', () => {
    expect(preparationPortsSource).not.toContain('CustomerRequestV2ReadPorts')
    expect(preparationPortsSource).not.toContain('customerRequestV2ReadPorts')
    expect(preparationPortsSource).not.toContain('getCurrentAggregate')
    expect(readPortsSource).not.toContain('CustomerRequestV2PreparationPorts')
    expect(readPortsSource).not.toContain('prepareActionPreparation')
    for (const source of collectModuleSources(moduleRoot)) {
      expect(source).not.toContain('v2-preparation')
      expect(source).not.toContain('CustomerRequestV2PreparationPorts')
    }
  })
})
