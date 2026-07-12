export type ProviderObservation = Readonly<{
  schemaVersion: 'ae-provider-observation:v1'
  provider: 'shippo' | 'easypost' | 'unknown'
  operation: 'quote' | 'execute' | 'reconcile' | 'unknown'
  resultKind: string
  retryDisposition?: 'reconcile_only' | 'read_again_later'
  rootRunRef?: string
  leafRunRef?: string
  stepGrantRef?: string
  idempotencyRef?: string
}>

export function createLiveCapabilityHandler(
  createGateway: (configuration: Readonly<Record<string, unknown>> & { fetchImpl: FetchLike }) => ProviderGateway,
  loadConfiguration: (env: Readonly<Record<string, string | undefined>>) => Readonly<{
    provider: 'shippo' | 'easypost'
    providerToken: string
    observabilityKey: string
  }> & Readonly<Record<string, unknown>>,
): (request: unknown, response: unknown) => Promise<unknown>

export function providerOperationObservation(
  provider: unknown,
  operation: unknown,
  body: Readonly<Record<string, unknown>>,
  result: Readonly<Record<string, unknown>>,
  idempotencyKey?: string,
  observabilityKey?: string,
): ProviderObservation

export function requiredText(env: Readonly<Record<string, string | undefined>>, name: string): string
export function requiredJson(env: Readonly<Record<string, string | undefined>>, name: string): Readonly<Record<string, unknown>>
import type { FetchLike, ProviderGateway } from './provider-gateway-types.d.mts'
