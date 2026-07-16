import { useState } from 'react'
import { Banner } from '@astryxdesign/core/Banner'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { TextInput } from '@astryxdesign/core/TextInput'
import { Heading, Text } from '@astryxdesign/core/Text'
import { createFileRoute } from '@tanstack/react-router'
import { useServerFn } from '@tanstack/react-start'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { issueCustomerRequestAgentKeyServer, revokeCustomerRequestAgentKeyServer } from '@/modules/customer-request/agent-access.functions'
import type { CustomerRequestAgentKeyResult } from '@/modules/customer-request/agent-access'

export const Route = createFileRoute('/_operator/agent-access')({
  ...operatorRouteOptions,
  head: () => ({ meta: [
    { title: 'Set up your AI | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
  ] }),
  component: AgentAccessRoute,
})

function AgentAccessRoute() {
  const issueKey = useServerFn(issueCustomerRequestAgentKeyServer)
  const revokeKey = useServerFn(revokeCustomerRequestAgentKeyServer)
  const [name, setName] = useState('My assistant')
  const [idempotencyKey] = useState(() => crypto.randomUUID())
  const [result, setResult] = useState<CustomerRequestAgentKeyResult>()
  const [pending, setPending] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [revocationError, setRevocationError] = useState<string>()
  const [copied, setCopied] = useState(false)

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setPending(true)
    try {
      setResult(await issueKey({ data: { name, idempotencyKey } }))
    } finally {
      setPending(false)
    }
  }

  async function revoke() {
    if (result === undefined || result.kind === 'error') return
    setRevoking(true)
    setRevocationError(undefined)
    try {
      const revoked = await revokeKey({ data: { keyId: result.keyId } })
      if (revoked.kind === 'revoked' || revoked.kind === 'already_revoked') setResult(undefined)
      else if (revoked.kind === 'error') setRevocationError(
        revoked.retryable ? 'The key could not be revoked. Try again.' : 'This key is no longer available to this account.',
      )
    } finally {
      setRevoking(false)
    }
  }

  async function copySecret() {
    if (result === undefined || result.kind === 'error') return
    await navigator.clipboard.writeText(result.secret)
    setCopied(true)
  }

  return (
    <AeOperatorShell operatorRole="owner" title="Set up your AI" description="Create one short-lived key so your AI can use your Customer Requests." currentPath="/agent-access">
      <div className="grid max-w-3xl gap-6">
        <Card padding={5} className="grid gap-4">
          <Heading level={2}>Create a seven-day key</Heading>
          <Text color="secondary">The key can create and continue your Customer Requests. It cannot change its own access or act outside the choices and limits AE shows you.</Text>
          <form className="grid gap-4" onSubmit={submit}>
            <TextInput label="Assistant name" value={name} onChange={setName} isRequired />
            <Button type="submit" label={pending ? 'Creating key…' : 'Create key'} variant="primary" isDisabled={pending || name.trim().length === 0 || (result !== undefined && result.kind !== 'error')} />
          </form>
        </Card>
        {result?.kind === 'error' ? (
          <Banner status="error" title="Key was not created" description={result.retryable ? 'Try again. The same setup attempt will not create a duplicate key.' : 'Sign in again and check the assistant name.'} />
        ) : result === undefined ? null : (
          <Card padding={5} className="grid gap-4">
            <Heading level={2}>Copy this key now</Heading>
            <Text color="secondary">Give it only to the AI you named. It expires in seven days and the same setup attempt returns this key instead of creating another.</Text>
            <code className="break-all rounded-md border border-border bg-surface p-3 text-sm">{result.secret}</code>
            <Button label={copied ? 'Key copied' : 'Copy key'} variant="primary" onClick={copySecret} />
            <Text type="supporting" color="secondary">Key reference: {result.keyId}</Text>
            <Button label={revoking ? 'Revoking…' : 'Revoke this key'} variant="secondary" onClick={revoke} isDisabled={revoking} />
            {revocationError === undefined ? null : <Banner status="error" title="Key was not revoked" description={revocationError} />}
          </Card>
        )}
      </div>
    </AeOperatorShell>
  )
}
