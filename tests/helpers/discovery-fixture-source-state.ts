import type {
  DiscoveryManifestAdapter,
  DiscoveryManifestContract,
  DiscoverySourceState,
} from '@/modules/discovery/public'
import { createDefaultRegistrySourceState } from '@/modules/registry/public'

export function createFixtureDiscoverySourceState(): DiscoverySourceState {
  return {
    ...createDefaultRegistrySourceState(),
    discoveryManifests: [],
    invalidationIntents: [],
  }
}

export const testOnlyDiscoveryManifestAdapter: DiscoveryManifestAdapter = {
  readManifest(manifest: DiscoveryManifestContract) {
    const hasCompleteHashes =
      manifest.generatedHash.length > 0
      && manifest.bodyHash.length > 0
      && manifest.urlHash.length > 0
    const hasTestedRoutes = manifest.routes.every((route) => route.routeTested)

    return hasCompleteHashes && hasTestedRoutes
      ? { kind: 'ok' }
      : {
          kind: 'error',
          code: 'test_discovery_manifest_readback_invalid',
          redactedMessage: 'Generated discovery manifest failed the test-only readback check.',
        }
  },
}
