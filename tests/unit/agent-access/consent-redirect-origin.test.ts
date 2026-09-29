/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest'
import '../../setup/jsdom-platform'

import { consentHtml, consentRedirectOrigin } from '@/lib/server/agent-access-oauth/protocol'
import { readAgentConsentDetails } from '@/modules/agent-access/consent-read-model'

const requestedAccess = {
  environment: 'sandbox' as const,
  toolAccess: 'all_admitted' as const,
  toolRefs: [],
  expiresInSeconds: 3600,
}

describe('consent redirect origin', () => {
  it('shows only the origin for an authorization-code redirect', () => {
    expect(consentRedirectOrigin('https://attacker.example/callback?code=1')).toBe('https://attacker.example')
    expect(consentRedirectOrigin('http://127.0.0.1:8787/cb')).toBe('http://127.0.0.1:8787')
    expect(consentRedirectOrigin('javascript:alert(1)')).toBeUndefined()
    const html = consentHtml({
      grantRef: 'grant-1',
      grantRevision: 2,
      flow: 'authorization_code',
      clientName: 'Trusted assistant',
      mode: 'read_only',
      requestedScopes: ['market_tools:call'],
      state: 'opaque',
      requestedAccess,
      redirectUri: 'https://attacker.example/callback?code=1',
    })
    expect(html).toContain('After approval, this browser returns to https://attacker.example.')
    expect(html).toContain('data-redirect-origin="https://attacker.example"')
    expect(html).not.toContain('/callback')
    const details = readAgentConsentDetails(html)
    expect(details.redirectDisposition).toBe('origin')
    expect(details.redirectOrigin).toBe('https://attacker.example')
    expect(details.clientName).toBe('Trusted assistant')
  })

  it('says a device request does not redirect the browser', () => {
    const html = consentHtml({
      grantRef: 'grant-device',
      grantRevision: 1,
      flow: 'device_code',
      clientName: 'Device client',
      mode: 'approval_required',
      requestedScopes: ['customer_requests:approval_required'],
      state: '',
      requestedAccess,
    })
    expect(html).toContain('This request does not redirect your browser.')
    expect(html).toContain('data-redirect-disposition="none"')
    expect(readAgentConsentDetails(html).redirectDisposition).toBe('none')
  })

  it('tells the owner to decline when an authorization-code return site is missing', () => {
    const html = consentHtml({
      grantRef: 'grant-missing',
      grantRevision: 1,
      flow: 'authorization_code',
      clientName: 'Nameless redirect',
      mode: 'read_only',
      requestedScopes: ['market_tools:call'],
      state: 's',
      requestedAccess,
    })
    expect(html).toContain('The return site for this request is unavailable. Decline it.')
    expect(readAgentConsentDetails(html).redirectDisposition).toBe('unavailable')
  })
})
