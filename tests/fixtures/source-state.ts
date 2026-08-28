import type { DiscoverySourceState } from '@/modules/discovery/public'
import type { RegistrySourceState } from '@/modules/registry/public'

/**
 * The union of fields used by the source-state fixtures. Each wrapper below
 * removes fields its surface does not own.
 */
type EmptySourceState = DiscoverySourceState

type EmptyRegistryProjectionSourceState = RegistrySourceState

function createEmptySourceState(): EmptySourceState {
  return {
    businesses: [],
    businessContexts: [],
    offerings: [],
    revisions: [],
    accessPaths: [],
    operationKeys: [],
    auditEvents: [],
    registryProjectionItems: [],
    registryProjectionAttempts: [],
    indexStatus: [],
    invalidationIntents: [],
  }
}

export function emptyDiscoverySourceState(): DiscoverySourceState {
  return createEmptySourceState()
}

export function emptyRegistrySourceState(): RegistrySourceState {
  const { invalidationIntents: _invalidationIntents, ...state } = createEmptySourceState()
  return state
}

export function emptyRegistryProjectionSourceState(): EmptyRegistryProjectionSourceState {
  return emptyRegistrySourceState()
}
