import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { canonicalDigest } from '@/modules/common/canonical-digest'
import { prepareFormanceFundingSettlement } from '@/modules/money/formance-workflows'
import {
  captureFormanceRestoreBaseline, main, parseFormanceRestoreCommand, verifyFormanceRestore,
  type FormanceRestoreBaseline,
} from '../../../tools/release/formance-restore'

const configuration = { environment: 'sandbox' as const, gatewayUrl: 'http://127.0.0.1:3179',
  ledger: 'restore-ledger', requestTimeoutMs: 5_000 }
const prepared = prepareFormanceFundingSettlement({
  commandRef: 'funding:restore-original', idempotencyKey: 'funding:restore-original',
  accountRef: 'account:restore', processorRef: 'processor:restore',
  principalUnits: '100', serviceFeeUnits: '1', taxUnits: '1', totalUnits: '102',
  policyDigest: `sha256:${'a'.repeat(64)}`, externalEvidenceDigest: `sha256:${'b'.repeat(64)}`,
})
if (prepared.kind !== 'prepared') throw new Error(prepared.code)
const command = prepared.command
const digest = `sha256:${'c'.repeat(64)}`
const baseline: FormanceRestoreBaseline = {
  version: 'ae.formance-restore-baseline:v1', sourceGateway: configuration.gatewayUrl,
  restoreTime: '2026-10-01T01:02:03.456Z', transactionId: '1', commandRef: command.commandRef,
  commandDigest: canonicalDigest(command),
  summary: { ledger: configuration.ledger, counts: { transactions: 1, accounts: 4, schemas: 1 },
    digests: { ledger: digest, transactions: digest, accounts: digest, schemas: digest } },
}
const target = { ...configuration, gatewayUrl: 'http://127.0.0.1:3180' }
const directories: string[] = []
afterEach(async () => {
  vi.unstubAllGlobals()
  await Promise.all(directories.splice(0).map(path => rm(path, { recursive: true, force: true })))
})

describe('restore verification entry boundary', () => {
  it('accepts the original canonical command and refuses invented template or changed metadata', () => {
    expect(parseFormanceRestoreCommand(command)).toEqual(command)
    expect(() => parseFormanceRestoreCommand({ ...command, template: 'PROBE' })).toThrow('formance_restore_command_invalid')
    expect(() => parseFormanceRestoreCommand({ ...command, metadata: { ...command.metadata, idempotency_digest: 'f'.repeat(64) } }))
      .toThrow('formance_restore_command_invalid')
    expect(() => parseFormanceRestoreCommand({ ...command, force: true })).toThrow('formance_restore_command_invalid')
  })

  it('refuses source reuse, malformed baseline, different ledger and changed command before network access', async () => {
    const fetch = vi.fn(() => { throw new Error('unexpected outbound request') })
    vi.stubGlobal('fetch', fetch)
    await expect(verifyFormanceRestore(configuration, baseline, command)).rejects.toMatchObject({ code: 'formance_restore_source_target_same' })
    await expect(verifyFormanceRestore({ ...configuration, gatewayUrl: 'http://localhost:3179' }, baseline, command))
      .rejects.toMatchObject({ code: 'formance_restore_source_target_same' })
    await expect(verifyFormanceRestore(target, { ...baseline, summary: { ...baseline.summary, counts: { ...baseline.summary.counts, transactions: -1 } } }, command))
      .rejects.toMatchObject({ code: 'formance_restore_baseline_invalid' })
    await expect(verifyFormanceRestore({ ...target, ledger: 'other-ledger' }, baseline, command))
      .rejects.toMatchObject({ code: 'formance_restore_ledger_mismatch' })
    await expect(verifyFormanceRestore(target, baseline, { ...command, variables: { ...command.variables, principal_amount: 'AUD/6 101' } }))
      .rejects.toMatchObject({ code: 'formance_restore_original_command_mismatch' })
    await expect(captureFormanceRestoreBaseline({ ...configuration, gatewayUrl: 'https://formance.example' }, command))
      .rejects.toMatchObject({ code: 'formance_restore_gateway_invalid' })
    expect(fetch).not.toHaveBeenCalled()
  })

  it('requires the exact saved backup boundary and leaves baseline bytes intact on CLI failure', async () => {
    const path = await mkdtemp(join(tmpdir(), 'ae-restore-cli-'))
    directories.push(path)
    const baselineFile = join(path, 'baseline.json')
    const commandFile = join(path, 'command.json')
    const bytes = JSON.stringify(baseline)
    await Promise.all([writeFile(baselineFile, bytes), writeFile(commandFile, JSON.stringify(command))])
    const fetch = vi.fn(() => { throw new Error('unexpected outbound request') })
    vi.stubGlobal('fetch', fetch)
    await expect(main(['verify', '--gateway', target.gatewayUrl, '--baseline', baselineFile,
      '--command-file', commandFile, '--restore-time', '2026-10-01T01:02:04.000Z']))
      .rejects.toMatchObject({ code: 'formance_restore_backup_boundary_mismatch' })
    expect(await readFile(baselineFile, 'utf8')).toBe(bytes)
    await writeFile(commandFile, ' '.repeat(32_769))
    await expect(main(['verify', '--gateway', target.gatewayUrl, '--baseline', baselineFile,
      '--command-file', commandFile, '--restore-time', baseline.restoreTime]))
      .rejects.toMatchObject({ code: 'formance_restore_file_too_large' })
    expect(fetch).not.toHaveBeenCalled()
  })
})
