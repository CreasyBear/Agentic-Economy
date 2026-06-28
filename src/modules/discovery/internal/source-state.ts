import type { DiscoverySourceState } from '@/modules/discovery/public'
import { createDefaultRegistrySourceState } from '@/modules/registry/public'

export function createFixtureDiscoverySourceState(): DiscoverySourceState {
  return {
    ...createDefaultRegistrySourceState(),
    discoveryManifests: [],
    invalidationIntents: [],
  }
}
