import { useEffect, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { AeSection, AeSettingsStack } from '@/components/ae/layout/AeSection'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { operatorRouteOptions } from '@/lib/operator/route-options'

type PublicAuthorityMode = 'inspect_only' | 'approve_each' | 'bounded_mandate'

const authorityOptions = [
  {
    value: 'inspect_only',
    label: 'Browse only',
    description: 'Discover, compare, and run free read-only operations.',
  },
  {
    value: 'approve_each',
    label: 'Ask each time',
    description: 'Paid or consequential work comes back to you first.',
  },
  {
    value: 'bounded_mandate',
    label: 'Work within limits',
    description: 'Paid calls up to $1 each, $5 a day, $20 a month.',
  },
] as const

function canSelectAuthority(value: PublicAuthorityMode, ceiling: string | undefined): boolean {
  if (value === 'inspect_only') return true
  if (value === 'approve_each') return ceiling !== 'inspect_only'
  return ceiling === 'bounded_mandate'
}

function readConsentDetails(html: string): Readonly<{ grantRef?: string; clientName?: string; mode?: string }> {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const consent = document.querySelector<HTMLElement>('[data-ae-consent]')
  const grantRef = consent?.dataset.grantRef
  const clientName = consent?.dataset.clientName
  const mode = consent?.dataset.authorityMode
  return {
    ...(grantRef === undefined || grantRef.length === 0 ? {} : { grantRef }),
    ...(clientName === undefined || clientName.length === 0 ? {} : { clientName }),
    ...(mode === undefined || mode.length === 0 ? {} : { mode }),
  }
}


export const Route = createFileRoute('/_operator/agent-access/authorize')({
  ...operatorRouteOptions,
  validateSearch: z.object({ user_code: z.string().trim().min(3).max(32).optional() }),
  head: () => ({ meta: [
    { title: 'Review agent access | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: AgentAccessAuthorizeRoute,
})

function AgentAccessAuthorizeRoute() {
  const { user_code: userCode } = Route.useSearch()
  const [status, setStatus] = useState<'idle' | 'approved' | 'denied' | 'error'>('idle')
  const [pending, setPending] = useState(false)
  const [consentLoading, setConsentLoading] = useState(userCode !== undefined)
  const [clientName, setClientName] = useState<string>()
  const [mode, setMode] = useState<string>()
  const [selectedMode, setSelectedMode] = useState<PublicAuthorityMode>('approve_each')
  const [grantRef, setGrantRef] = useState<string>()

  useEffect(() => {
    if (userCode === undefined) {
      setConsentLoading(false)
      setClientName(undefined)
      setMode(undefined)
      setGrantRef(undefined)
      return
    }

    const controller = new AbortController()
    setConsentLoading(true)
    setStatus('idle')
    setClientName(undefined)
    setMode(undefined)
    void fetch(`/oauth/authorize?user_code=${encodeURIComponent(userCode)}`, { credentials: 'same-origin', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('authorization_unavailable')
        const html = await response.text()
        const details = readConsentDetails(html)
        if (details.grantRef === undefined || details.clientName === undefined || details.mode === undefined) {
          throw new Error('authorization_details_missing')
        }
        setGrantRef(details.grantRef)
        setClientName(details.clientName)
        setMode(details.mode)
        setSelectedMode(
          details.mode === 'inspect_only'
            ? 'inspect_only'
            : details.mode === 'bounded_mandate'
              ? 'bounded_mandate'
              : 'approve_each',
        )
      })
      .catch((error: unknown) => {
        if (error instanceof Error && error.name === 'AbortError') return
        setStatus('error')
      })
      .finally(() => {
        if (!controller.signal.aborted) setConsentLoading(false)
      })
    return () => controller.abort()
  }, [userCode])

  async function decide(decision: 'approve' | 'deny') {
    if (grantRef === undefined) return
    setPending(true)
    try {
      const response = await fetch('/oauth/authorize', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_ref: grantRef, decision, authority_mode: selectedMode }).toString(),
      })
      setStatus(response.ok ? (decision === 'approve' ? 'approved' : 'denied') : 'error')
    } catch {
      setStatus('error')
    } finally {
      setPending(false)
    }
  }

  const consentReady = grantRef !== undefined && clientName !== undefined && mode !== undefined

  return (
    <AeOperatorShell operatorRole="owner" title="Review agent access" description="Choose what this agent may do, then approve or decline." currentPath="/agent-access">
      <AeSettingsStack>
        {userCode === undefined ? (
          <Alert variant="destructive"><AlertTitle>This access request is missing a code</AlertTitle><AlertDescription>Start a new request from your agent.</AlertDescription></Alert>
        ) : status !== 'error' && (consentLoading || !consentReady) ? (
          <Alert aria-live="polite"><AlertTitle>Loading access request</AlertTitle><AlertDescription>Retrieving the agent name and exact permission before you decide.</AlertDescription></Alert>
        ) : status === 'idle' ? (
          <>
            <AeSection
              title={clientName === undefined ? 'Connect your agent' : `Connect ${clientName}`}
              description="How much may this agent do without asking you?"
            >
              <fieldset className="grid gap-3" disabled={pending}>
                <legend className="sr-only">Authority</legend>
                <RadioGroup
                  aria-describedby="consent-expiry"
                  value={selectedMode}
                  onValueChange={(value) => setSelectedMode(value as PublicAuthorityMode)}
                  className="grid gap-2"
                >
                  {authorityOptions.map((option) => {
                    const disabled = !canSelectAuthority(option.value, mode)
                    return (
                      <Label
                        key={option.value}
                        htmlFor={`authority-${option.value}`}
                        className="grid min-h-touch cursor-pointer grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-md border border-border px-3 py-3 has-[[data-state=checked]]:border-foreground"
                      >
                        <RadioGroupItem
                          id={`authority-${option.value}`}
                          value={option.value}
                          disabled={disabled}
                          className="mt-1"
                        />
                        <span className="grid gap-1">
                          <span className="font-medium text-foreground">{option.label}</span>
                          <span className="text-sm font-normal text-muted-foreground">
                            {disabled ? 'This agent requested narrower access.' : option.description}
                          </span>
                        </span>
                      </Label>
                    )
                  })}
                </RadioGroup>
              </fieldset>
              <AeFactList
                facts={[
                  { label: 'Application', value: `${clientName ?? 'Your agent'} · Development · Standard rate limits` },
                  { label: 'Expiry', value: 'Access expires in seven days. You can revoke it at any time from Keys.' },
                ]}
              />
              <p id="consent-expiry" className="sr-only">Access expires in seven days. You can revoke it at any time from Keys.</p>
            </AeSection>
            <div className="flex flex-wrap gap-3">
              <Button aria-describedby="consent-expiry" variant="default" onClick={() => void decide('approve')} disabled={pending}>{pending ? 'Approving…' : 'Approve access'}</Button>
              <Button aria-describedby="consent-expiry" variant="secondary" onClick={() => void decide('deny')} disabled={pending}>{pending ? 'Working…' : 'Decline'}</Button>
            </div>
          </>
        ) : status === 'approved' ? (
          <Alert><AlertTitle>Access approved — return to your agent</AlertTitle><AlertDescription>AE delivers the caller key to that agent once. It can now finish setup; supplier credentials are never included.</AlertDescription></Alert>
        ) : status === 'denied' ? (
          <Alert><AlertTitle>Access not approved</AlertTitle><AlertDescription>Your agent can start a new request if you want to try again.</AlertDescription></Alert>
        ) : (
          <Alert variant="destructive"><AlertTitle>Access request unavailable</AlertTitle><AlertDescription>It may have expired. Start a new request from your agent.</AlertDescription></Alert>
        )}
      </AeSettingsStack>
    </AeOperatorShell>
  )
}
