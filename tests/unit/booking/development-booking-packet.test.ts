import { mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import { runDevelopmentBookingEvidenceV2 } from '@/modules/booking/development-booking-evidence-v2'
import {
  readAndVerifyBookingPacket,
  writeEvidencePacket,
} from '../../../tools/dev/action-invocation-evidence-packet'

describe('development booking evidence packet', () => {
  it('refuses a checksummed packet whose durable terminal control was semantically tampered', async () => {
    const scenario = await runDevelopmentBookingEvidenceV2()
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
})
