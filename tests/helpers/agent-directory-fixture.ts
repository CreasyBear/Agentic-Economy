import type { CanonicalAgentDirectoryRecord } from '@/modules/agent-access/agent-access-console'
import type { AgentCredentialSource } from '@/modules/agent-access/agent-operator-view-model'

export function canonicalAgentRecord(
  sources: readonly [AgentCredentialSource, ...AgentCredentialSource[]],
): CanonicalAgentDirectoryRecord {
  const ordered = [...sources].toSorted((left, right) => (
    (left.key.createdAt ?? 0) - (right.key.createdAt ?? 0)
  ))
  const current = ordered.at(-1)!
  return {
    principalRef: current.principalId,
    principalRevision: 1,
    displayName: current.key.name,
    applicationRef: current.key.applicationRef,
    environment: current.key.environment,
    currentProviderCredentialId: current.key.keyId,
    lastSeenAt: current.key.createdAt ?? 0,
    status: 'connected',
    admissionLifecycle: 'active',
    authorityMode: current.key.authorityMode,
    scopes: current.key.scopes,
    credentialHistoryTruncated: false,
    credentials: ordered.map((source, index) => ({
      credentialRef: `credential:${source.key.keyId}`,
      providerCredentialId: source.key.keyId,
      generation: index + 1,
      lifecycle: source === current ? 'active' : 'stale',
      ...(index === 0 ? {} : { predecessorCredentialRef: `credential:${ordered[index - 1]!.key.keyId}` }),
      issuedAt: source.key.createdAt ?? 0,
      expiresAt: source.key.expiresAt ?? 0,
    })),
  }
}
