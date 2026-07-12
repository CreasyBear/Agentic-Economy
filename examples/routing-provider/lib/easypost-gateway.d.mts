import type { FetchLike, ProviderGateway } from './provider-gateway-types.d.mts'

export function createEasyPostGateway(input: {
  fetchImpl: FetchLike; apiKey: string; signingKey: string; carrierAccountId: string
  service?: string; shipmentTemplate: Record<string, unknown>; now?: () => number
}): ProviderGateway
