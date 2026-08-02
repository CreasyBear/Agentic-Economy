import {
  CUSTOMER_REQUEST_AGENT_SCOPE,
  customerRequestAgentResultSchema,
} from '../agent-contract'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import type { HostedCustomerRequestJourneyInput, JourneyDiscovery } from './types'
import { headers } from './runtime'

export async function proveDiscovery(input: HostedCustomerRequestJourneyInput): Promise<JourneyDiscovery> {
  const baseUrl = trimTrailingSlashes(input.baseUrl)
  const home = await fetchDiscoveryText(input, new URL('/', baseUrl))
  const assistantIndex = discoverHomeAssistantIndex(home, baseUrl)
  const llms = await fetchDiscoveryText(input, assistantIndex)
  const assistantSkill = discoverAssistantSetup(llms, baseUrl)
  const skill = await fetchDiscoveryText(input, assistantSkill)
  const requestEntrypoint = discoverRequestEntrypoint(llms, baseUrl)
  const discovery = `${llms}\n${skill}`
  for (const marker of [
    '/api/v1/requests',
    CUSTOMER_REQUEST_AGENT_SCOPE,
    'navigation.actions',
    'routes_ready',
    'route_confirmed',
  ]) {
    if (!discovery.includes(marker)) throw new Error(`hosted_journey_discovery_missing:${marker}`)
  }
  return {
    state: 'verified',
    paths: ['/', assistantIndex.pathname, assistantSkill.pathname],
    requestOperation: { method: 'POST', path: requestEntrypoint.pathname },
  }
}

export async function fetchDiscoveryText(input: HostedCustomerRequestJourneyInput, url: URL): Promise<string> {
  const response = await (input.fetch ?? fetch)(url, { headers: headers(input) })
  if (!response.ok) {
    throw new Error(`hosted_journey_discovery_unavailable:${url.pathname}:${response.status}`)
  }
  return await response.text()
}

export function discoverHomeAssistantIndex(html: string, baseUrl: string): URL {
  const link = /<a\b[^>]*\bhref=(?:"([^"]+)"|'([^']+)')[^>]*>\s*Assistants\s*<\/a>/iu.exec(html)
  return exactSameOriginDiscoveryUrl(link?.[1] ?? link?.[2], baseUrl, 'assistant_index')
}

export function discoverAssistantSetup(llms: string, baseUrl: string): URL {
  const section = /(?:^|\n)Assistant setup:\s*\n-\s*(https?:\/\/[^\s]+)/iu.exec(llms)
  return exactSameOriginDiscoveryUrl(section?.[1], baseUrl, 'assistant_setup')
}

export function discoverRequestEntrypoint(llms: string, baseUrl: string): URL {
  const operation = /(?:^|\n)-\s*submit=(https?:\/\/[^\s]+)/iu.exec(llms)
  return exactSameOriginDiscoveryUrl(operation?.[1], baseUrl, 'request_entrypoint')
}

export function exactSameOriginDiscoveryUrl(value: string | undefined, baseUrl: string, relation: string): URL {
  if (value === undefined) throw new Error(`hosted_journey_discovery_missing:${relation}`)
  const base = new URL(baseUrl)
  const resolved = new URL(value, base)
  if (resolved.origin !== base.origin || resolved.username !== '' || resolved.password !== ''
    || resolved.search !== '' || resolved.hash !== '') {
    throw new Error(`hosted_journey_discovery_unsafe:${relation}`)
  }
  return resolved
}

export async function proveAnonymousRefusal(
  input: HostedCustomerRequestJourneyInput,
  requestEntrypointPath = '/api/v1/requests',
): Promise<void> {
  const response = await (input.fetch ?? fetch)(`${trimTrailingSlashes(input.baseUrl)}${requestEntrypointPath}`, {
    method: 'POST', headers: headers(input), body: '{}',
  })
  const value: unknown = await response.json()
  const result = customerRequestAgentResultSchema.safeParse(value)
  if (response.status !== 401 || !result.success || result.data.kind !== 'refused'
    || result.data.reason !== 'authentication_required') throw new Error('hosted_journey_anonymous_boundary_failed')
}
