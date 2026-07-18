import { readFileSync, statSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const convexHost = readFileSync('convex/inquiries.ts', 'utf8')
const serializeModule = readFileSync(
  'src/modules/inquiries/internal/projections/serialize.ts',
  'utf8',
)
const operatorSerialize = readFileSync('convex/inquirySerializeOperator.ts', 'utf8')
const throughSource = readFileSync('src/modules/inquiries/inquiry.functions.ts', 'utf8')
const localE2eBypass = readFileSync('src/lib/server/local-e2e-bypass.ts', 'utf8')

const forbiddenHostDefs = [
  'loadInquirySourceState',
  'persistInquirySourceState',
  'enqueueInquiryNotificationDispatches',
  'toInquiryThreadRecord',
  'toInquiryMessageRecord',
  'toGovernedSendReceiptRecord',
  'toNotificationDispatchRecord',
  'serializeOwnerInbox',
  'serializeOwnerInquiryDetail',
  'serializeCustomerRecord',
  'serializeInquiryDeliveryReadback',
  'serializeInquiryExport',
  'serializeOwnerNotificationProjection',
  'serializeInquiryPrivacyTombstone',
  'serializeOperatorReconstructionReadback',
  'serializeOperatorRow',
] as const

const portsImplFiles = [
  'convex/inquirySourceStatePorts.ts',
  'convex/inquirySourceStateLoad.ts',
  'convex/inquirySourceStatePersist.ts',
  'convex/inquirySourceStateMappers.ts',
  'convex/inquiryRuntimeDbHelpers.ts',
  'convex/inquiryNotificationPorts.ts',
  'convex/inquiryNotificationBridge.ts',
  'convex/inquirySerializeOperator.ts',
] as const

describe('inquiry convex host thinness', () => {
  it('does not redefine moved source-state, notification, or serialize helpers', () => {
    for (const symbol of forbiddenHostDefs) {
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
    }
  })

  it('delegates load/persist/notify through ports and serializers through adapters', () => {
    expect(convexHost).toContain('inquirySourceStatePorts')
    expect(convexHost).toContain('inquiryNotificationPorts')
    expect(convexHost).toContain("from './inquirySourceStatePorts'")
    expect(convexHost).toContain("from './inquiryNotificationPorts'")
    expect(convexHost).toContain("from './inquirySerializeOperator'")
    expect(convexHost).toContain("from '../src/modules/inquiries/internal/projections/serialize'")
    expect(convexHost).toMatch(/inquirySourceStatePorts\([^)]*\)\.load\b/)
    expect(convexHost).toMatch(/inquirySourceStatePorts\([^)]*\)\.persist\b/)
    expect(convexHost).toMatch(/inquiryNotificationPorts\([^)]*\)\.enqueueDispatches\b/)
    expect(convexHost).toContain('serializeOwnerInbox')
    expect(convexHost).toContain('serializeOwnerInquiryDetail')
    expect(convexHost).toContain('serializeCustomerRecord')
    expect(convexHost).toContain('serializeOperatorReconstructionReadback')
    expect(convexHost).toContain('submitInquiryModule')
    expect(convexHost).toContain('replyToInquiryModule')
  })

  it('keeps submitPublicInquiry handler body relatively thin', () => {
    const start = convexHost.indexOf('export const submitPublicInquiry = mutationGeneric({')
    expect(start).toBeGreaterThanOrEqual(0)
    const end = convexHost.indexOf('export const listCurrentOwnerInbox = queryGeneric({', start)
    expect(end).toBeGreaterThan(start)
    const block = convexHost.slice(start, end)
    expect(block).toContain('inquirySourceStatePorts')
    expect(block).toContain('inquiryNotificationPorts')
    expect(block).toContain('submitInquiryModule')
    expect(block).not.toContain('loadInquirySourceState')
    expect(block).not.toContain('enqueueInquiryNotificationDispatches')
    expect(block.split('\n').length).toBeLessThanOrEqual(90)
  })

  it('keeps pure projection serializers in the module and RuntimeDocument operator serialize in Convex', () => {
    expect(statSync('src/modules/inquiries/internal/projections/serialize.ts').isFile()).toBe(true)
    expect(statSync('convex/inquirySerializeOperator.ts').isFile()).toBe(true)
    expect(serializeModule).toContain('export function serializeOwnerInbox')
    expect(serializeModule).toContain('export function serializeCustomerRecord')
    expect(serializeModule).not.toMatch(/from\s+['"]\.\/_generated/)
    expect(serializeModule).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
    expect(serializeModule).not.toMatch(/\bRuntimeDocument\b/)
    expect(serializeModule).not.toMatch(/\bRuntimeDb\b/)
    expect(operatorSerialize).toContain('export function serializeOperatorReconstructionReadback')
    expect(operatorSerialize).toContain('RuntimeDocument')
    expect(operatorSerialize.split('\n').length).toBeLessThanOrEqual(1000)
    expect(serializeModule.split('\n').length).toBeLessThanOrEqual(1000)
  })

  it('keeps validators and ThroughSource local e2e bypass intact', () => {
    expect(convexHost).toContain('const submitInquiryResult = v.union(')
    expect(convexHost).toContain('const ownerInboxResult = v.union(')
    expect(throughSource).toContain('submitPublicInquiryThroughSource')
    expect(throughSource).toContain('isLocalE2EAuthBypassEnabled')
    expect(throughSource).toMatch(/if\s*\(\s*isLocalE2EAuthBypassEnabled\(\)\s*\)/)
    expect(localE2eBypass).toContain('export function isLocalE2EAuthBypassEnabled')
  })

  it('keeps ports factories thin and implementation files under 1000 lines', () => {
    const sourcePorts = readFileSync('convex/inquirySourceStatePorts.ts', 'utf8')
    const notifyPorts = readFileSync('convex/inquiryNotificationPorts.ts', 'utf8')
    expect(sourcePorts.split('\n').length).toBeLessThanOrEqual(80)
    expect(notifyPorts.split('\n').length).toBeLessThanOrEqual(80)
    expect(sourcePorts).toContain('export function inquirySourceStatePorts')
    expect(notifyPorts).toContain('export function inquiryNotificationPorts')

    let largest = 0
    for (const path of portsImplFiles) {
      const lines = readFileSync(path, 'utf8').split('\n').length
      largest = Math.max(largest, lines)
      expect(lines, path).toBeLessThanOrEqual(1000)
    }
    expect(largest).toBeLessThanOrEqual(1000)
  })

  it('does not invent inquiryGovernedSendPorts unless the host still owns governed-send persistence', () => {
    expect(convexHost).not.toContain('inquiryGovernedSendPorts')
    expect(convexHost).toMatch(/inquirySourceStatePorts\([^)]*\)\.repairErasureKeys\b/)
  })
})
