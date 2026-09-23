import type { JourneyNext } from '@/modules/actions/contract'
import { AGENT_ACCESS_OAUTH_PATHS } from '@/modules/agent-access/oauth-state'

/** Use the shared journey action vocabulary; no poll handle exists until the device grant starts. */

export function authContinuation(baseUrl?: string): readonly JourneyNext[] {
  const url = (path: string): string => baseUrl === undefined ? path : new URL(path, baseUrl).href
  return [
    { action: 'connect', args: { via: 'cli', command: 'ae connect' }, authority: 'human_owner' },
    { action: 'connect', args: { via: 'oauth_device', url: url('/.well-known/oauth-protected-resource') }, authority: 'human_owner' },
    { action: 'connect', args: { via: 'oauth_device', url: url(AGENT_ACCESS_OAUTH_PATHS.deviceAuthorization) }, authority: 'human_owner' },
  ]
}
