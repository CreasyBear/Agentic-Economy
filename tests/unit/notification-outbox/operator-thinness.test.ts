import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const hostSource = readFileSync('convex/notificationOutbox.ts', 'utf8')
const operatorPortsSource = readFileSync('convex/notificationOutboxOperatorPorts.ts', 'utf8')
const moduleRoot = 'src/modules/notification-outbox/operator'

const hostOperatorMachines = [
  'ingestNotificationWebhookEvent',
  'retryNotificationDispatchAsOperator',
  'markNotificationDispatchNoRepairAsOperator',
] as const

const moduleFiles = [
  'ports.ts',
  'types.ts',
  'serialize.ts',
  'parse-payload.ts',
  'resolve-webhook-dispatch.ts',
  'ingest-webhook.ts',
  'retry-dispatch.ts',
  'mark-no-repair.ts',
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

describe('notification-outbox operator thinness', () => {
  it('hosts operator machines under notification-outbox/operator/', () => {
    for (const file of moduleFiles) {
      expect(statSync(join(moduleRoot, file)).isFile()).toBe(true)
    }
    const index = readFileSync(join(moduleRoot, 'index.ts'), 'utf8')
    expect(index).toContain('ingestWebhook')
    expect(index).toContain('retryDispatch')
    expect(index).toContain('markNoRepair')
    expect(index).toContain('NotificationOutboxOperatorPorts')
    expect(index).toContain('serializeDispatch')
  })

  it('keeps host operator exports as thin ports-wired shells', () => {
    for (const symbol of hostOperatorMachines) {
      expect(hostSource).toMatch(new RegExp(`export const ${symbol}\\s*=`))
    }
    expect(hostSource).toContain('notificationOutboxOperatorPorts(ctx)')
    expect(hostSource).toContain('ingestWebhookMachine')
    expect(hostSource).toContain('retryDispatchMachine')
    expect(hostSource).toContain('markNoRepairMachine')
    expect(hostSource).toContain("from './notificationOutboxOperatorPorts'")
    expect(hostSource).toContain("from '../src/modules/notification-outbox/operator'")

    for (const symbol of hostOperatorMachines) {
      const start = hostSource.indexOf(`export const ${symbol} = mutationGeneric({`)
      expect(start).toBeGreaterThanOrEqual(0)
      const end = hostSource.indexOf('\n})', start)
      expect(end).toBeGreaterThan(start)
      const body = hostSource.slice(start, end)
      expect(body).toContain('notificationOutboxOperatorPorts(ctx)')
      expect(body.split('\n').length).toBeLessThanOrEqual(40)
      expect(body).not.toContain('notificationOutboxSourceStatePorts')
      expect(body).not.toContain('ingestNotificationWebhookModule')
      expect(body).not.toContain('retryNotificationDispatchModule')
      expect(body).not.toContain('markNotificationNoRepairModule')
      expect(body).not.toContain('recordNotificationOperationReconstruction')
      expect(body).not.toContain('readCurrentOperatorAuthority')
    }
  })

  it('does not invent webhook/operator sibling hosts or WritePlan DTOs', () => {
    expect(statSync('convex/notificationOutboxOperatorPorts.ts').isFile()).toBe(true)
    for (const forbidden of [
      'convex/notificationOutboxWebhook.ts',
      'convex/notificationOutboxOperator.ts',
      'convex/notificationOutboxRepair.ts',
    ]) {
      expect(() => statSync(forbidden)).toThrow()
    }
    expect(operatorPortsSource.split('\n').length).toBeLessThanOrEqual(1000)
    expect(operatorPortsSource).toContain('export function notificationOutboxOperatorPorts')
    expect(operatorPortsSource).toContain('notificationOutboxSourceStatePorts')
    expect(operatorPortsSource).not.toMatch(/\bWritePlan\b/)
    expect(operatorPortsSource).not.toMatch(/\bintendedPatches\b/)
    for (const source of collectModuleSources(moduleRoot)) {
      expect(source).not.toMatch(/\bWritePlan\b/)
      expect(source).not.toMatch(/\bintendedPatches\b/)
      expect(source).not.toContain("from 'convex/")
      expect(source).not.toContain('from "./_generated')
      expect(source).not.toContain("from './_generated")
    }
  })

  it('reuses Wave 37 source-state ports inside the adapter only', () => {
    expect(operatorPortsSource).toContain("from './notificationOutboxSourceStatePorts'")
    expect(operatorPortsSource).toContain('loadSourceState:')
    expect(operatorPortsSource).toContain('persistSourceState:')
    expect(operatorPortsSource).toContain('readOperatorAuthority:')
    expect(operatorPortsSource).toContain('recordReconstruction:')
    for (const source of collectModuleSources(moduleRoot)) {
      expect(source).not.toContain('notificationOutboxSourceStatePorts')
      expect(source).not.toContain('loadNotificationOutboxSourceState')
      expect(source).not.toContain('persistNotificationOutboxSourceState')
    }
  })

  it('keeps enqueueInquiryNotificationDispatch out of OperatorPorts', () => {
    expect(operatorPortsSource).not.toContain('enqueueInquiryNotificationDispatch')
    expect(operatorPortsSource).not.toContain('enqueueInquiryNotificationModule')
    expect(hostSource).toMatch(/export const enqueueInquiryNotificationDispatch\s*=/)
    const enqueueStart = hostSource.indexOf(
      'export const enqueueInquiryNotificationDispatch = mutationGeneric({',
    )
    const enqueueEnd = hostSource.indexOf('\n})', enqueueStart)
    const enqueueBody = hostSource.slice(enqueueStart, enqueueEnd)
    expect(enqueueBody).not.toContain('notificationOutboxOperatorPorts')
    expect(enqueueBody).toContain('enqueueInquiryNotificationModule')
  })

  it('does not re-inflate inquiryNotificationBridge', () => {
    const bridgeSource = readFileSync('convex/inquiryNotificationBridge.ts', 'utf8')
    expect(bridgeSource).not.toContain('ingestWebhook')
    expect(bridgeSource).not.toContain('retryDispatch')
    expect(bridgeSource).not.toContain('markNoRepair')
    expect(bridgeSource).not.toContain('notificationOutboxOperatorPorts')
  })
})
