/** Owner setup is a browser handoff; OAuth discovery/start endpoints are protocol requests. */
export function authOwnerHandoff(baseUrl?: string): Readonly<{
  actor: 'account_owner'; reason: 'connect_required'; destination: string
}> {
  return {
    actor: 'account_owner',
    reason: 'connect_required',
    destination: baseUrl === undefined ? '/agent-access' : new URL('/agent-access', baseUrl).href,
  }
}
