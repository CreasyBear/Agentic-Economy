import { mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import { runDevelopmentBookingEvidence } from '@/modules/booking/development-booking-evidence'
import {
  readAndVerifyBookingPacket,
  writeEvidencePacket,
} from '../../../tools/dev/action-invocation-evidence-packet'

describe('development booking evidence packet', () => {
  it('refuses a checksummed packet whose durable terminal control was semantically tampered', async () => {
    const scenario = await runDevelopmentBookingEvidence()
    const gitRevision = 'test:booking-packet-revision'
    const packet = structuredClone({ gitRevision, ...scenario }) as Record<string, unknown>
    const durable = packet.durable as {
      terminal: { controls: Array<{ control: { control: unknown } }> }
    }
    durable.terminal.controls[0]!.control.control = { state: 'awaiting_authority' }
    const path = join(tmpdir(), `ae-booking-tamper-${crypto.randomUUID()}.json`)
    await writeEvidencePacket(path, packet)
    await expect(readAndVerifyBookingPacket(path, gitRevision))
      .rejects.toThrow('packet_booking_control_reconstruction_refused')
    const trash = join(homedir(), '.Trash')
    await mkdir(trash, { recursive: true })
    await rename(path, join(trash, `ae-booking-tamper-${crypto.randomUUID()}.json`))
  })

  it('refuses recomputed-checksum reservation identity tampering', async () => {
    const scenario = await runDevelopmentBookingEvidence()
    const packet = structuredClone({ gitRevision: 'test:result-tamper', ...scenario }) as Record<string, unknown>
    const terminal = (packet.durable as {
      terminal: { source: { resultIdentity: { sourceResultRef: string } } }
    }).terminal
    terminal.source.resultIdentity.sourceResultRef = 'mock:reservation:tampered'
    await expectTamperRefused(packet, 'test:result-tamper', 'packet_booking_result_identity_refused')
  })

  it('refuses recomputed-checksum attempt linkage tampering', async () => {
    const scenario = await runDevelopmentBookingEvidence()
    const packet = structuredClone({ gitRevision: 'test:attempt-tamper', ...scenario }) as Record<string, unknown>
    const terminal = (packet.durable as {
      terminal: { attempts: Array<{ invocationRef: string }> }
    }).terminal
    terminal.attempts[0]!.invocationRef = 'mock:invocation:wrong'
    await expectTamperRefused(packet, 'test:attempt-tamper', 'packet_booking_attempt_linkage_refused')
  })

  it('refuses recomputed-checksum history invocation linkage tampering', async () => {
    const scenario = await runDevelopmentBookingEvidence()
    const packet = structuredClone({ gitRevision: 'test:history-tamper', ...scenario }) as Record<string, unknown>
    const terminal = (packet.durable as {
      terminal: { history: Array<{ invocationRef: string }> }
    }).terminal
    terminal.history[0]!.invocationRef = 'mock:invocation:wrong'
    await expectTamperRefused(packet, 'test:history-tamper', 'packet_booking_history_linkage_refused')
  })
})

async function expectTamperRefused(
  packet: Record<string, unknown>,
  revision: string,
  error: string,
) {
  const path = join(tmpdir(), `ae-booking-tamper-${crypto.randomUUID()}.json`)
  await writeEvidencePacket(path, packet)
  await expect(readAndVerifyBookingPacket(path, revision)).rejects.toThrow(error)
  const trash = join(homedir(), '.Trash')
  await mkdir(trash, { recursive: true })
  await rename(path, join(trash, `ae-booking-tamper-${crypto.randomUUID()}.json`))
}
