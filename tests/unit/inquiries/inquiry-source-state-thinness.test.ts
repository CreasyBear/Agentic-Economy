import { readFileSync, statSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const convexHost = readFileSync('convex/inquiries.ts', 'utf8')
const portsSource = readFileSync('convex/inquirySourceStatePorts.ts', 'utf8')
const portsType = readFileSync('src/modules/inquiries/internal/ledger/ports.ts', 'utf8')
const ledgerIndex = readFileSync('src/modules/inquiries/internal/ledger/index.ts', 'utf8')
const publicSource = readFileSync('src/modules/inquiries/public.ts', 'utf8')

const portsImplFiles = [
  'convex/inquirySourceStatePorts.ts',
  'convex/inquirySourceStateLoad.ts',
  'convex/inquirySourceStatePersist.ts',
  'convex/inquirySourceStateMappers.ts',
  'convex/inquiryRuntimeDbHelpers.ts',
] as const

const sourceStateOnlyFiles = [
  'convex/inquirySourceStatePorts.ts',
  'convex/inquirySourceStateLoad.ts',
  'convex/inquirySourceStatePersist.ts',
  'convex/inquirySourceStateMappers.ts',
] as const

const forbiddenHostDefs = [
  'loadInquirySourceState',
  'loadInquiryCustomerRecordState',
  'persistInquirySourceState',
  'toBusinessRecord',
  'toInquiryThreadRecord',
  'toInquiryMessageRecord',
  'toGovernedSendReceiptRecord',
  'persistGovernedSendReceipt',
  'upsertInquiryOperation',
] as const

describe('inquiry source-state thinness', () => {
  it('does not redefine moved source-state helpers in the Convex host', () => {
    for (const symbol of forbiddenHostDefs) {
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
    }
  })

  it('delegates source-state load/persist through inquirySourceStatePorts', () => {
    expect(convexHost).toContain('inquirySourceStatePorts')
    expect(convexHost).toContain("from './inquirySourceStatePorts'")
    expect(convexHost).toContain('submitInquiryModule')
    expect(convexHost).toMatch(/mutationGeneric[\s\S]*submitPublicInquiry|export const submitPublicInquiry\s*=\s*mutationGeneric/)
    expect(convexHost).toContain('enqueueInquiryNotificationDispatches')
    expect(convexHost).toMatch(/inquirySourceStatePorts\([^)]*\)\.load\b/)
    expect(convexHost).toMatch(/inquirySourceStatePorts\([^)]*\)\.persist\b/)
  })

  it('uses ports.repairErasureKeys instead of freestanding repairGovernedSendErasureKeys', () => {
    expect(convexHost).toMatch(/inquirySourceStatePorts\([^)]*\)\.repairErasureKeys\b/)
    expect(convexHost).not.toMatch(/import\s*\{[^}]*\brepairGovernedSendErasureKeys\b[^}]*\}\s*from\s*['"]\.\/inquirySourceStatePorts['"]/)
    expect(portsSource).not.toMatch(/\bexport\s+(?:async\s+)?function\s+repairGovernedSendErasureKeys\b/)
    expect(portsSource).not.toMatch(/\bexport\s+(?:async\s+)?function\s+assertGovernedSendLineageAuthority\b/)
    expect(portsSource).not.toMatch(/\bexport\s+(?:async\s+)?function\s+toInquiryCustomerAccessGrant\b/)
  })

  it('keeps ports type free of Convex runtime and exports through ledger/public', () => {
    expect(portsType).not.toMatch(/from\s+['"]\.\/_generated/)
    expect(portsType).not.toMatch(/from\s+['"][^'"]*_generated[^'"]*['"]/)
    expect(portsType).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
    expect(portsType).not.toMatch(/\bRuntimeDb\b/)
    expect(portsType).toContain('repairErasureKeys')
    expect(ledgerIndex).toContain("from './ports'")
    expect(ledgerIndex).toContain('InquirySourceStatePorts')
    expect(publicSource).toContain('InquirySourceStatePorts')
  })

  it('keeps inquirySourceStatePorts factory thin', () => {
    expect(statSync('convex/inquirySourceStatePorts.ts').isFile()).toBe(true)
    const lineCount = portsSource.split('\n').length
    expect(lineCount).toBeLessThanOrEqual(80)
    expect(portsSource).toContain('export function inquirySourceStatePorts')
    expect(portsSource).toContain('load:')
    expect(portsSource).toContain('loadCustomerRecord:')
    expect(portsSource).toContain('persist:')
    expect(portsSource).toContain('repairErasureKeys:')
  })

  it('does not move notification outbox orchestration into source-state ports', () => {
    for (const path of portsImplFiles) {
      expect(readFileSync(path, 'utf8')).not.toContain('enqueueInquiryNotification')
    }
    for (const path of sourceStateOnlyFiles) {
      expect(readFileSync(path, 'utf8')).not.toContain('notificationDispatches')
    }
    expect(convexHost).toContain('enqueueInquiryNotificationDispatches')
  })

  it('keeps each ports implementation file under 1000 lines', () => {
    let largest = 0
    for (const path of portsImplFiles) {
      const lines = readFileSync(path, 'utf8').split('\n').length
      largest = Math.max(largest, lines)
      expect(lines, path).toBeLessThanOrEqual(1000)
    }
    expect(largest).toBeLessThanOrEqual(1000)
  })

  it('shares upsert/stringField helpers instead of twin copies', () => {
    expect(statSync('convex/inquiryRuntimeDbHelpers.ts').isFile()).toBe(true)
    expect(convexHost).toContain("from './inquiryRuntimeDbHelpers'")
    expect(convexHost).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+upsertByFields\b/)
    expect(convexHost).not.toMatch(/(?:^|\n)function\s+stringField\b/)
    const helpers = readFileSync('convex/inquiryRuntimeDbHelpers.ts', 'utf8')
    expect(helpers).toContain('export async function upsertByFields')
    expect(helpers).toContain('export function stringField')
  })
})
