import { useRef, useState } from 'react'
import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { Heading, Text } from '@astryxdesign/core/Text'
import { createFileRoute, useRouter } from '@tanstack/react-router'

import { AeOperatorShell } from '@/components/ae/layout/AeOperatorShell'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import {
  readBusinessProblemServer,
  recordBusinessProblemStatementServer,
  type BusinessProblem,
  type BusinessProblemStatementInput,
} from '@/modules/customer-request/problem-business.functions'

type AllowedBusinessProblem = Extract<BusinessProblem, { kind: 'business_problem' }>

export const Route = createFileRoute('/_operator/owner/request-problems/$reportRef')({
  ...operatorRouteOptions,
  loader: ({ params }) => readBusinessProblemServer({ data: { reportRef: params.reportRef } }),
  head: () => ({
    meta: [
      { title: 'Customer problem | Agentic Economy' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: BusinessProblemRoute,
})

function BusinessProblemRoute() {
  const result = Route.useLoaderData()
  const router = useRouter()

  return <AeOperatorShell
    operatorRole="owner"
    title="Customer problem"
    description="Read what the customer shared and add your business statement."
    currentPath="/owner/request-problems"
  >
    {result.kind === 'refused'
      ? <Card padding={5}>
        <Text color="secondary">
          This report is unavailable. It may be private, belong to another business, or no longer be accessible.
        </Text>
      </Card>
      : <BusinessProblemPanel
        problem={result}
        onRecord={async (input) => {
          const recorded = await recordBusinessProblemStatementServer({ data: input })
          if (recorded.kind === 'business_report_recorded') await router.invalidate()
          return recorded
        }}
      />}
  </AeOperatorShell>
}

export function BusinessProblemPanel({
  problem,
  onRecord,
}: {
  problem: AllowedBusinessProblem
  onRecord: (input: BusinessProblemStatementInput) => Promise<unknown> | unknown
}) {
  const [position, setPosition] = useState<'supports' | 'disputes' | 'uncertain'>('uncertain')
  const [statement, setStatement] = useState('')
  const [selectedEvidence, setSelectedEvidence] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | undefined>()
  const commandKeyRef = useRef<string | undefined>(undefined)
  const selectedEvidenceSet = new Set(selectedEvidence)

  async function record() {
    if (statement.trim().length === 0 || submitting) return
    setSubmitting(true)
    setError(undefined)
    try {
      commandKeyRef.current ??= `business:${problem.reportRef}:${crypto.randomUUID()}`
      const result = await onRecord({
        reportRef: problem.reportRef,
        idempotencyKey: commandKeyRef.current,
        causalityPosition: position,
        statement: statement.trim(),
        evidenceReceiptRefs: selectedEvidence,
      })
      if (typeof result === 'object' && result !== null && 'kind' in result
        && result.kind === 'business_report_recorded') {
        commandKeyRef.current = undefined
        setStatement('')
        setSelectedEvidence([])
      } else {
        setError('The statement was not accepted. Reload the report and try again.')
      }
    } catch {
      setError('AE could not record the business statement.')
    } finally {
      setSubmitting(false)
    }
  }

  return <div className="grid gap-4">
    <Card padding={5}>
      <div className="grid gap-3">
        <div>
          <Heading level={2}>{problem.category.replaceAll('_', ' ')}</Heading>
          <Text color="secondary">{problem.customerStatement}</Text>
        </div>
        <div>
          <Text type="supporting" weight="semibold">Evidence the customer selected</Text>
          {problem.evidence.length === 0
            ? <Text type="supporting" color="secondary">The customer did not select recorded result evidence.</Text>
            : <ul className="mt-1 grid gap-1 text-sm text-secondary">
              {problem.evidence.map((item) => <li key={item.receiptRef}>{item.label}</li>)}
            </ul>}
        </div>
        <Text type="supporting" color="secondary">
          AE has not decided what caused the problem, who is responsible, or what remedy applies.
        </Text>
      </div>
    </Card>

    {problem.businessClaims.length === 0 ? null : <Card padding={5}>
      <div className="grid gap-2">
        <Heading level={2}>Business statements</Heading>
        {problem.businessClaims.map((claim) => <div key={claim.statementRef}>
          <Text weight="semibold">{claim.causalityPosition.replaceAll('_', ' ')}</Text>
          <Text color="secondary">{claim.statement}</Text>
        </div>)}
      </div>
    </Card>}

    <Card padding={5}>
      <div className="grid gap-3">
        <Heading level={2}>Record business statement</Heading>
        <label htmlFor="business-problem-position" className="text-sm font-semibold">Your position</label>
        <select
          id="business-problem-position"
          value={position}
          onChange={(event) => setPosition(event.target.value as typeof position)}
          className="min-h-11 rounded-md border border-border bg-card px-3"
        >
          <option value="uncertain">Cause remains uncertain</option>
          <option value="supports">Our records support the customer report</option>
          <option value="disputes">Our records differ from the customer report</option>
        </select>
        <label htmlFor="business-problem-statement" className="text-sm font-semibold">Statement</label>
        <textarea
          id="business-problem-statement"
          value={statement}
          onChange={(event) => setStatement(event.target.value)}
          maxLength={1_000}
          required
          className="min-h-28 rounded-md border border-border bg-card p-3"
        />
        {problem.availableEvidence.length === 0 ? null : <fieldset className="grid gap-2">
          <legend className="text-sm font-semibold">Attach recorded evidence from your step</legend>
          {problem.availableEvidence.map((item) => <label key={item.receiptRef} className="flex min-h-11 items-center gap-3">
            <input
              type="checkbox"
              checked={selectedEvidenceSet.has(item.receiptRef)}
              onChange={(event) => setSelectedEvidence((current) => (
                event.target.checked
                  ? [...current, item.receiptRef]
                  : current.filter((receiptRef) => receiptRef !== item.receiptRef)
              ))}
            />
            <span>{item.label}</span>
          </label>)}
        </fieldset>}
        <Text type="supporting" color="secondary">
          This statement becomes part of the shared record. It does not decide cause, responsibility, compensation, or remedy.
        </Text>
        <Button
          label={submitting ? 'Recording statement…' : 'Record business statement'}
          variant="primary"
          clickAction={() => void record()}
          isDisabled={submitting || statement.trim().length === 0}
        />
        {error === undefined ? null : <Text type="supporting" color="secondary">{error}</Text>}
      </div>
    </Card>
  </div>
}
