import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldSet, FieldLegend } from '@/components/ui/field'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
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
    {result.kind !== 'business_problem'
      ? <Card className="p-5">
        <p className="text-muted-foreground">
          {result.kind === 'unavailable'
            ? 'The latest report could not be loaded. Refresh the page to try again.'
            : 'This report is unavailable. It may be private, belong to another business, or no longer be accessible.'}
        </p>
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
    <Card className="p-5">
      <div className="grid gap-3">
        <div>
          <h2>{problem.category.replaceAll('_', ' ')}</h2>
          <p className="text-muted-foreground">{problem.customerStatement}</p>
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">Evidence the customer selected</p>
          {problem.evidence.length === 0
            ? <p className="text-sm text-muted-foreground">The customer did not select recorded result evidence.</p>
            : <ul className="mt-1 grid gap-1 text-sm text-muted-foreground">
              {problem.evidence.map((item) => <li key={item.receiptRef}>{item.label}</li>)}
            </ul>}
        </div>
        <p className="text-sm text-muted-foreground">
          AE has not decided what caused the problem, who is responsible, or what remedy applies.
        </p>
      </div>
    </Card>

    {problem.businessClaims.length === 0 ? null : <Card className="p-5">
      <div className="grid gap-2">
        <h2>Business statements</h2>
        {problem.businessClaims.map((claim) => <div key={claim.statementRef}>
          <p className="font-semibold text-foreground">{claim.causalityPosition.replaceAll('_', ' ')}</p>
          <p className="text-muted-foreground">{claim.statement}</p>
        </div>)}
      </div>
    </Card>}

    <Card className="p-5">
      <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void record() }}>
        <h2>Record business statement</h2>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="business-problem-position">Your position</FieldLabel>
            <Select
              value={position}
              onValueChange={(value) => {
                if (value === 'supports' || value === 'disputes' || value === 'uncertain') setPosition(value)
              }}
            >
              <SelectTrigger id="business-problem-position" className="min-h-11 w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="uncertain">Cause remains uncertain</SelectItem>
                <SelectItem value="supports">Our records support the customer report</SelectItem>
                <SelectItem value="disputes">Our records differ from the customer report</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="business-problem-statement">Statement</FieldLabel>
            <Textarea
              aria-describedby="business-problem-statement-description"
              value={statement}
              onChange={(event) => setStatement(event.target.value)}
              maxLength={1_000}
              required
              className="min-h-28 bg-card"
            />
          </Field>
          {problem.availableEvidence.length === 0 ? null : (
            <FieldSet>
              <FieldLegend variant="label">Attach recorded evidence from your step</FieldLegend>
              <FieldGroup className="gap-2">
                {problem.availableEvidence.map((item, index) => (
                  <Field key={item.receiptRef} orientation="horizontal">
                    <Checkbox
                      id={`evidence-${index}`}
                      checked={selectedEvidenceSet.has(item.receiptRef)}
                      onCheckedChange={(checked) => setSelectedEvidence((current) => (
                        checked === true
                          ? [...current, item.receiptRef]
                          : current.filter((receiptRef) => receiptRef !== item.receiptRef)
                      ))}
                    />
                    <FieldLabel htmlFor={`evidence-${index}`} className="font-normal">{item.label}</FieldLabel>
                  </Field>
                ))}
              </FieldGroup>
            </FieldSet>
          )}
          <FieldDescription id="business-problem-statement-description">
            This statement becomes part of the shared record. It does not decide cause, responsibility, compensation, or remedy.
          </FieldDescription>
        </FieldGroup>
        <Button type="submit" variant="default" disabled={submitting || statement.trim().length === 0}>
          {submitting ? 'Recording statement…' : 'Record business statement'}
        </Button>
        {error === undefined ? null : <FieldError>{error}</FieldError>}
      </form>
    </Card>
  </div>
}
