import { useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'
import { createFileRoute, useRouter } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import {
  readSupportProblemsServer,
  updateSupportProblemServer,
  type SupportProblemRow,
} from '@/modules/customer-request/problem-support.functions'

export const Route = createFileRoute('/_operator/admin/request-problems')({
  ...operatorRouteOptions,
  loader: () => readSupportProblemsServer(),
  head: () => ({
    meta: [
      { title: 'Request problems | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: RequestProblemsRoute,
})

function RequestProblemsRoute() {
  const result = Route.useLoaderData()

  return <AeOperatorShell
    operatorRole="admin"
    title="Request problems"
    description="Record status updates without deciding cause, responsibility, or remedy."
    currentPath="/admin/request-problems"
  >
    {result.kind === 'denied'
      ? <Card padding={5}><Text color="secondary">Active support access is required.</Text></Card>
      : result.rows.length === 0
        ? <Card padding={5}><Text color="secondary">No reported Request problems need tracking.</Text></Card>
        : <div className="grid gap-4">
          {result.rows.map((problem) => <SupportProblemCard key={problem.reportRef} problem={problem} />)}
        </div>}
  </AeOperatorShell>
}

function SupportProblemCard({ problem }: { problem: SupportProblemRow }) {
  const router = useRouter()
  const [state, setState] = useState<'investigating' | 'waiting_for_customer' | 'closed'>('investigating')
  const [message, setMessage] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>()

  async function update() {
    if (message.trim().length === 0 || submitting) return
    setSubmitting(true)
    setError(undefined)
    try {
      const result = await updateSupportProblemServer({ data: {
        reportRef: problem.reportRef,
        expectedVersion: problem.version,
        idempotencyKey: `support:${problem.reportRef}:${crypto.randomUUID()}`,
        state,
        publicMessage: message.trim(),
      } })
      if (result.kind !== 'problem_status_updated') {
        setError(result.kind === 'conflict'
          ? 'This report changed. Reload the latest status before updating it.'
          : 'This update was not accepted.')
        return
      }
      setMessage('')
      await router.invalidate()
    } catch {
      setError('AE could not record the status update.')
    } finally {
      setSubmitting(false)
    }
  }

  return <Card padding={5}>
    <div className="grid gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="grid gap-1">
          <Heading level={2}>{problem.category.replaceAll('_', ' ')}</Heading>
          <Text color="secondary">{problem.summary}</Text>
          <Text type="supporting" color="secondary">
            {problem.business === undefined ? 'Business not named' : problem.business} · {problem.state.replaceAll('_', ' ')} · next: {problem.nextActor}
          </Text>
        </div>
        <Text type="supporting" color="secondary">Version {problem.version}</Text>
      </div>
      <label htmlFor={`problem-state-${problem.reportRef}`} className="text-sm font-semibold">Next status</label>
      <select
        id={`problem-state-${problem.reportRef}`}
        value={state}
        onChange={(event) => setState(event.target.value as typeof state)}
        className="min-h-11 rounded-md border border-border bg-card px-3"
      >
        <option value="investigating">AE is investigating</option>
        <option value="waiting_for_customer">Customer information needed</option>
        <option value="closed">Close without adjudication</option>
      </select>
      <label htmlFor={`problem-message-${problem.reportRef}`} className="text-sm font-semibold">Customer-visible update</label>
      <textarea
        id={`problem-message-${problem.reportRef}`}
        value={message}
        onChange={(event) => setMessage(event.target.value)}
        maxLength={1_000}
        required
        className="min-h-24 rounded-md border border-border bg-card p-3"
      />
      <Text type="supporting" color="secondary">
        This records progress only. It does not assign fault, approve compensation, or authorize another business action.
      </Text>
      <Button
        label={submitting ? 'Recording update…' : 'Record status update'}
        variant="primary"
        clickAction={() => void update()}
        isDisabled={submitting || message.trim().length === 0}
      />
      {error === undefined ? null : <Text type="supporting" color="secondary">{error}</Text>}
    </div>
  </Card>
}
