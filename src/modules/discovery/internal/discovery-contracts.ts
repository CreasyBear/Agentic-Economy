import type { InvalidationIntent } from '@/modules/observability/public'
import type { RegistrySourceState } from '@/modules/registry/public'

export type DiscoverySourceState = RegistrySourceState & {
  invalidationIntents: InvalidationIntent[]
}

export type BuildDiscoveryFileOptions = {
  canonicalBaseUrl: string
  routingBaseUrl?: string
  now?: number
  availabilityStatement?: string
}

export type DiscoveryFileBuildResult = {
  body: string
  urls: readonly string[]
}
