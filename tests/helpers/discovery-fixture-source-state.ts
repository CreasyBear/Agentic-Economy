import type { DiscoverySourceState } from '@/modules/discovery/public'
import { createDefaultPublicRegistryFixtureState } from './registry-local-e2e'

export function createFixtureDiscoverySourceState(): DiscoverySourceState {
  return {
    ...createDefaultPublicRegistryFixtureState(),
    invalidationIntents: [],
  }
}
