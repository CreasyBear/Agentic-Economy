import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { runDevelopmentEvidenceScenario } from '@/modules/capability-supply/development-evidence-scenario'
import {
  readAndVerifyEvidencePacket,
  writeEvidencePacket,
} from '../../../tools/dev/action-invocation-evidence-packet'

const revision = 'bd23435eaf51b479dba460227e1680857c882ace'

describe('Action Invocation development evidence surface', () => {
  it('exposes run and fresh verify through the package CLI', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ae-evidence-cli-'))
    const path = join(directory, 'packet.json')
    const run = execFileSync('npm', [
      'run', 'evidence:action-invocation:development', '--', 'run', path,
    ], { encoding: 'utf8' })
    const verify = execFileSync('npm', [
      'run', 'evidence:action-invocation:development', '--', 'verify', path,
    ], { encoding: 'utf8' })
    expect(run).toContain('"command": "run"')
    expect(run).toContain('"environment": "MOCK/DEVELOPMENT ONLY"')
    expect(verify).toContain('"command": "verify"')
    expect(verify).toContain('"durableControlRecords": 1')
  })

  it('runs both origins, cold recovery, reference reuse, composition, and computed transfer', async () => {
    const result = await runDevelopmentEvidenceScenario()
    expect(result).toMatchObject({
      environment: 'MOCK/DEVELOPMENT ONLY',
      action: {
        id: 'supply.collectDevelopmentQuote',
        version: 'supply.collectDevelopmentQuote:v1',
      },
      origins: [
        { origin: { kind: 'request_owned' } },
        { origin: { kind: 'standalone' } },
      ],
      recovery: {
        before: { state: 'reconciliation_required' },
        release: { state: 'possibly_released' },
        coldContinuation: { state: 'reconciliation_required' },
        after: { state: 'terminal' },
      },
      composition: { noEffect: true },
      directConsequential: { effectCalls: 1 },
      transfer: {
        recommendation: 'retain_control_for_consequential_and_bypass_read_only',
        failedFalsifiers: [],
      },
    })
    expect(result.directControl.events.map(({ kind }) => kind)).toEqual([
      'approval_policy', 'direct_runner_started', 'direct_runner_returned',
      'direct_control_snapshot',
    ])
    expect(result.directConsequential.events.map(({ kind }) => kind)).toEqual([
      'approval_policy', 'direct_runner_started', 'effect_call',
      'direct_runner_returned', 'direct_control_snapshot',
    ])
  })

  it('writes and independently verifies a checksummed packet', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ae-evidence-'))
    const path = join(directory, 'packet.json')
    const scenario = await runDevelopmentEvidenceScenario()
    const written = await writeEvidencePacket(path, { gitRevision: revision, ...scenario })
    const verified = await readAndVerifyEvidencePacket(path, revision)
    expect(verified).toMatchObject({
      environment: 'MOCK/DEVELOPMENT ONLY',
      gitRevision: revision,
      checksum: written.checksum,
      reconstructed: {
        durableControlRecords: 1,
        attributableAttempts: 1,
        compositionNodes: 1,
      },
    })
  })

  it('refuses tampering and a wrong revision', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ae-evidence-'))
    const path = join(directory, 'packet.json')
    const scenario = await runDevelopmentEvidenceScenario()
    await writeEvidencePacket(path, { gitRevision: revision, ...scenario })
    await expect(readAndVerifyEvidencePacket(path, 'wrong-revision'))
      .rejects.toThrow('packet_revision_refused')
    const envelope = JSON.parse(await readFile(path, 'utf8')) as {
      packet: Record<string, unknown>
    }
    envelope.packet.claimCeiling = 'tampered'
    await writeFile(path, JSON.stringify(envelope), 'utf8')
    await expect(readAndVerifyEvidencePacket(path, revision))
      .rejects.toThrow('packet_checksum_refused')
  })

  it.each([
    ['source result digest', (packet: any) => {
      packet.durable.controls[0].sourceResultDigest = `sha256:${'0'.repeat(64)}`
    }, 'packet_source_identity_refused'],
    ['attempt linkage', (packet: any) => {
      packet.durable.attempts[0].invocationRef = 'mock:invocation:other'
    }, 'packet_attempt_linkage_refused'],
    ['history linkage', (packet: any) => {
      packet.durable.history[0].invocationRef = 'mock:invocation:other'
    }, 'packet_history_linkage_refused'],
    ['completion reference', (packet: any) => {
      packet.completedReference.sourceResultRef = 'mock:source-result:other'
    }, 'packet_completion_reference_refused'],
    ['composition', (packet: any) => {
      packet.composition.nodes[0].state = 'blocked'
    }, 'packet_composition_refused'],
    ['recovery', (packet: any) => {
      packet.recovery.after.state = 'retryable'
    }, 'packet_recovery_refused'],
    ['transfer', (packet: any) => {
      packet.transfer.recommendation = 'narrow_action_invocation_seam'
    }, 'packet_transfer_refused'],
  ])('refuses recomputed-checksum semantic tamper: %s', async (_label, mutate, refusal) => {
    const directory = await mkdtemp(join(tmpdir(), 'ae-evidence-semantic-'))
    const path = join(directory, 'packet.json')
    const scenario = await runDevelopmentEvidenceScenario()
    await writeEvidencePacket(path, { gitRevision: revision, ...scenario })
    const envelope = JSON.parse(await readFile(path, 'utf8')) as {
      checksum: string
      packet: Record<string, unknown>
    }
    mutate(envelope.packet)
    envelope.checksum = `sha256:${createHash('sha256')
      .update(JSON.stringify(envelope.packet)).digest('hex')}`
    await writeFile(path, JSON.stringify(envelope), 'utf8')
    await expect(readAndVerifyEvidencePacket(path, revision)).rejects.toThrow(refusal)
  })
})
