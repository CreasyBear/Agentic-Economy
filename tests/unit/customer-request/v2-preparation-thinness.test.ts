import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../helpers/source-files'

const hostSource = readFileSync('convex/customerRequestV2Preparation.ts', 'utf8')
const preparationPortsSource = readFileSync('convex/customerRequestV2PreparationPorts.ts', 'utf8')
const writePortsSource = readFileSync('convex/customerRequestV2WritePorts.ts', 'utf8')
const moduleRoot = 'src/modules/customer-request/v2-preparation'

const hostPreparationMachines = [
  'prepare',
  'resume',
] as const

const moduleFiles = [
  'ports.ts',
  'types.ts',
  'integrity.ts',
  'prepare.ts',
  'resume.ts',
  'index.ts',
] as const

function collectModuleSources(root: string): string[] {
  return listTsFiles(root).map((path) => readFileSync(path, 'utf8'))
}

describe('customer-request v2-preparation thinness', () => {
  it('hosts preparation machines under v2-preparation/', () => {
    for (const file of moduleFiles) {
      expect(statSync(join(moduleRoot, file)).isFile()).toBe(true)
    }
    const index = readFileSync(join(moduleRoot, 'index.ts'), 'utf8')
    expect(index).toContain('prepareActionPreparation')
    expect(index).toContain('resumeActionPreparation')
    expect(index).toContain('CustomerRequestV2PreparationPorts')
    expect(index).toContain('aggregateIntegrityValid')
  })

  it('keeps host preparation exports as thin ports-wired shells', () => {
    for (const symbol of hostPreparationMachines) {
      expect(hostSource).toMatch(new RegExp(`export const ${symbol}\\s*=`))
    }
    expect(hostSource).toContain("throw new Error('customer_request_tables_unlisted')")
    expect(hostSource).toContain('prepareActionPreparationMachine')
    expect(hostSource).toContain('resumeActionPreparationMachine')
    expect(hostSource).toContain("from './customerRequestV2PreparationPorts'")
    expect(hostSource).toContain("from '@/modules/customer-request/v2-preparation'")

    for (const symbol of hostPreparationMachines) {
      const kind = symbol === 'prepare' ? 'internalMutation' : 'internalQuery'
      const start = hostSource.indexOf(`export const ${symbol} = ${kind}({`)
      expect(start).toBeGreaterThanOrEqual(0)
      const end = hostSource.indexOf('\n})', start)
      expect(end).toBeGreaterThan(start)
      const body = hostSource.slice(start, end)
      expect(body).toContain("throw new Error('customer_request_tables_unlisted')")
      expect(body.split('\n').length).toBeLessThanOrEqual(40)
      expect(body).not.toContain("query('customerRequestV2PreparationCommands')")
      expect(body).not.toContain("query('customerRequestV2ActionPreparations')")
      expect(body).not.toContain("query('customerRequestV2Heads')")
      expect(body).not.toContain('ctx.db.insert(')
      expect(body).not.toContain('ctx.db.patch(')
      expect(body).not.toContain('projectActionPreparation')
      expect(body).not.toContain('authorizeActionPreparation')
      expect(body).not.toContain('listRouteableCapabilitySupply')
    }
  })

  it('does not invent a Preparation sibling host or WritePlan DTOs', () => {
    expect(statSync('convex/customerRequestV2PreparationPorts.ts').isFile()).toBe(true)
    for (const forbidden of [
      'convex/customerRequestV2PreparationPrepare.ts',
      'convex/customerRequestV2PreparationResume.ts',
      'convex/customerRequestV2Prep.ts',
    ]) {
      expect(() => statSync(forbidden)).toThrow()
    }
    expect(preparationPortsSource.split('\n').length).toBeLessThanOrEqual(1000)
    expect(preparationPortsSource).toContain('export function customerRequestV2PreparationPorts')
    expect(preparationPortsSource).not.toMatch(/\bWritePlan\b/)
    expect(preparationPortsSource).not.toMatch(/\bintendedPatches\b/)
    for (const source of collectModuleSources(moduleRoot)) {
      expect(source).not.toMatch(/\bWritePlan\b/)
      expect(source).not.toMatch(/\bintendedPatches\b/)
      expect(source).not.toContain("from 'convex/")
      expect(source).not.toContain('from "./_generated')
      expect(source).not.toContain("from './_generated")
    }
  })

  it('does not reopen ADR-014 write ports or absorb prep into WritePorts', () => {
    expect(writePortsSource).not.toContain('prepareActionPreparation')
    expect(writePortsSource).not.toContain('resumeActionPreparation')
    expect(writePortsSource).not.toContain('customerRequestV2PreparationPorts')
    expect(writePortsSource).not.toContain('CustomerRequestV2PreparationPorts')
    expect(preparationPortsSource).not.toContain('customerRequestV2WritePorts')
    expect(preparationPortsSource).not.toContain('CustomerRequestV2WritePorts')
    expect(preparationPortsSource).not.toContain('commitAggregate')
    for (const source of collectModuleSources(moduleRoot)) {
      expect(source).not.toContain('v2-write')
      expect(source).not.toContain('CustomerRequestV2WritePorts')
    }
  })

  it('does not deepen egress / prepared-action hosts via PreparationPorts', () => {
    for (const path of [
      'convex/customerRequestV2PreparationEgress.ts',
      'convex/customerRequestV2PreparationEgressState.ts',
      'convex/customerRequestV2PreparedAction.ts',
    ]) {
      const source = readFileSync(path, 'utf8')
      expect(source).not.toContain('customerRequestV2PreparationPorts')
      expect(source).not.toContain('CustomerRequestV2PreparationPorts')
      expect(source).not.toContain('prepareActionPreparation')
      expect(source).not.toMatch(/from '@\/modules\/customer-request\/v2-preparation'/)
    }
  })

  it('keeps Application authorize-preparation free of preparation machines', () => {
    const applicationRoot = 'src/modules/customer-request/application/authorize-preparation'
    for (const source of collectModuleSources(applicationRoot)) {
      expect(source).not.toContain('v2-preparation')
      expect(source).not.toContain('customerRequestV2PreparationPorts')
      expect(source).not.toContain('prepareActionPreparation')
    }
  })
})
