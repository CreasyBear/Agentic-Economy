import { readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'
import { listTsFiles } from '../../helpers/source-files'

const hostSource = readFileSync('convex/notificationOutbox.ts', 'utf8')
const reconstructionSource = readFileSync('convex/notificationOutboxReconstruction.ts', 'utf8')
const moduleRoot = 'src/modules/notification-outbox/operator'

const hostOperatorMachines = [
  'ingestNotificationWebhookEvent',
  'retryNotificationDispatchAsOperator',
  'markNotificationDispatchNoRepairAsOperator',
] as const

const moduleFiles = [
  'serialize.ts',
  'parse-payload.ts',
  'resolve-webhook-dispatch.ts',
  'index.ts',
] as const

function collectModuleSources(root: string): string[] {
  return listTsFiles(root).map((path) => readFileSync(path, 'utf8'))
}

describe('notification-outbox operator thinness', () => {
  it('keeps only framework-free operator serializers and resolvers', () => {
    for (const file of moduleFiles) {
      expect(statSync(join(moduleRoot, file)).isFile()).toBe(true)
    }
    const index = readFileSync(join(moduleRoot, 'index.ts'), 'utf8')
    expect(index).toContain('parseRedactedPayload')
    expect(index).toContain('resolveWebhookDispatchId')
    expect(index).toContain('serializeDispatch')
    expect(index).not.toContain('NotificationOutboxOperatorPorts')
    for (const source of collectModuleSources(moduleRoot)) {
      expect(source).not.toMatch(/\bWritePlan\b/)
      expect(source).not.toMatch(/\bintendedPatches\b/)
      expect(source).not.toContain("from 'convex/")
      expect(source).not.toContain('from "./_generated')
      expect(source).not.toContain("from './_generated")
    }
  })

  it('hosts operator commands and persistence directly in notificationOutbox.ts', () => {
    for (const symbol of hostOperatorMachines) {
      expect(hostSource).toMatch(new RegExp(`export const ${symbol}\\s*=`))
    }
    expect(hostSource).toContain('ingestNotificationWebhook(')
    expect(hostSource).toContain('retryNotificationDispatch(')
    expect(hostSource).toContain('markNotificationNoRepair(')
    expect(hostSource).toContain('runNotificationRepair(')
    expect(hostSource).toContain('loadNotificationOutboxSourceStateForWebhook')
    expect(hostSource).toContain('loadNotificationOutboxSourceStateForDispatch')
    expect(hostSource).toContain('persistNotificationOutboxSourceState')
    expect(hostSource).toContain('recordNotificationOperationReconstruction')
    expect(hostSource).not.toContain('notificationOutboxOperatorPorts')
    expect(hostSource).not.toContain('notificationOutboxSourceStatePorts')
    expect(hostSource).not.toContain('ingestWebhookMachine')
    expect(hostSource).not.toContain('retryDispatchMachine')
    expect(hostSource).not.toContain('markNoRepairMachine')
    expect(hostSource).not.toContain("from './notificationOutboxOperatorPorts'")

    for (const symbol of hostOperatorMachines) {
      const start = hostSource.indexOf(`export const ${symbol} = mutationGeneric({`)
      const end = hostSource.indexOf('\n})', start)
      expect(start).toBeGreaterThanOrEqual(0)
      expect(end).toBeGreaterThan(start)
      const body = hostSource.slice(start, end)
      expect(body).not.toContain('notificationOutboxOperatorPorts')
      expect(body).not.toContain('notificationOutboxSourceStatePorts')
    }
  })

  it('deletes the single-host adapter files while retaining reconstruction persistence', () => {
    for (const forbidden of [
      'convex/notificationOutboxOperatorPorts.ts',
      'convex/notificationOutboxSourceStatePorts.ts',
      'convex/inquiryNotificationPorts.ts',
      'convex/inquirySourceStatePorts.ts',
      'convex/notificationOutboxWebhook.ts',
      'convex/notificationOutboxOperator.ts',
      'convex/notificationOutboxRepair.ts',
    ]) {
      expect(() => statSync(forbidden)).toThrow()
    }
    expect(statSync('convex/notificationOutboxReconstruction.ts').isFile()).toBe(true)
    expect(reconstructionSource).toContain('recordNotificationOperationReconstruction')
    expect(reconstructionSource).not.toContain('notificationOutboxSourceStatePorts')
    expect(reconstructionSource).not.toContain('NotificationOutboxOperatorPorts')
  })

  it('keeps enqueueInquiryNotificationDispatch out of operator orchestration', () => {
    const enqueueStart = hostSource.indexOf(
      'export const enqueueInquiryNotificationDispatch = mutationGeneric({',
    )
    const enqueueEnd = hostSource.indexOf('\n})', enqueueStart)
    const enqueueBody = hostSource.slice(enqueueStart, enqueueEnd)
    expect(enqueueBody).not.toContain('runNotificationRepair')
    expect(enqueueBody).toContain('enqueueInquiryNotificationModule')
    expect(enqueueBody).toContain('loadNotificationOutboxSourceStateForThread')
    expect(enqueueBody).toContain('persistNotificationOutboxSourceState')
  })

  it('does not re-inflate inquiryNotificationBridge', () => {
    const bridgeSource = readFileSync('convex/inquiryNotificationBridge.ts', 'utf8')
    expect(bridgeSource).not.toContain('ingestWebhook')
    expect(bridgeSource).not.toContain('retryDispatch')
    expect(bridgeSource).not.toContain('markNoRepair')
    expect(bridgeSource).not.toContain('notificationOutboxOperatorPorts')
    expect(bridgeSource).toContain('loadNotificationOutboxSourceStateForThread')
    expect(bridgeSource).toContain('persistNotificationOutboxSourceState')
  })
})
