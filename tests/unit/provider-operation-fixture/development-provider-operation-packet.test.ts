import { mkdir, rename } from 'node:fs/promises'
import { join } from 'node:path'
import { homedir, tmpdir } from 'node:os'

import { describe, expect, it } from 'vitest'

import { runDevelopmentProviderOperationEvidence } from '../../../tools/dev/fixtures/provider-operation/development-provider-operation-evidence'
import { canonicalDigest } from '@/modules/common/canonical-digest'
import {
  readAndVerifyProviderOperationPacket,
  writeEvidencePacket,
} from '../../../tools/dev/action-invocation-evidence-packet'

describe('development operation evidence packet', () => {
  it('refuses a checksummed packet whose durable terminal control was semantically tampered', async () => {
    const scenario = await runDevelopmentProviderOperationEvidence()
    const gitRevision = 'test:operation-packet-revision'
    const packet = structuredClone({ gitRevision, ...scenario }) as Record<string, unknown>
    const durable = packet.durable as {
      terminal: { controls: Array<{ control: { control: unknown } }> }
    }
    durable.terminal.controls[0]!.control.control = { state: 'awaiting_authority' }
    const path = join(tmpdir(), `ae-operation-tamper-${crypto.randomUUID()}.json`)
    await writeEvidencePacket(path, packet)
    await expect(readAndVerifyProviderOperationPacket(path, gitRevision))
      .rejects.toThrow('packet_provider_operation_control_reconstruction_refused')
    const trash = join(homedir(), '.Trash')
    await mkdir(trash, { recursive: true })
    await rename(path, join(trash, `ae-operation-tamper-${crypto.randomUUID()}.json`))
  })

  it('refuses recomputed-checksum effect identity tampering', async () => {
    const scenario = await runDevelopmentProviderOperationEvidence()
    const packet = structuredClone({ gitRevision: 'test:result-tamper', ...scenario }) as Record<string, unknown>
    const terminal = (packet.durable as {
      terminal: { source: { resultIdentity: { sourceResultRef: string } } }
    }).terminal
    terminal.source.resultIdentity.sourceResultRef = 'mock:effect:tampered'
    await expectTamperRefused(packet, 'test:result-tamper', 'packet_provider_operation_result_identity_refused')
  })

  it('refuses recomputed-checksum attempt linkage tampering', async () => {
    const scenario = await runDevelopmentProviderOperationEvidence()
    const packet = structuredClone({ gitRevision: 'test:attempt-tamper', ...scenario }) as Record<string, unknown>
    const terminal = (packet.durable as {
      terminal: { attempts: Array<{ invocationRef: string }> }
    }).terminal
    terminal.attempts[0]!.invocationRef = 'mock:invocation:wrong'
    await expectTamperRefused(packet, 'test:attempt-tamper', 'packet_provider_operation_attempt_linkage_refused')
  })

  it('refuses recomputed-checksum history invocation linkage tampering', async () => {
    const scenario = await runDevelopmentProviderOperationEvidence()
    const packet = structuredClone({ gitRevision: 'test:history-tamper', ...scenario }) as Record<string, unknown>
    const terminal = (packet.durable as {
      terminal: { history: Array<{ invocationRef: string }> }
    }).terminal
    terminal.history[0]!.invocationRef = 'mock:invocation:wrong'
    await expectTamperRefused(packet, 'test:history-tamper', 'packet_provider_operation_history_linkage_refused')
  })

  it('refuses released terminal disposition rewritten to not released', async () => {
    const packet = await reconciliationTamperPacket('test:resolution-tamper')
    const evidence = reconciliationEvidence(packet)
    evidence.resolution = 'not_released'
    evidence.digest = digestEvidence(evidence)
    await expectTamperRefused(
      packet,
      'test:resolution-tamper',
      'packet_provider_operation_reconciliation_disposition_refused',
    )
  })

  it('refuses reconciliation evidence with a mismatched canonical digest', async () => {
    const packet = await reconciliationTamperPacket('test:digest-tamper')
    reconciliationEvidence(packet).digest = 'sha256:0000000000000000000000000000000000000000000000000000000000000000'
    await expectTamperRefused(
      packet,
      'test:digest-tamper',
      'packet_provider_operation_reconciliation_evidence_refused:evidence_digest_mismatch',
    )
  })

  it('refuses reconciliation observation outside the persisted attempt window', async () => {
    const packet = await reconciliationTamperPacket('test:time-tamper')
    const evidence = reconciliationEvidence(packet)
    evidence.observedAt = '2026-07-19T05:00:00.000Z'
    evidence.digest = digestEvidence(evidence)
    await expectTamperRefused(
      packet,
      'test:time-tamper',
      'packet_provider_operation_reconciliation_evidence_refused:evidence_time_invalid',
    )
  })

  it('refuses an advertised Gate 7 pass whose executable checks do not recompute', async () => {
    const scenario = await runDevelopmentProviderOperationEvidence()
    const packet = structuredClone({
      gitRevision: 'test:gate7-tamper',
      ...scenario,
    }) as Record<string, unknown>
    ;(packet.executableChecks as Record<string, boolean>).conflictWithoutEffect = false
    await expectTamperRefused(
      packet,
      'test:gate7-tamper',
      'packet_provider_operation_gate7_reconstruction_refused',
    )
  })

  it('refuses an advertised Gate 7 pass whose transfer evidence does not recompute', async () => {
    const scenario = await runDevelopmentProviderOperationEvidence()
    const packet = structuredClone({
      gitRevision: 'test:gate7-transfer-tamper',
      ...scenario,
    }) as Record<string, unknown>
    ;(packet.proportionality as any).measurements.controlled.controlRecords += 1
    await expectTamperRefused(
      packet,
      'test:gate7-transfer-tamper',
      'packet_provider_operation_gate7_reconstruction_refused',
    )
  })
})

type MutableEvidence = {
  resolution: 'released' | 'not_released'
  observedAt: string
  digest: string
  [key: string]: unknown
}

async function reconciliationTamperPacket(revision: string) {
  const scenario = await runDevelopmentProviderOperationEvidence()
  return structuredClone({ gitRevision: revision, ...scenario }) as Record<string, unknown>
}

function reconciliationEvidence(packet: Record<string, unknown>): MutableEvidence {
  return (packet.durable as {
    uncertain: { source: { reconciliationEvidence: MutableEvidence } }
  }).uncertain.source.reconciliationEvidence
}

function digestEvidence(evidence: MutableEvidence) {
  const { digest: _digest, ...material } = evidence
  return canonicalDigest(material as never)
}

async function expectTamperRefused(
  packet: Record<string, unknown>,
  revision: string,
  error: string,
) {
  const path = join(tmpdir(), `ae-operation-tamper-${crypto.randomUUID()}.json`)
  await writeEvidencePacket(path, packet)
  await expect(readAndVerifyProviderOperationPacket(path, revision)).rejects.toThrow(error)
  const trash = join(homedir(), '.Trash')
  await mkdir(trash, { recursive: true })
  await rename(path, join(trash, `ae-operation-tamper-${crypto.randomUUID()}.json`))
}
