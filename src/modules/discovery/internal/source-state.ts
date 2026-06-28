import type { DiscoverySourceState } from '@/modules/discovery/public'
import { createDefaultRegistrySourceState } from '@/modules/registry/public'

export function createDefaultDiscoverySourceState(): DiscoverySourceState {
  return {
    ...createDefaultRegistrySourceState(),
    discoveryManifests: [],
    invalidationIntents: [],
  }
}
