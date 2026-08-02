import { createEmptyBusinessSourceState } from '@/modules/business/public'
import type { BusinessSuppressionState } from '@/modules/business/public'
import { createEmptyCatalogSourceState } from '@/modules/catalog/public'
import type { PublishBusinessCatalogState } from '@/modules/catalog/public'
import type { DiscoverySourceState } from '@/modules/discovery/public'
import type { RegistrySourceState } from '@/modules/registry/public'

/**
 * The union of fields used by the source-state fixtures. Each wrapper below
 * removes fields its surface does not own.
 */
type EmptySourceState = DiscoverySourceState

type EmptyCatalogPublishSourceState = PublishBusinessCatalogState & BusinessSuppressionState
type EmptyRegistryProjectionSourceState =
  PublishBusinessCatalogState & BusinessSuppressionState & RegistrySourceState

function createEmptySourceState(): EmptySourceState {
  return {
    ...createEmptyBusinessSourceState(),
    ...createEmptyCatalogSourceState(),
    operationKeys: [],
    auditEvents: [],
    registryProjectionItems: [],
    registryProjectionAttempts: [],
    discoveryManifestAttempts: [],
    indexStatus: [],
    suppressionRules: [],
    discoveryManifests: [],
    invalidationIntents: [],
  }
}

export function emptyDiscoverySourceState(): DiscoverySourceState {
  return createEmptySourceState()
}

export function emptyCatalogPublishSourceState(): EmptyCatalogPublishSourceState {
  const {
    registryProjectionItems: _registryProjectionItems,
    indexStatus: _indexStatus,
    discoveryManifests: _discoveryManifests,
    ...state
  } = createEmptySourceState()
  return state
}

export function emptyRegistrySourceState(): RegistrySourceState {
  const {
    discoveryManifests: _discoveryManifests,
    invalidationIntents: _invalidationIntents,
    ...state
  } = createEmptySourceState()
  return state
}

export function emptyRegistryProjectionSourceState(): EmptyRegistryProjectionSourceState {
  const { discoveryManifests: _discoveryManifests, ...state } = createEmptySourceState()
  return state
}
