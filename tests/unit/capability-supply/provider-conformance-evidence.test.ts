import { access, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import { execFileSync } from 'node:child_process'

import { afterAll, describe, expect, it } from 'vitest'
import { canonicalDigest } from '@/modules/common/canonical-digest'

import { writePhase3bProviderConformanceEvidence } from '../../../tools/dev/phase-3b-provider-conformance-evidence'
import { verifyPhase3bProviderConformanceEvidence } from '../../../tools/dev/verify-phase-3b-provider-conformance-evidence'

const artifacts: string[] = []

async function tempPath(name: string) {
  const directory = await mkdtemp(join(tmpdir(), 'phase3b-evidence-test-'))
  artifacts.push(directory)
  return join(directory, name)
}

afterAll(async () => {
  const trash = join(
    homedir(),
    '.Trash',
    `phase3b-evidence-test-${process.pid}-${Date.now()}`,
  )
  await rename(artifacts[0]!, trash)
  for (let index = 1; index < artifacts.length; index += 1) {
    await rename(artifacts[index]!, `${trash}-${index}`)
  }
})

describe('Phase 3B provider conformance evidence', () => {
  it('RED: refuses an advertised effect counter without recomputation', async () => {
    const path = await tempPath('permissive.json')
    await writeFile(path, JSON.stringify({ providers: { A: { effectCounters: { sends: 99 } } } }))
    await expect(verifyPhase3bProviderConformanceEvidence(path, 'HEAD')).rejects.toThrow()
  })

  it('builds and independently verifies a working-tree packet', async () => {
    const path = await tempPath('packet.json')
    const packet = await writePhase3bProviderConformanceEvidence(path, 'HEAD')
    expect(packet.provenance.evidenceClass).toBe('working_tree_demonstration')
    await expect(verifyPhase3bProviderConformanceEvidence(path, 'HEAD')).resolves.toBeUndefined()
    expect(packet.providers.A.fixedUsdAmount).toEqual({
      currency: 'USD',
      units: '1',
      exponent: 2,
    })
    expect(packet.providers.A.x402).toEqual({
      scheme: 'exact',
      network: 'eip155:8453',
      asset: '0xmock-usdc',
      payee: '0xmock-provider-recipient',
    })
    expect(packet.providers.B.fixedUsdAmount).toEqual({
      currency: 'USD',
      units: '1',
      exponent: 2,
    })
    expect(packet.providers.B.x402).toEqual({
      scheme: 'exact',
      network: 'eip155:8453',
      asset: '0xmock-usdc',
      payee: '0xmock-alternate-recipient',
    })
    const { checksum, ...packetMaterial } = packet
    expect(checksum).toBe(canonicalDigest(packetMaterial))
  })

  it.each([
    ['provider identity', (packet: any) => { packet.providers.A.businessId = 'tampered' }],
    ['raw evidence', (packet: any) => { packet.providers.B.rawPayload.spot.amount = '1' }],
    ['schema', (packet: any) => { packet.shared.schemaIdentity = 'sha256:tampered' }],
    ['effect counter', (packet: any) => { packet.providers.A.effectCounters.sends = 99 }],
    ['switch identity', (packet: any) => { packet.switches.B.paymentIdentifier = packet.switches.A.paymentIdentifier }],
    ['refusal disposition', (packet: any) => { packet.dispositions.commands[0].outcome.code = 'accepted' }],
    ['provenance', (packet: any) => { packet.provenance.sourceTree = '0'.repeat(40) }],
    ['checksum', (packet: any) => { packet.checksum = 'sha256:' + '0'.repeat(64) }],
  ])('rejects tampered %s', async (_label, tamper) => {
    const path = await tempPath('packet.json')
    await writePhase3bProviderConformanceEvidence(path, 'HEAD')
    const packet = JSON.parse(await readFile(path, 'utf8'))
    tamper(packet)
    await writeFile(path, JSON.stringify(packet))
    await expect(verifyPhase3bProviderConformanceEvidence(path, 'HEAD')).rejects.toThrow()
  })

  it('refuses exact-revision generation from a dirty checkout', async () => {
    const path = await tempPath('packet.json')
    const revision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
    const marker = join(
      process.cwd(),
      `.phase3b-evidence-dirty-marker-${process.pid}-${Date.now()}`,
    )
    await writeFile(marker, 'test-owned dirty checkout marker\n', { flag: 'wx' })
    try {
      await expect(writePhase3bProviderConformanceEvidence(path, revision))
        .rejects.toThrow('evidence_checkout_dirty')
    } finally {
      const trash = await mkdtemp(join(homedir(), '.Trash', 'phase3b-evidence-dirty-test-'))
      await rename(marker, join(trash, basename(marker)))
    }
    await expect(access(marker)).rejects.toThrow()
  })
})
