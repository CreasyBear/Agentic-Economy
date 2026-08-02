import { mkdtemp, readFile, rm, writeFile as fsWriteFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import {
  assertWorkTreeParityReadbackUnchanged,
  sanitizeWorkTreeParityEvidence,
  WORK_TREE_PARITY_EVIDENCE_CLASS,
  workTreeParityCredentialSecrets,
  writeWorkTreeParityEvidencePacket,
} from '../../../tools/release/work-tree-parity-evidence'

describe('WorkTree parity trace evidence safety', () => {
  it('disables automatic Playwright trace and screenshot retention for T51', async () => {
    const source = await readFile(join(process.cwd(), 'tests/deploy-smoke/work-tree-parity-release-proof.spec.ts'), 'utf8')
    expect(source).toContain("test.use({ trace: 'off', screenshot: 'off' })")
    expect(source).not.toContain('fullPage: true')
  })
  it('behaviorally filters generated credentials and refuses changed refusal readbacks', () => {
    const humanSessionToken = 'human-session-token'
    const agentApiKey = 'agent-api-key'
    expect(workTreeParityCredentialSecrets(['setup-token', humanSessionToken, agentApiKey, '', undefined]))
      .toEqual(['setup-token', humanSessionToken, agentApiKey])
    expect(sanitizeWorkTreeParityEvidence(
      { neutralSession: humanSessionToken, neutralKey: agentApiKey },
      workTreeParityCredentialSecrets(['setup-token', humanSessionToken, agentApiKey]),
    )).toEqual({ neutralSession: '[REDACTED]', neutralKey: '[REDACTED]' })
    expect(() => assertWorkTreeParityReadbackUnchanged(
      { revision: 3, tree: { nodes: [{ nodeId: 'node:one', status: 'ready' }] } },
      { revision: 3, tree: { nodes: [{ nodeId: 'node:one', status: 'ready' }] } },
    )).not.toThrow()
    expect(() => assertWorkTreeParityReadbackUnchanged(
      { revision: 4, tree: { nodes: [{ nodeId: 'node:one', status: 'ready' }] } },
      { revision: 3, tree: { nodes: [{ nodeId: 'node:one', status: 'ready' }] } },
    )).toThrow('work_tree_refusal_mutated_state')
    expect(() => assertWorkTreeParityReadbackUnchanged(
      { revision: 3, tree: { nodes: [{ nodeId: 'node:one', status: 'locked' }] } },
      { revision: 3, tree: { nodes: [{ nodeId: 'node:one', status: 'ready' }] } },
    )).toThrow('work_tree_refusal_mutated_state')
  })
  it.each([
    ['credentials', 'https://user:pass@happy-animal-123.convex.cloud'],
    ['path', 'https://happy-animal-123.convex.cloud/path-token'],
    ['query', 'https://happy-animal-123.convex.cloud/?token=redacted'],
    ['fragment', 'https://happy-animal-123.convex.cloud/#redacted'],
  ] as const)('rejects Convex metadata URL with %s before writing', async (_label, convexUrl) => {
    const directory = await mkdtemp(join(tmpdir(), 'ae-work-tree-parity-metadata-'))
    try {
      const writeFileImpl = vi.fn<typeof fsWriteFile>()
      await expect(writeWorkTreeParityEvidencePacket({
        directory,
        metadata: {
          sourceRevision: 'a'.repeat(40),
          vercelDeploymentId: 'dpl_preview_123',
          convexDeploymentId: 'happy-animal-123',
          convexUrl,
          evidenceClass: WORK_TREE_PARITY_EVIDENCE_CLASS,
        },
        setup: { cohort: 'bas-development' },
        human: { receiptId: 'decision:human' },
        agent: { receiptId: 'decision:agent' },
        refusals: [],
        writeFileImpl,
      })).rejects.toThrow('work_tree_parity_convex_url_invalid')
      expect(writeFileImpl).not.toHaveBeenCalled()
      await expect(readFile(join(directory, 'work-tree-parity-evidence.json'))).rejects.toThrow()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
  it('omits a raw trace artifact even when no credential list is supplied', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ae-work-tree-parity-trace-'))
    try {
      const traceArtifact = '/tmp/work-tree-parity.trace.zip'
      const packetPath = await writeWorkTreeParityEvidencePacket({
        directory,
        metadata: {
          sourceRevision: 'a'.repeat(40),
          vercelDeploymentId: 'dpl_preview_123',
          convexDeploymentId: 'happy-animal-123',
          convexUrl: 'https://HAPPY-ANIMAL-123.CONVEX.CLOUD',
          evidenceClass: WORK_TREE_PARITY_EVIDENCE_CLASS,
        },
        setup: { cohort: 'bas-development' },
        human: { receiptId: 'decision:human' },
        agent: { receiptId: 'decision:agent' },
        refusals: [],
        trace: { label: WORK_TREE_PARITY_EVIDENCE_CLASS, artifact: traceArtifact },
        screenshots: [
          { label: 'receipt', artifact: '/tmp/receipt.png' },
          { label: 'reload readback', artifact: '/tmp/reload-receipt.png' },
        ],
      })

      const packet = JSON.parse(await readFile(packetPath, 'utf8')) as Record<string, unknown>
      expect(packet.convexUrl).toBe('https://happy-animal-123.convex.cloud/')
      expect(packet.trace).toBeUndefined()
      expect(JSON.stringify(packet)).not.toContain(traceArtifact)
      expect(packet.screenshots).toEqual([
        { label: 'receipt', artifact: '/tmp/receipt.png' },
        { label: 'reload readback', artifact: '/tmp/reload-receipt.png' },
      ])
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('redacts generated session and agent credentials in neutral JSON fields', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ae-work-tree-parity-credentials-'))
    try {
      const humanSessionToken = 'human-session-token'
      const agentApiKey = 'agent-api-key'
      const packetPath = await writeWorkTreeParityEvidencePacket({
        directory,
        metadata: {
          sourceRevision: 'a'.repeat(40),
          vercelDeploymentId: 'dpl_preview_123',
          convexDeploymentId: 'happy-animal-123',
          evidenceClass: WORK_TREE_PARITY_EVIDENCE_CLASS,
        },
        setup: { cohort: 'bas-development' },
        human: { receiptId: 'decision:human', neutralSession: humanSessionToken },
        agent: { receiptId: 'decision:agent', neutralKey: agentApiKey },
        refusals: [],
        screenshots: [{
          label: `receipt-${humanSessionToken}`,
          artifact: `/tmp/${agentApiKey}.png`,
        }],
        secrets: [humanSessionToken, agentApiKey],
      })

      const packet = JSON.parse(await readFile(packetPath, 'utf8')) as Record<string, unknown>
      expect(packet.human).toMatchObject({ neutralSession: '[REDACTED]' })
      expect(packet.agent).toMatchObject({ neutralKey: '[REDACTED]' })
      expect(packet.screenshots).toEqual([{ label: '[REDACTED]', artifact: '[REDACTED]' }])
      expect(JSON.stringify(packet)).not.toContain(humanSessionToken)
      expect(JSON.stringify(packet)).not.toContain(agentApiKey)
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
  it('redacts Clerk agent-key prefixes even when explicit secret input is omitted', () => {
    expect(sanitizeWorkTreeParityEvidence({
      apiKey: 'ak_hosted_t51_key',
      nested: ['ak_hosted_t51_key'],
    })).toEqual({
      apiKey: '[REDACTED]',
      nested: ['[REDACTED]'],
    })
  })

  it('rejects evidence that exceeds the bounded JSON ceiling', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ae-work-tree-parity-size-'))
    try {
      const writeFileImpl = vi.fn<typeof fsWriteFile>()
      await expect(writeWorkTreeParityEvidencePacket({
        directory,
        metadata: {
          sourceRevision: 'a'.repeat(40),
          vercelDeploymentId: 'dpl_preview_123',
          convexDeploymentId: 'happy-animal-123',
          evidenceClass: WORK_TREE_PARITY_EVIDENCE_CLASS,
        },
        setup: { cohort: 'bas-development' },
        human: { neutralField: 'x'.repeat(300_000) },
        agent: { receiptId: 'decision:agent' },
        refusals: [],
        writeFileImpl,
      })).rejects.toThrow('work_tree_parity_evidence_too_large')
      expect(writeFileImpl).not.toHaveBeenCalled()
      await expect(readFile(join(directory, 'work-tree-parity-evidence.json'))).rejects.toThrow()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
  it('rejects sanitizer depth overflow before mkdir or write', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ae-work-tree-parity-depth-'))
    try {
      let deep: unknown = 'leaf'
      for (let index = 0; index < 70; index += 1) deep = { nested: deep }
      const writeFileImpl = vi.fn<typeof fsWriteFile>()
      await expect(writeWorkTreeParityEvidencePacket({
        directory,
        metadata: {
          sourceRevision: 'a'.repeat(40),
          vercelDeploymentId: 'dpl_preview_123',
          convexDeploymentId: 'happy-animal-123',
          evidenceClass: WORK_TREE_PARITY_EVIDENCE_CLASS,
        },
        setup: { cohort: 'bas-development' },
        human: deep,
        agent: { receiptId: 'decision:agent' },
        refusals: [],
        writeFileImpl,
      })).rejects.toThrow('work_tree_parity_evidence_limit_exceeded')
      expect(writeFileImpl).not.toHaveBeenCalled()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })

  it('rejects one packet-wide sanitizer node budget before mkdir or write', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'ae-work-tree-parity-nodes-'))
    try {
      const chunk = Array.from({ length: 3_000 }, (_, index) => index)
      const writeFileImpl = vi.fn<typeof fsWriteFile>()
      await expect(writeWorkTreeParityEvidencePacket({
        directory,
        metadata: {
          sourceRevision: 'a'.repeat(40),
          vercelDeploymentId: 'dpl_preview_123',
          convexDeploymentId: 'happy-animal-123',
          evidenceClass: WORK_TREE_PARITY_EVIDENCE_CLASS,
        },
        setup: chunk,
        human: chunk,
        agent: chunk,
        refusals: chunk,
        writeFileImpl,
      })).rejects.toThrow('work_tree_parity_evidence_limit_exceeded')
      expect(writeFileImpl).not.toHaveBeenCalled()
    } finally {
      await rm(directory, { recursive: true, force: true })
    }
  })
})
