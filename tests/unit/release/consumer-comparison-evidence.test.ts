import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  createConsumerComparisonEvidence,
  writeConsumerComparisonEvidenceOnce,
  type ConsumerComparisonEvidenceInput,
} from '../../../tools/release/consumer-comparison-evidence'
import {
  checksumConsumerComparisonEvidence,
  verifyConsumerComparisonEvidence,
} from '../../../tools/release/verify-consumer-comparison-evidence'

const revision = 'a'.repeat(40)
const tree = 'b'.repeat(40)
const baseUrl = 'https://agentic-economy.example'
const profiles = ['professional_service:v1', 'professional_service:v1', 'machine_data:v1', 'machine_data:v1'] as const

function comparisonUrl(index: number): string {
  const params = new URLSearchParams()
  params.append('selection', JSON.stringify({
    businessId: `business:${index}`,
    offeringRef: `offering:${index}`,
    offeringRevision: index + 1,
    projectionObservedAt: 1_784_805_000_000 + index,
  }))
  return `${baseUrl}/compare?${params.toString()}`
}

function fixtureFiles(): Readonly<{
  directory: string
  human: string
  structured: string
  zeroEffect: string
  screenshot: string
}> {
  const directory = mkdtempSync(join(tmpdir(), 'ae-consumer-evidence-'))
  const human = join(directory, 'human.json')
  const structured = join(directory, 'structured.json')
  const zeroEffect = join(directory, 'zero-effect.json')
  const screenshot = join(directory, 'comparison.png')
  const result = { kind: 'comparison', semanticDigest: `sha256:${'c'.repeat(64)}`, posture: 'unranked' }
  writeFileSync(human, JSON.stringify(result))
  writeFileSync(structured, JSON.stringify(result))
  writeFileSync(zeroEffect, JSON.stringify({
    schemaVersion: 'ae.consumer-comparison-zero-effect:v1',
    observer: 'playwright:consumer-comparison-network-observation:v1',
    allowedRequests: ['GET /registry', 'GET /compare', 'POST /api/compare'],
    effectfulRequests: [],
    observedAt: '2026-07-23T12:00:00.000Z',
  }))
  writeFileSync(screenshot, Buffer.from('labelled screenshot bytes'))
  return { directory, human, structured, zeroEffect, screenshot }
}

function validInput(files = fixtureFiles()): ConsumerComparisonEvidenceInput {
  return {
    source: { cwd: files.directory, expectedRevision: revision, expectedTree: tree },
    deployment: {
      baseUrl,
      expectedDeploymentId: 'dpl_phase05',
      smokeAuth: 'secret-never-persisted',
    },
    data: {
      label: 'labelled_demo',
      seedVersion: 'phase-05-demo:v1',
      selections: profiles.map((profileVersion, index) => ({
        businessId: `business:${index}`,
        offeringRef: `offering:${index}`,
        revision: index + 1,
        profileVersion,
        dataLabel: 'labelled_demo' as const,
        canonicalUrl: comparisonUrl(index),
      })),
    },
    artifacts: {
      humanLoaderResponse: files.human,
      structuredPostResponse: files.structured,
      zeroEffectObservation: files.zeroEffect,
      screenshots: [{ state: 'unranked', path: files.screenshot }],
    },
    commands: [
      'npm exec -- vitest run phase-05-focused-matrix',
      'npm exec -- playwright test phase-05-browser-matrix',
      'npm run test:copy',
      'npm run test:seo',
      'npm run test:imports',
      'npm run check:convex-codegen',
      'npm run typecheck',
      'npm run build',
      'git clean-tree-check',
    ],
    firstFailures: [],
  }
}

const dependencies = {
  inspectRepository: () => ({ revision, tree, clean: true }),
  authenticateDeployment: async () => ({
    deploymentId: 'dpl_phase05',
    servedRevision: revision,
  }),
}

describe('consumer comparison release evidence', () => {
  it.each([
    ['HTTP', 'http://agentic-economy.example'],
    ['localhost', 'https://localhost'],
    ['loopback', 'https://127.0.0.1'],
    ['private address', 'https://192.168.1.4'],
    ['userinfo', 'https://user:pass@agentic-economy.example'],
  ])('refuses %s release origins', async (_case, unsafeUrl) => {
    const input = validInput()
    await expect(createConsumerComparisonEvidence({
      ...input,
      deployment: { ...input.deployment, baseUrl: unsafeUrl },
    }, dependencies)).rejects.toThrow('hosted_https_public_origin_required')
  })

  it('requires exact local git state and provider-authenticated deployment identity', async () => {
    const input = validInput()
    await expect(createConsumerComparisonEvidence(input, {
      ...dependencies,
      inspectRepository: () => ({ revision: 'c'.repeat(40), tree, clean: true }),
    })).rejects.toThrow('repository_revision_mismatch')
    await expect(createConsumerComparisonEvidence(input, {
      ...dependencies,
      inspectRepository: () => ({ revision, tree: 'd'.repeat(40), clean: true }),
    })).rejects.toThrow('repository_tree_mismatch')
    await expect(createConsumerComparisonEvidence(input, {
      ...dependencies,
      inspectRepository: () => ({ revision, tree, clean: false }),
    })).rejects.toThrow('repository_not_clean')
    await expect(createConsumerComparisonEvidence(input, {
      ...dependencies,
      authenticateDeployment: async () => ({ deploymentId: 'dpl_other', servedRevision: revision }),
    })).rejects.toThrow('deployment_id_mismatch')
    await expect(createConsumerComparisonEvidence(input, {
      ...dependencies,
      authenticateDeployment: async () => ({ deploymentId: 'dpl_phase05', servedRevision: 'e'.repeat(40) }),
    })).rejects.toThrow('served_revision_mismatch')
  })

  it.each([
    ['unlabelled data', (input: ConsumerComparisonEvidenceInput) => {
      input.data.label = 'production' as 'labelled_demo'
    }],
    ['too few selections', (input: ConsumerComparisonEvidenceInput) => {
      input.data.selections.pop()
    }],
    ['tuple profile mismatch', (input: ConsumerComparisonEvidenceInput) => {
      input.data.selections[0]!.profileVersion = 'machine_data:v1'
    }],
    ['tuple URL mismatch', (input: ConsumerComparisonEvidenceInput) => {
      input.data.selections[0]!.canonicalUrl = comparisonUrl(1)
    }],
    ['missing mandatory command', (input: ConsumerComparisonEvidenceInput) => {
      input.commands = input.commands.filter((command) => command !== 'npm run typecheck')
    }],
  ])('refuses %s', async (_case, mutate) => {
    const input = structuredClone(validInput())
    mutate(input)
    await expect(createConsumerComparisonEvidence(input, dependencies)).rejects.toThrow()
  })

  it('freezes referenced public artifacts without persisting auth or raw payloads', async () => {
    const input = validInput()
    const packet = await createConsumerComparisonEvidence(input, dependencies)

    expect(packet.deployment).toEqual({
      baseUrl,
      deploymentId: 'dpl_phase05',
      servedRevision: revision,
      identitySource: 'provider_authenticated_release_readback',
    })
    expect(packet.artifacts.humanLoaderResponse.digest).toBe(packet.artifacts.structuredPostResponse.digest)
    expect(verifyConsumerComparisonEvidence(packet, { revision, tree })).toEqual({ ok: true, errors: [] })

    const serialized = JSON.stringify(packet)
    expect(serialized).not.toContain(input.deployment.smokeAuth)
    expect(serialized).not.toContain('humanLoaderResponse":{')
    expect(serialized).not.toMatch(/authorization|credential|customerText|sourceHash|privateProjection|providerEffect/iu)
  })

  it('independently detects artifact, tuple, profile, zero-effect and semantic tampering', async () => {
    const input = validInput()
    const packet = await createConsumerComparisonEvidence(input, dependencies)

    writeFileSync(packet.artifacts.humanLoaderResponse.path, '{"changed":true}')
    expect(verifyConsumerComparisonEvidence(packet, { revision, tree }).errors).toContain('artifact_digest_mismatch')

    const cases = [
      (candidate: typeof packet) => { candidate.data.selections[0]!.revision = 99 },
      (candidate: typeof packet) => { candidate.data.selections[0]!.profileVersion = 'machine_data:v1' },
      (candidate: typeof packet) => { candidate.data.selections[0]!.canonicalUrl = comparisonUrl(1) },
      (candidate: typeof packet) => { candidate.artifacts.zeroEffectObservation.digest = `sha256:${'e'.repeat(64)}` },
    ]
    for (const mutate of cases) {
      const candidate = structuredClone(packet)
      mutate(candidate)
      candidate.packetChecksum = checksumConsumerComparisonEvidence(candidate)
      expect(verifyConsumerComparisonEvidence(candidate, { revision, tree }).ok).toBe(false)
    }
  })

  it('rejects nested secret/private fields and self-attested provider effects', async () => {
    for (const nested of [
      { authToken: 'secret' },
      { customerText: 'find me a developer' },
      { nested: { credentials: { apiKey: 'secret' } } },
      { nested: [{ privateProjection: { ownerId: 'owner:1' } }] },
      { providerEffects: [{ claimed: 'settled' }] },
    ]) {
      const input = validInput() as ConsumerComparisonEvidenceInput & Record<string, unknown>
      input.unowned = nested
      await expect(createConsumerComparisonEvidence(input, dependencies))
        .rejects.toThrow('sensitive_or_unowned_material')
    }
  })

  it('writes the frozen packet once and refuses replacement', async () => {
    const input = validInput()
    const packet = await createConsumerComparisonEvidence(input, dependencies)
    const output = join(input.source.cwd, 'manifest.json')
    writeConsumerComparisonEvidenceOnce(output, packet)
    expect(JSON.parse(readFileSync(output, 'utf8'))).toEqual(packet)
    expect(() => writeConsumerComparisonEvidenceOnce(output, packet)).toThrow('evidence_manifest_already_exists')
  })
})
