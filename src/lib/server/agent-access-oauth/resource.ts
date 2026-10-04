import { oauthProtectedResourceMetadata } from '@/lib/http/oauth-challenge'
import { baseUrl, type OAuthApiOptions } from './runtime'

/** Requires the deployment's canonical resource, never a supplied Host.
 * Ensures explicit resource indicators name the one AE audience advertised in
 * protected-resource metadata. Invariant: reject foreign/ambiguous recipients
 * before grant writes, claims or token delivery. Omission retains legacy AE
 * device clients; credentials still require canonical AE admission at use. */
export function validOAuthResource(params: URLSearchParams, request: Request, options: OAuthApiOptions): boolean {
  const resources = params.getAll('resource')
  if (resources.length === 0) return true
  const [provided] = resources
  if (resources.length !== 1 || provided === undefined) return false
  try {
    const resource = new URL(provided)
    if (resource.hash || resource.username || resource.password) return false
    return resource.href === new URL(oauthProtectedResourceMetadata(baseUrl(request, options)).resource).href
  } catch { return false }
}
