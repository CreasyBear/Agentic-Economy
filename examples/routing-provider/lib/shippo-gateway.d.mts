import type { FetchLike, ProviderGateway } from './provider-gateway-types.d.mts'

export function createShippoGateway(input: {
  fetchImpl: FetchLike; token: string; signingKey: string; carrierAccountId: string
  serviceLevelToken?: string; shipmentTemplate: Record<string, unknown>; apiVersion?: string
  now?: () => number
}): ProviderGateway
