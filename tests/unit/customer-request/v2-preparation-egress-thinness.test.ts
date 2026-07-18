import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const egressHost = readFileSync('convex/customerRequestV2PreparationEgress.ts', 'utf8')
const egressStateHost = readFileSync('convex/customerRequestV2PreparationEgressState.ts', 'utf8')
const preparedHost = readFileSync('convex/customerRequestV2PreparedAction.ts', 'utf8')
const egressPortsSource = readFileSync('convex/customerRequestV2PreparationEgressPorts.ts', 'utf8')
const actionPortsSource = readFileSync(
  'convex/customerRequestV2PreparationEgressActionPorts.ts',
  'utf8',
)
const preparedPortsSource = readFileSync('convex/customerRequestV2PreparedActionPorts.ts', 'utf8')
const preparationPortsSource = readFileSync('convex/customerRequestV2PreparationPorts.ts', 'utf8')
const writePortsSource = readFileSync('convex/customerRequestV2WritePorts.ts', 'utf8')
const moduleRoot = 'src/modules/customer-request/v2-preparation-egress'

const egressStateMachines = [
  'allocate',
  'beginDispatch',
  'resolveDispatch',
  'reconcileUncertain',
  'status',
  'unresolvedForRequest',
  'openReconciliation',
] as const

const egressActionMachines = [
  'run',
  'resume',
  'resumeRequest',
  'reconcile',
] as const

const preparedMachines = [
  'preparationMaterialDigest',
  'prepare',
] as const

const moduleFiles = [
  'ports.ts',
  'types.ts',
  'integrity.ts',
  'allocate.ts',
  'begin-dispatch.ts',
  'resolve-reconcile.ts',
  'queries.ts',
  'orchestrate.ts',
  'open-preparation.ts',
  'prepare-prepared-action.ts',
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

function assertThinHandler(
  hostSource: string,
  symbol: string,
  kind: 'internalMutation' | 'internalQuery' | 'internalAction',
  portsCall: string,
) {
  const start = hostSource.indexOf(`export const ${symbol} = ${kind}({`)
  expect(start).toBeGreaterThanOrEqual(0)
  const end = hostSource.indexOf('\n})', start)
  expect(end).toBeGreaterThan(start)
  const body = hostSource.slice(start, end)
  expect(body).toContain(portsCall)
  expect(body.split('\n').length).toBeLessThanOrEqual(40)
  expect(body).not.toContain('ctx.db.')
  expect(body).not.toContain("query('customerRequestV2")
  expect(body).not.toContain('ctx.db.insert(')
  expect(body).not.toContain('ctx.db.patch(')
  expect(body).not.toContain('guardedFetch')
  expect(body).not.toContain('compilePreparedActionOptions')
}

describe('customer-request v2-preparation-egress thinness', () => {
  it('hosts egress / prepared-action machines under v2-preparation-egress/', () => {
    for (const file of moduleFiles) {
      expect(statSync(join(moduleRoot, file)).isFile()).toBe(true)
    }
    const index = readFileSync(join(moduleRoot, 'index.ts'), 'utf8')
    expect(index).toContain('allocateEgress')
    expect(index).toContain('runEgress')
    expect(index).toContain('preparePreparedAction')
    expect(index).toContain('CustomerRequestV2PreparationEgressPorts')
    expect(index).toContain('CustomerRequestV2PreparedActionPorts')
    expect(index).toContain('operationIntegrityValid')
  })

  it('keeps egress-state exports as thin ports-wired shells', () => {
    for (const symbol of egressStateMachines) {
      expect(egressStateHost).toMatch(new RegExp(`export const ${symbol}\\s*=`))
    }
    expect(egressStateHost).toContain('customerRequestV2PreparationEgressPorts(ctx)')
    expect(egressStateHost).toContain("from './customerRequestV2PreparationEgressPorts'")
    expect(egressStateHost).toContain("from '@/modules/customer-request/v2-preparation-egress'")
    for (const symbol of egressStateMachines) {
      const kind = symbol === 'status'
        || symbol === 'unresolvedForRequest'
        || symbol === 'openReconciliation'
        ? 'internalQuery'
        : 'internalMutation'
      assertThinHandler(
        egressStateHost,
        symbol,
        kind,
        'customerRequestV2PreparationEgressPorts(ctx)',
      )
    }
  })

  it('keeps egress action exports as thin ports-wired shells with use node', () => {
    expect(egressHost.startsWith('"use node"')).toBe(true)
    for (const symbol of egressActionMachines) {
      expect(egressHost).toMatch(new RegExp(`export const ${symbol}\\s*=`))
    }
    expect(egressHost).toContain('customerRequestV2PreparationEgressActionPorts(ctx)')
    expect(egressHost).toContain("from './customerRequestV2PreparationEgressActionPorts'")
    expect(actionPortsSource.startsWith('"use node"')).toBe(true)
    expect(actionPortsSource).toContain('export function customerRequestV2PreparationEgressActionPorts')
    expect(actionPortsSource).toContain('dispatchRegisteredAdapter')
    expect(actionPortsSource).toContain('guardedFetch')
    for (const symbol of egressActionMachines) {
      assertThinHandler(
        egressHost,
        symbol,
        'internalAction',
        'customerRequestV2PreparationEgressActionPorts(ctx)',
      )
    }
  })

  it('keeps prepared-action exports as thin PreparedActionPorts shells', () => {
    for (const symbol of preparedMachines) {
      expect(preparedHost).toMatch(new RegExp(`export const ${symbol}\\s*=`))
    }
    expect(preparedHost).toContain('customerRequestV2PreparedActionPorts(ctx)')
    expect(preparedHost).toContain("from './customerRequestV2PreparedActionPorts'")
    expect(preparedPortsSource).toContain('export function customerRequestV2PreparedActionPorts')
    assertThinHandler(
      preparedHost,
      'preparationMaterialDigest',
      'internalQuery',
      'customerRequestV2PreparedActionPorts(ctx)',
    )
    assertThinHandler(
      preparedHost,
      'prepare',
      'internalMutation',
      'customerRequestV2PreparedActionPorts(ctx)',
    )
  })

  it('does not invent sibling host chops or WritePlan DTOs', () => {
    expect(statSync('convex/customerRequestV2PreparationEgressPorts.ts').isFile()).toBe(true)
    expect(statSync('convex/customerRequestV2PreparedActionPorts.ts').isFile()).toBe(true)
    for (const forbidden of [
      'convex/customerRequestV2PreparationEgressAllocate.ts',
      'convex/customerRequestV2PreparedActionPrepare.ts',
      'convex/customerRequestV2EgressRun.ts',
    ]) {
      expect(() => statSync(forbidden)).toThrow()
    }
    expect(egressPortsSource.split('\n').length).toBeLessThanOrEqual(1000)
    expect(preparedPortsSource.split('\n').length).toBeLessThanOrEqual(1000)
    expect(actionPortsSource.split('\n').length).toBeLessThanOrEqual(1000)
    expect(egressPortsSource).toContain('export function customerRequestV2PreparationEgressPorts')
    expect(egressPortsSource).not.toMatch(/\bWritePlan\b/)
    expect(egressPortsSource).not.toMatch(/\bintendedPatches\b/)
    expect(preparedPortsSource).not.toMatch(/\bWritePlan\b/)
    for (const source of collectModuleSources(moduleRoot)) {
      expect(source).not.toMatch(/\bWritePlan\b/)
      expect(source).not.toMatch(/\bintendedPatches\b/)
      expect(source).not.toContain("from 'convex/")
      expect(source).not.toContain('from "./_generated')
      expect(source).not.toContain("from './_generated")
      expect(source).not.toContain('undici')
      expect(source).not.toContain('guardedFetch')
    }
  })

  it('does not reopen Wave 45 PreparationPorts or ADR-014 WritePorts', () => {
    expect(writePortsSource).not.toContain('allocateEgress')
    expect(writePortsSource).not.toContain('preparePreparedAction')
    expect(writePortsSource).not.toContain('CustomerRequestV2PreparationEgressPorts')
    expect(preparationPortsSource).not.toContain('allocateEgress')
    expect(preparationPortsSource).not.toContain('CustomerRequestV2PreparationEgressPorts')
    expect(egressPortsSource).not.toContain('customerRequestV2WritePorts')
    expect(egressPortsSource).not.toContain('CustomerRequestV2WritePorts')
    expect(egressPortsSource).not.toContain('customerRequestV2PreparationPorts')
    expect(preparedPortsSource).not.toContain('CustomerRequestV2WritePorts')
    for (const source of collectModuleSources(moduleRoot)) {
      expect(source).not.toContain('v2-write')
      expect(source).not.toContain('CustomerRequestV2WritePorts')
      expect(source).not.toContain('CustomerRequestV2PreparationPorts')
    }
  })

  it('keeps Application preparation-egress free of Wave 46 machines', () => {
    const applicationRoot = 'src/modules/customer-request/application/preparation-egress'
    for (const source of collectModuleSources(applicationRoot)) {
      expect(source).not.toContain('v2-preparation-egress')
      expect(source).not.toContain('customerRequestV2PreparationEgressPorts')
      expect(source).not.toContain('customerRequestV2PreparedActionPorts')
      expect(source).not.toContain('allocateEgressMachine')
      expect(source).not.toContain('from \'@/modules/customer-request/v2-preparation-egress\'')
    }
  })
})
