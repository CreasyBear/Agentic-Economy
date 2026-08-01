import { useCallback, useEffect, useState } from 'react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { createFileRoute } from '@tanstack/react-router'
import { createServerFn, useServerFn } from '@tanstack/react-start'

import { AeAgentOperatorConsole, type AgentOperatorKeyReadback } from '@/components/ae/console/AeAgentOperatorConsole'
import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { isLocalE2EAuthBypassEnabled } from '@/lib/client/local-e2e-auth'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { createConvexMoneyQueryPort, MoneyQueryError } from '@/lib/server/money-query'
import { listCreditActivity, readCreditAccount, readKeyUsage, type MoneyQueryPort } from '@/modules/money/public'
import { listCustomerRequestAgentKeysServer, revokeCustomerRequestAgentKeyServer } from '@/modules/customer-request/agent-access.functions'
import type { CustomerRequestAgentKeyInventoryItem } from '@/modules/customer-request/agent-access'

export type AgentAccessConsoleReadback = readonly AgentOperatorKeyReadback[]

export const readAgentAccessConsoleServer = createServerFn({ method: 'GET' })
  .handler(async () => loadAgentAccessConsoleReadback())

export async function loadAgentAccessConsoleReadback(): Promise<AgentAccessConsoleReadback> {
  const keys = await listCustomerRequestAgentKeysServer()
  return await readAgentAccessMoneyReadback(keys, createConvexMoneyQueryPort())
}

export async function readAgentAccessMoneyReadback(
  keys: readonly CustomerRequestAgentKeyInventoryItem[],
  port: MoneyQueryPort,
): Promise<AgentAccessConsoleReadback> {
  return await Promise.all(keys.map(async (key) => {
    const principalId = `clerk_api_key:${key.keyId}`
    try {
      const [account, activity, usage] = await Promise.all([
        readCreditAccount({ port, query: { principalId, currency: 'USD' } }),
        listCreditActivity({ port, query: { principalId, credentialId: key.keyId, currency: 'USD', limit: 50 } }),
        readKeyUsage({ port, query: { principalId, credentialId: key.keyId, limit: 50 } }),
      ])
      return { key, principalId, account, activity: activity.items, ...(usage.items[0] === undefined ? {} : { usage: usage.items[0] }), dataState: 'source' as const }
    } catch (error) {
      const dataState = error instanceof MoneyQueryError && error.code === 'billing_identity_missing' ? 'empty' as const : 'unavailable' as const
      return { key, principalId, activity: [], dataState }
    }
  }))
}

export const Route = createFileRoute('/_operator/agent-access')({
  ...operatorRouteOptions,
  head: () => ({ meta: [
    { title: 'Assistant access | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: AgentAccessRoute,
})

function AgentAccessRoute() {
  const readConsole = useServerFn(readAgentAccessConsoleServer)
  const localE2E = isLocalE2EAuthBypassEnabled()
  const revokeKey = useServerFn(revokeCustomerRequestAgentKeyServer)
  const [items, setItems] = useState<AgentAccessConsoleReadback>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string>()
  const [revoking, setRevoking] = useState<string>()

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setItems(await readConsole())
      setError(undefined)
    } catch {
      setError('Your assistant access and balance are temporarily unavailable.')
    } finally {
      setLoading(false)
    }
  }, [readConsole])

  useEffect(() => {
    if (localE2E) {
      setItems([])
      setError(undefined)
      setLoading(false)
      return
    }
    void load()
  }, [load, localE2E])

  async function revoke(keyId: string) {
    setRevoking(keyId)
    try {
      const result = await revokeKey({ data: { keyId } })
      if (result.kind === 'revoked' || result.kind === 'already_revoked') await load()
      else if (result.kind === 'error') setError(result.retryable ? 'Access could not be revoked. Try again.' : 'This access is no longer available to this account.')
    } finally {
      setRevoking(undefined)
    }
  }

  return (
    <AeOperatorShell
      operatorRole="owner"
      title="Assistant access"
      description="Connect and manage your AI: review permission, usage, credit, and access."
      currentPath="/agent-access"
      eyebrow="YOUR ASSISTANT"
    >
      {localE2E ? (
        <div className="grid gap-3">
          <Alert>
            <AlertTitle>Local preview — no assistant is connected</AlertTitle>
            <AlertDescription>This browser journey does not sign in, create access, or authorize work. Browse the public demo to explore the customer experience.</AlertDescription>
            <Button asChild variant="secondary" className="mt-2 min-h-11"><a href="/">Browse public demo</a></Button>
          </Alert>
        </div>
      ) : null}
      {error === undefined ? null : (
        <Alert variant="destructive">
          <AlertTitle>Assistant access unavailable</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
          <Button type="button" variant="secondary" disabled={loading} onClick={() => void load()}>{loading ? 'Trying again…' : 'Try again'}</Button>
        </Alert>
      )}
      {error === undefined ? (
        <AeAgentOperatorConsole items={items} loading={loading} onRevoke={(keyId) => void revoke(keyId)} {...(revoking === undefined ? {} : { revokingKeyId: revoking })} />
      ) : null}
    </AeOperatorShell>
  )
}
