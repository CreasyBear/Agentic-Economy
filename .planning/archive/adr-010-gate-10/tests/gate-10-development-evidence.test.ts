import { beforeAll, describe, expect, it } from 'vitest'

import {
  buildGate10DevelopmentEvidence,
  type Gate10DevelopmentEvidence,
} from '@/modules/capability-supply/gate-10-development-evidence'
import { verifyGate10DevelopmentEvidence } from '@/modules/capability-supply/gate-10-development-verifier'
import { canonicalDigest } from '@/modules/common/canonical-digest'

let original: Gate10DevelopmentEvidence

beforeAll(async () => {
  original = await buildGate10DevelopmentEvidence()
})

describe('ADR-010 Gate 10 independent evidence verifier', () => {
  it('rebuilds the frozen baseline, host traces, per-case metrics, and disposition', async () => {
    await expect(verifyGate10DevelopmentEvidence(original)).resolves.toBeUndefined()
    expect(original.disposition).toBe('NARROW_OR_REDESIGN')
    expect(original.provenance).toMatchObject({
      sourceBaseCommit: '43c7151a1f11a3c3db870cc2a275af8fdc019460',
      baselineCommit: '1873de02b20fe548671f506315e23dbe693bd1e7',
      baselineTree: 'a993430d77d5b60aea7b1b9a45c9ef934a782ad8',
      baselineExecutableDigest:
        'sha256:749fc5dfb370463b580e40986981f0351ce48edb05bc7f0fa6705b86ebf82152',
    })
  })

  it.each([
    ['dropped direct event', (packet: any) => packet.directBaseline.cases[0].trace.splice(2, 1)],
    ['reordered host events', (packet: any) => {
      ;[packet.hostCases[0].timeline[0], packet.hostCases[0].timeline[1]] = [
        packet.hostCases[0].timeline[1],
        packet.hostCases[0].timeline[0],
      ]
    }],
    ['duplicated provider event', (packet: any) => {
      const event = packet.hostCases[0].timeline.find((entry: any) => entry.kind === 'provider_release')
      packet.hostCases[0].timeline.push({ ...event, sequence: packet.hostCases[0].timeline.length + 1 })
    }],
    ['coordinated task mutation', (packet: any) => {
      packet.directBaseline.task.operation.price.amountMinor = 2
      for (const hostCase of packet.hostCases) hostCase.task.operation.price.amountMinor = 2
      packet.taskDigest = canonicalDigest(packet.directBaseline.task)
    }],
    ['output substitution', (packet: any) => {
      packet.directBaseline.cases[0].final.outputDigest = 'sha256:forged'
    }],
    ['equal tuple inflation', (packet: any) => {
      packet.measurement.aggregateHumanEffort.strictImprovement = true
      packet.measurement.verdict = 'PASS_FOR_DECLARED_CLASS'
      packet.disposition = 'PASS_FOR_DECLARED_CLASS'
    }],
    ['missing failure case', (packet: any) => {
      packet.hostCases = packet.hostCases.filter(
        (entry: any) => entry.case !== 'post_release_uncertainty',
      )
    }],
    ['claim inflation', (packet: any) => {
      packet.claimCeiling = 'Proves real customer value.'
    }],
    ['baseline drift', (packet: any) => {
      packet.provenance.baselineTree = '1111111111111111111111111111111111111111'
    }],
    ['host packet drift', (packet: any) => {
      packet.hostPacket.hosts[0].success.effects.provider = 2
    }],
  ])('rejects %s after coordinated packet redigest', async (_name, mutate) => {
    const packet: any = clone(original)
    mutate(packet)
    redigest(packet)
    await expect(verifyGate10DevelopmentEvidence(packet)).rejects.toThrow()
  })
})

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function redigest(packet: any): void {
  const { packetDigest: _discarded, ...material } = packet
  packet.packetDigest = canonicalDigest(material)
}
