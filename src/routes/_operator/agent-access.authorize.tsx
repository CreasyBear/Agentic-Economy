import { useEffect, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { operatorRouteOptions } from '@/lib/operator/route-options'

function readConsentDetails(html: string): Readonly<{ clientName?: string; mode?: string }> {
  const document = new DOMParser().parseFromString(html, 'text/html')
  const consent = document.querySelector<HTMLElement>('[data-ae-consent]')
  const clientName = consent?.dataset.clientName
  const mode = consent?.dataset.authorityMode
  return {
    ...(clientName === undefined || clientName.length === 0 ? {} : { clientName }),
    ...(mode === undefined || mode.length === 0 ? {} : { mode }),
  }
}

function consentPermissionCopy(mode: string | undefined): Readonly<{ allowed: string; approval: string }> {
  if (mode === 'inspect_only') return { allowed: 'browse and compare businesses', approval: 'Any work still waits for your approval.' }
  if (mode === 'approve_each') return { allowed: 'bring each request to you', approval: 'You approve each request before it moves forward.' }
  if (mode === 'bounded_mandate') return { allowed: 'work within the limits you set', approval: 'Anything outside those limits comes back to you for approval.' }
  if (mode === 'full_yolo') return { allowed: 'carry out approved work on your behalf', approval: 'AE still asks for your approval where required.' }
  return { allowed: 'show you available options', approval: 'The page will show what your assistant may do before you decide.' }
}

export const Route = createFileRoute('/_operator/agent-access/authorize')({
  ...operatorRouteOptions,
  validateSearch: z.object({ user_code: z.string().trim().min(3).max(32).optional() }),
  head: () => ({ meta: [
    { title: 'Review assistant access | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: AgentAccessAuthorizeRoute,
})

function AgentAccessAuthorizeRoute() {
  const { user_code: userCode } = Route.useSearch()
  const [status, setStatus] = useState<'idle' | 'approved' | 'denied' | 'error'>('idle')
  const [pending, setPending] = useState(false)
  const [clientName, setClientName] = useState<string>()
  const [mode, setMode] = useState<string>()

  useEffect(() => {
    if (userCode === undefined) return
    void fetch(`/oauth/authorize?user_code=${encodeURIComponent(userCode)}`)
      .then(async (response) => {
        if (!response.ok) throw new Error('authorization_unavailable')
        const html = await response.text()
        const details = readConsentDetails(html)
        setClientName(details.clientName)
        setMode(details.mode)
      })
      .catch(() => setStatus('error'))
  }, [userCode])

  async function decide(decision: 'approve' | 'deny') {
    if (userCode === undefined) return
    setPending(true)
    try {
      const response = await fetch('/oauth/authorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ user_code: userCode, decision }).toString(),
      })
      setStatus(response.ok ? (decision === 'approve' ? 'approved' : 'denied') : 'error')
    } catch {
      setStatus('error')
    } finally {
      setPending(false)
    }
  }

  const permission = consentPermissionCopy(mode)

  return (
    <AeOperatorShell operatorRole="owner" title="Review assistant access" description="Choose what your assistant may ask AE to do, then approve or decline." currentPath="/agent-access">
      <Card className="grid max-w-2xl gap-4 p-5">
        {userCode === undefined ? (
          <Alert variant="destructive"><AlertTitle>This access request is missing a code</AlertTitle><AlertDescription>Start a new request from your assistant.</AlertDescription></Alert>
        ) : status === 'idle' ? (
          <>
            <h2>{clientName === undefined ? 'Connect your assistant' : `Connect ${clientName}`}</h2>
            <p className="text-muted-foreground">Request code: {userCode}</p>
            <p className="text-muted-foreground">Your assistant may {permission.allowed}.</p>
            <p className="text-muted-foreground">{permission.approval}</p>
            <p className="text-muted-foreground">Access expires in seven days. You can revoke it at any time from Assistant access.</p>
            <div className="flex gap-3">
              <Button variant="default" onClick={() => void decide('approve')} disabled={pending}>{pending ? 'Approving…' : 'Approve access'}</Button>
              <Button variant="secondary" onClick={() => void decide('deny')} disabled={pending}>{pending ? 'Working…' : 'Decline'}</Button>
            </div>
          </>
        ) : status === 'approved' ? (
          <Alert><AlertTitle>Access approved — return to your assistant</AlertTitle><AlertDescription>Your assistant can now continue. Return to it to finish setup.</AlertDescription></Alert>
        ) : status === 'denied' ? (
          <Alert><AlertTitle>Access not approved</AlertTitle><AlertDescription>Your assistant can start a new request if you want to try again.</AlertDescription></Alert>
        ) : (
          <Alert variant="destructive"><AlertTitle>Access request unavailable</AlertTitle><AlertDescription>It may have expired. Start a new request from your assistant.</AlertDescription></Alert>
        )}
      </Card>
    </AeOperatorShell>
  )
}
