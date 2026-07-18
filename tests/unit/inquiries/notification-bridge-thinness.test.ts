import { readFileSync, statSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const convexHost = readFileSync('convex/inquiries.ts', 'utf8')
const portsSource = readFileSync('convex/inquiryNotificationPorts.ts', 'utf8')
const bridgeSource = readFileSync('convex/inquiryNotificationBridge.ts', 'utf8')
const portsType = readFileSync('src/modules/inquiries/internal/notification-ports.ts', 'utf8')
const publicSource = readFileSync('src/modules/inquiries/public.ts', 'utf8')
const helpers = readFileSync('convex/inquiryRuntimeDbHelpers.ts', 'utf8')

const portsImplFiles = [
  'convex/inquiryNotificationPorts.ts',
  'convex/inquiryNotificationBridge.ts',
] as const

const forbiddenHostDefs = [
  'enqueueInquiryNotificationDispatches',
  'loadNotificationDispatchBindingState',
  'persistNotificationDispatchBindingState',
  'upsertNotificationDispatchReconstruction',
  'upsertNotificationAuditEvent',
  'toNotificationDispatchRecord',
] as const

describe('inquiry notification bridge thinness', () => {
  it('does not redefine moved notification-bridge helpers in the Convex host', () => {
    for (const symbol of forbiddenHostDefs) {
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)(?:async\\s+)?function\\s+${symbol}\\b`))
      expect(convexHost).not.toMatch(new RegExp(`(?:^|\\n)const\\s+${symbol}\\s*=`))
    }
  })

  it('delegates enqueue through inquiryNotificationPorts before source-state persist', () => {
    expect(convexHost).toContain('inquiryNotificationPorts')
    expect(convexHost).toContain("from './inquiryNotificationPorts'")
    expect(convexHost).toMatch(/inquiryNotificationPorts\([^)]*\)\.enqueueDispatches\b/)
    expect(convexHost).toMatch(/inquirySourceStatePorts\([^)]*\)\.persist\b/)
    expect(convexHost).toContain('submitInquiryModule')
    expect(convexHost).toContain('replyToInquiryModule')
  })

  it('keeps ports type free of Convex runtime and exports through public', () => {
    expect(portsType).not.toMatch(/from\s+['"]\.\/_generated/)
    expect(portsType).not.toMatch(/from\s+['"][^'"]*_generated[^'"]*['"]/)
    expect(portsType).not.toMatch(/from\s+['"][^'"]*convex\/server['"]/)
    expect(portsType).not.toMatch(/\bRuntimeDb\b/)
    expect(portsType).toContain('enqueueDispatches')
    expect(publicSource).toContain('InquiryNotificationPorts')
  })

  it('keeps inquiryNotificationPorts factory thin with no freestanding RuntimeDb side-doors', () => {
    expect(statSync('convex/inquiryNotificationPorts.ts').isFile()).toBe(true)
    const lineCount = portsSource.split('\n').length
    expect(lineCount).toBeLessThanOrEqual(80)
    expect(portsSource).toContain('export function inquiryNotificationPorts')
    expect(portsSource).toContain('enqueueDispatches:')
    expect(portsSource).not.toMatch(/\bexport\s+(?:async\s+)?function\s+enqueueInquiryNotificationDispatches\b/)
    expect(portsSource).not.toMatch(/\bexport\s+(?:async\s+)?function\s+loadNotificationDispatchBindingState\b/)
    expect(portsSource).not.toMatch(/\bexport\s+(?:async\s+)?function\s+persistNotificationDispatchBindingState\b/)
    expect(portsSource).not.toMatch(/\bexport\s+(?:async\s+)?function\s+toNotificationDispatchRecord\b/)
  })

  it('does not move source-state load/persist into notification ports', () => {
    for (const path of portsImplFiles) {
      const source = readFileSync(path, 'utf8')
      expect(source).not.toContain('loadInquirySourceState')
      expect(source).not.toContain('persistInquirySourceState')
      expect(source).not.toContain('inquirySourceStatePorts')
    }
  })

  it('reuses inquiryRuntimeDbHelpers instead of duplicating upsert helpers', () => {
    expect(bridgeSource).toContain("from './inquiryRuntimeDbHelpers'")
    expect(bridgeSource).toContain('upsertByFields')
    expect(bridgeSource).not.toMatch(/(?:^|\n)(?:async\s+)?function\s+upsertByFields\b/)
    expect(bridgeSource).not.toMatch(/(?:^|\n)function\s+stringField\b/)
    expect(helpers).toContain('export async function upsertByFields')
    expect(helpers).toContain('export function stringField')
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
})
