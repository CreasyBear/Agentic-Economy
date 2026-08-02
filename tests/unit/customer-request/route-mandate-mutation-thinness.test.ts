import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../helpers/source-files'

const hostSource = readFileSync('convex/customerRequestRouteMandate.ts', 'utf8')
const portsSource = readFileSync('convex/customerRequestRouteMandatePorts.ts', 'utf8')
const lifecycleSource = readFileSync('convex/customerRequestRouteMandateLifecycle.ts', 'utf8')
const writePortsSource = readFileSync('convex/customerRequestV2WritePorts.ts', 'utf8')
const readPortsSource = readFileSync('convex/customerRequestV2ReadPorts.ts', 'utf8')
const moduleRoot = 'src/modules/customer-request/route-mandate-mutation'

const hostMutationMachines = [
  'issue',
  'revoke',
  'getHistory',
] as const

const moduleFiles = [
  'ports.ts',
  'types.ts',
  'issue.ts',
  'revoke.ts',
  'get-history.ts',
  'index.ts',
] as const

function collectModuleSources(root: string): string[] {
  return listTsFiles(root).map((path) => readFileSync(path, 'utf8'))
}

describe('customer-request route-mandate-mutation thinness', () => {
  it('hosts mutation machines under route-mandate-mutation/', () => {
    for (const file of moduleFiles) {
      expect(statSync(join(moduleRoot, file)).isFile()).toBe(true)
    }
    const index = readFileSync(join(moduleRoot, 'index.ts'), 'utf8')
    expect(index).toContain('issue')
    expect(index).toContain('revoke')
    expect(index).toContain('getHistory')
    expect(index).toContain('RouteMandateMutationPorts')
  })

  it('keeps host issue/revoke/getHistory as thin ports-wired shells', () => {
    expect(hostSource).toContain('routeMandateMutationPorts(ctx)')
    expect(hostSource).toContain('issueMachine')
    expect(hostSource).toContain('revokeMachine')
    expect(hostSource).toContain('getHistoryMachine')
    expect(hostSource).toContain("from './customerRequestRouteMandatePorts'")
    expect(hostSource).toContain("from '@/modules/customer-request/route-mandate-mutation'")

    for (const symbol of hostMutationMachines) {
      const kind = symbol === 'getHistory' ? 'internalQuery' : 'internalMutation'
      const start = hostSource.indexOf(`export const ${symbol} = ${kind}({`)
      expect(start).toBeGreaterThanOrEqual(0)
      const end = hostSource.indexOf('\n})', start)
      expect(end).toBeGreaterThan(start)
      const body = hostSource.slice(start, end)
      expect(body).toContain('routeMandateMutationPorts(ctx)')
      expect(body.split('\n').length).toBeLessThanOrEqual(40)
      expect(body).not.toContain("query('customerRequestRouteMandateCommands')")
      expect(body).not.toContain("query('customerRequestRouteMandateIssues')")
      expect(body).not.toContain("query('customerRequestRouteMandateHeads')")
      expect(body).not.toContain("query('customerRequestRouteMandateRevocations')")
      expect(body).not.toContain('ctx.db.insert(')
      expect(body).not.toContain('ctx.db.patch(')
      expect(body).not.toContain('compileRouteMandate(')
      expect(body).not.toContain('persistRouteMandateIssue(')
    }
  })

  it('does not invent a Mandate sibling host or WritePlan DTOs', () => {
    expect(statSync('convex/customerRequestRouteMandatePorts.ts').isFile()).toBe(true)
    for (const forbidden of [
      'convex/customerRequestRouteMandateIssue.ts',
      'convex/customerRequestRouteMandateRevoke.ts',
      'convex/customerRequestRouteMandateHistory.ts',
    ]) {
      expect(() => statSync(forbidden)).toThrow()
    }
    expect(portsSource.split('\n').length).toBeLessThanOrEqual(1000)
    expect(portsSource).toContain('export function routeMandateMutationPorts')
    expect(portsSource).toContain('export async function persistRouteMandateIssue')
    expect(portsSource).toContain('export async function authenticateRequestOwner')
    expect(portsSource).toContain('export async function openCurrentRouteGeneration')
    expect(portsSource).not.toMatch(/\bWritePlan\b/)
    expect(portsSource).not.toMatch(/\bintendedPatches\b/)
    for (const source of collectModuleSources(moduleRoot)) {
      expect(source).not.toMatch(/\bWritePlan\b/)
      expect(source).not.toMatch(/\bintendedPatches\b/)
      expect(source).not.toContain("from 'convex/")
      expect(source).not.toContain('from "./_generated')
      expect(source).not.toContain("from './_generated")
    }
  })

  it('reuses route-mandate.ts compile authority and keeps lifecycle thin', () => {
    const issueMachine = readFileSync(join(moduleRoot, 'issue.ts'), 'utf8')
    expect(issueMachine).toContain("from '@/modules/customer-request/route-mandate'")
    expect(issueMachine).toContain('compileRouteMandate')
    expect(issueMachine).toContain('routeMandateAuthorityScopeDigest')
    expect(lifecycleSource).toContain('export async function supersedeCurrentRouteMandate')
    expect(lifecycleSource.split('\n').length).toBeLessThanOrEqual(100)
    expect(lifecycleSource).not.toContain('RouteMandateMutationPorts')
    expect(lifecycleSource).not.toContain('routeMandateMutationPorts')
    expect(portsSource).not.toContain('supersedeCurrentRouteMandate')
  })

  it('does not reopen ADR-014 write ports or ADR-017 read ports for mandate', () => {
    expect(writePortsSource).not.toContain('RouteMandateMutationPorts')
    expect(writePortsSource).not.toContain('routeMandateMutationPorts')
    expect(readPortsSource).not.toContain('RouteMandateMutationPorts')
    expect(readPortsSource).not.toContain('routeMandateMutationPorts')
    expect(portsSource).not.toContain('CustomerRequestV2WritePorts')
    expect(portsSource).not.toContain('CustomerRequestV2ReadPorts')
    expect(portsSource).not.toContain('commitAggregate')
    for (const source of collectModuleSources(moduleRoot)) {
      expect(source).not.toContain('CustomerRequestV2WritePorts')
      expect(source).not.toContain('CustomerRequestV2ReadPorts')
      expect(source).not.toContain('v2-write')
      expect(source).not.toContain('v2-read')
    }
  })

  it('preserves host re-exports for standing/admission/route-execution callers', () => {
    expect(hostSource).toContain('authenticateRequestOwner')
    expect(hostSource).toContain('authenticateRequestOwnerForMutation')
    expect(hostSource).toContain('openCurrentRouteGeneration')
    expect(hostSource).toContain('persistRouteMandateIssue')
    expect(hostSource).toContain('readCurrentRouteMandateState')
    expect(hostSource).toContain('readCurrentRouteMandateStateForPrincipal')
    expect(hostSource).toMatch(/export const getCurrent\s*=/)
    expect(hostSource).toMatch(/export const getCurrentForPrincipal\s*=/)
  })
})
