import type { AgentAccessKeyInventoryItem } from '../agent-access'
import type { AgentCredentialSource } from '../agent-operator-view-model'
import type { AgentAccessOwnerGrantReadback } from '../policy'

/** Only verified current grants can contribute credential source material. */
export function readAgentCredentialSources(
  keys: readonly AgentAccessKeyInventoryItem[],
  grants: readonly AgentAccessOwnerGrantReadback[] = [],
): readonly AgentCredentialSource[] {
  const grantsByCredential = new Map(grants.map((grant) => [grant.credentialId, grant]))
  const sources: AgentCredentialSource[] = []
  for (const key of keys) {
    const grant = grantsByCredential.get(key.keyId)
    if (grant !== undefined) {
      sources.push({ key, grant, principalId: grant.principalId, activity: [], dataState: 'source' })
    }
  }
  return sources
}
