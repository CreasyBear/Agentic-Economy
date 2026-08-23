import { useId, useState, type FormEvent } from 'react'
import { Link } from '@tanstack/react-router'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { isRecord } from '@/modules/common/is-record'
import { formatCurrencyAmount } from '@/modules/money/public'
import {
  neutralizeBidiFormattingControls,
  type AnswerOperationCandidate,
} from '@/modules/answer/public'

import {
  formatMachineLabel,
  OPERATION_JSON_MAX_BYTES,
  REVEAL_ENTER,
} from './AeGenerativeAnswerCopy'

const OPERATION_PARAMETER_PREVIEW_LIMIT = 6
const OPERATION_EVIDENCE_PREVIEW_LIMIT = 3

export function OperationCandidateList({
  candidates,
  candidateSetDigest,
  selectedOperationRef,
  onOperationSelect,
  retryableOperationRef,
}: {
  candidates: readonly AnswerOperationCandidate[]
  candidateSetDigest: string
  selectedOperationRef: string | undefined
  onOperationSelect: ((operationRef: string, input: Record<string, unknown>, candidateSetDigest: string) => void) | undefined
  retryableOperationRef: string | undefined
}) {
  if (candidates.length === 0) {
    return null
  }

  return (
    <section className={cn(REVEAL_ENTER, 'grid gap-3')} aria-label="Operation candidates">
      <header className="grid gap-0.5">
        <h2 className="text-sm font-semibold text-foreground">
          Matching Operations
        </h2>
        <p className="text-sm text-muted-foreground">
          Compare the published requirements and select the exact operation to continue.
        </p>
      </header>
      <ul className="grid gap-2" aria-label="Matching operations">
        {candidates.map((candidate) => (
          <OperationCandidateCard
            key={candidate.operationRef}
            candidateSetDigest={candidateSetDigest}
            candidate={candidate}
            selected={candidate.operationRef === selectedOperationRef}
            onOperationSelect={onOperationSelect}
            retryable={candidate.operationRef === retryableOperationRef}
          />
        ))}
      </ul>
    </section>
  )
}

function OperationCandidateCard({
  candidate,
  candidateSetDigest,
  selected,
  onOperationSelect,
  retryable,
}: {
  candidate: AnswerOperationCandidate
  candidateSetDigest: string
  selected: boolean
  onOperationSelect: ((operationRef: string, input: Record<string, unknown>, candidateSetDigest: string) => void) | undefined
  retryable: boolean
}) {
  const inputId = useId()
  const errorId = `${inputId}-error`
  const [composing, setComposing] = useState(false)
  const [inputJson, setInputJson] = useState('{}')
  const [inputError, setInputError] = useState<string | undefined>()
  const businessName = neutralizeBidiFormattingControls(candidate.business.name)
  const offeringLabel = neutralizeBidiFormattingControls(candidate.offering.label)
  const operationId = neutralizeBidiFormattingControls(candidate.operationId)
  const candidateLabel = `${businessName}: ${offeringLabel} · ${operationId} (option ${candidate.rank})`
  const matchReason = neutralizeBidiFormattingControls(candidate.matchReason)
  const summary = neutralizeBidiFormattingControls(candidate.summary || candidate.offering.summary)
  const requiredParameters = candidate.requiredParameters.slice(0, OPERATION_PARAMETER_PREVIEW_LIMIT)
  const optionalParameters = candidate.optionalParameters.slice(0, OPERATION_PARAMETER_PREVIEW_LIMIT)
  const evidence = candidate.evidence.slice(0, OPERATION_EVIDENCE_PREVIEW_LIMIT)
  const availability = [
    formatMachineLabel(candidate.availability.posture),
    candidate.availability.reason === undefined ? '' : formatMachineLabel(candidate.availability.reason),
  ].filter(Boolean).join(' · ')
  const authority = [
    formatMachineLabel(candidate.authority.publisher),
    formatMachineLabel(candidate.authority.sourceKind),
    operationAuthenticationLabel(candidate.authority.authentication),
  ].join(' · ')
  const executionAvailabilityReason = operationExecutionAvailabilityReason(candidate.availability)
  const selectionUnavailable = (selected && !retryable) || onOperationSelect === undefined || executionAvailabilityReason !== undefined
  function submitOperation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const bytes = new TextEncoder().encode(inputJson).byteLength
    if (bytes > OPERATION_JSON_MAX_BYTES) {
      setInputError('Input must be 256 KiB or smaller.')
      return
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(inputJson)
    } catch {
      setInputError('Enter valid JSON before running this operation.')
      return
    }
    if (!isRecord(parsed)) {
      setInputError('Operation input must be one JSON object.')
      return
    }
    const envelopeBytes = new TextEncoder().encode(JSON.stringify({
      operationRef: candidate.operationRef,
      input: parsed,
      candidateSetDigest,
    })).byteLength
    if (envelopeBytes > OPERATION_JSON_MAX_BYTES) {
      setInputError('Operation reference, input, and candidate digest together must be 256 KiB or smaller.')
      return
    }
    setInputError(undefined)
    onOperationSelect?.(candidate.operationRef, parsed, candidateSetDigest)
  }

  return (
    <li>
      <Card className="grid gap-0 overflow-hidden rounded-md border-border py-0 shadow-none data-[selected=true]:border-border-strong" data-selected={selected ? 'true' : 'false'}>
        <header className="grid min-w-0 gap-1 p-3">
          <div className="flex min-w-0 items-start justify-between gap-3">
            <div className="grid min-w-0 gap-0.5">
              <h3
                dir="auto"
                style={{ unicodeBidi: 'isolate' }}
                className="line-clamp-2 break-words text-sm font-semibold text-foreground"
              >
                {businessName}
              </h3>
              <p
                dir="auto"
                style={{ unicodeBidi: 'isolate' }}
                className="line-clamp-2 break-words text-sm font-medium text-foreground"
              >
                {offeringLabel} · {operationId}
              </p>
            </div>
            <Badge variant={selected ? 'default' : 'outline'} className="shrink-0">
              {selected ? 'Selected' : `Match ${candidate.rank}`}
            </Badge>
          </div>
          <p dir="auto" style={{ unicodeBidi: 'isolate' }} className="line-clamp-3 break-words text-sm leading-relaxed text-muted-foreground">
            {summary}
          </p>
        </header>

        <dl className="grid border-y border-border text-sm sm:grid-cols-2 [&>*]:p-3 sm:[&>*:nth-child(odd)]:border-r sm:[&>*:nth-child(n+3)]:border-t">
          <CandidateFact label="Why it matches" value={matchReason} />
          <CandidateFact label="Price" value={operationPriceLabel(candidate)} />
          <CandidateFact label="Availability / readiness" value={availability} />
          <CandidateFact label="Authority" value={authority} />
        </dl>

        <div className="grid gap-3 border-b border-border p-3 sm:grid-cols-3">
          <CandidateList
            label="Required inputs"
            items={requiredParameters.map(parameterLabel)}
            total={candidate.requiredParameters.length}
            emptyLabel="No required inputs"
          />
          <CandidateList
            label="Optional inputs"
            items={optionalParameters.map(parameterLabel)}
            total={candidate.optionalParameters.length}
            emptyLabel="No optional inputs"
          />
          <CandidateList
            label="Evidence"
            items={evidence.map((item) => (
              `${formatMachineLabel(item.purpose)} · ${neutralizeBidiFormattingControls(item.outputPointer)}`
            ))}
            total={candidate.evidence.length}
            emptyLabel="No evidence summary provided"
          />
        </div>

        <div className="flex flex-col gap-2 p-3 sm:flex-row">
          <Button asChild className="min-h-11 w-full sm:w-fit">
            <Link
              to="/operations/$operationRef"
              params={{ operationRef: candidate.operationRef }}
              aria-label={`Review and use ${candidateLabel}`}
            >
              Review and use
            </Link>
          </Button>
          <Button
            type="button"
            className="min-h-11 w-full sm:w-fit"
            variant="secondary"
            disabled={selectionUnavailable}
            aria-expanded={selectionUnavailable ? undefined : composing}
            aria-controls={selectionUnavailable ? undefined : inputId}
            aria-label={
              selected && retryable
                ? `Retry ${candidateLabel} from these results`
                : selected
                  ? `Selected ${candidateLabel} from these results`
                  : executionAvailabilityReason === undefined
                    ? `Run ${candidateLabel} from these results`
                    : `Not executable from these results: ${candidateLabel}`
            }
            onClick={selectionUnavailable ? undefined : () => setComposing((current) => !current)}
          >
            {selected && retryable
              ? composing
                ? 'Close retry input'
                : 'Retry operation'
              : selected
                ? 'Selected operation'
                : executionAvailabilityReason !== undefined
                  ? 'Not executable here'
                  : onOperationSelect === undefined
                    ? 'Run unavailable in replay'
                    : composing
                      ? 'Close input'
                      : 'Run Operation'}
          </Button>
        </div>
        {executionAvailabilityReason === undefined ? null : (
          <p className="px-3 pb-3 text-sm text-muted-foreground" role="note">
            {executionAvailabilityReason}
          </p>
        )}

        {composing && !selectionUnavailable ? (
          <form className="grid gap-3 border-t border-border p-3" onSubmit={submitOperation}>
            <div className="grid gap-1.5">
              <label htmlFor={inputId} className="text-sm font-medium text-foreground">Input JSON</label>
              <p className="text-xs text-muted-foreground">
                {candidate.exactRebindRequired
                  ? 'The server will re-read and validate the current published schema before execution.'
                  : 'The server will re-read the operation and validate this object against the current published schema.'}
              </p>
              <Textarea
                id={inputId}
                value={inputJson}
                spellCheck={false}
                aria-invalid={inputError === undefined ? undefined : true}
                aria-describedby={inputError === undefined ? undefined : errorId}
                className="min-h-28 font-mono text-xs"
                onChange={(event) => {
                  setInputJson(event.target.value)
                  setInputError(undefined)
                }}
              />
              {inputError === undefined ? null : (
                <p id={errorId} role="alert" className="text-sm text-destructive">{inputError}</p>
              )}
            </div>
            <Button type="submit" className="min-h-11 w-full sm:w-fit">Validate and run</Button>
          </form>
        ) : null}
      </Card>
    </li>
  )
}

function parameterLabel(parameter: AnswerOperationCandidate['requiredParameters'][number] | AnswerOperationCandidate['optionalParameters'][number]): string {
  const metadata = [
    neutralizeBidiFormattingControls(parameter.name),
    formatMachineLabel(parameter.group),
    neutralizeBidiFormattingControls(parameter.type),
  ]
  if (parameter.description !== undefined) {
    metadata.push(neutralizeBidiFormattingControls(parameter.description))
  }
  if (parameter.example !== undefined) {
    metadata.push(`Example: ${neutralizeBidiFormattingControls(JSON.stringify(parameter.example))}`)
  }
  if (parameter.enumValues !== undefined && parameter.enumValues.length > 0) {
    metadata.push(`Allowed: ${parameter.enumValues.map(neutralizeBidiFormattingControls).join(', ')}`)
  }
  if (parameter.default !== undefined) {
    metadata.push(`Default: ${neutralizeBidiFormattingControls(JSON.stringify(parameter.default))}`)
  }
  if (parameter.style !== undefined) {
    metadata.push(`Style: ${formatMachineLabel(parameter.style)}`)
  }
  if (parameter.explode !== undefined) {
    metadata.push(`Explode: ${parameter.explode ? 'Yes' : 'No'}`)
  }
  return metadata.join(' · ')
}

function CandidateFact({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid min-w-0 gap-1">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd dir="auto" style={{ unicodeBidi: 'isolate' }} className="break-words text-sm text-foreground">
        {value}
      </dd>
    </div>
  )
}

function CandidateList({
  label,
  items,
  total,
  emptyLabel,
}: {
  label: string
  items: readonly string[]
  total: number
  emptyLabel: string
}) {
  return (
    <section className="grid min-w-0 gap-1.5" aria-label={label}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {items.length === 0 ? (
        <p className="text-sm text-foreground">{emptyLabel}</p>
      ) : (
        <ul className="grid gap-1 text-sm text-foreground">
          {items.map((item, index) => (
            <li key={`${index}-${item}`} dir="auto" style={{ unicodeBidi: 'isolate' }} className="break-words">
              {item}
            </li>
          ))}
          {total > items.length ? <li className="text-muted-foreground">+{total - items.length} more</li> : null}
        </ul>
      )}
    </section>
  )
}

function operationPriceLabel(candidate: AnswerOperationCandidate): string {
  switch (candidate.commercial.price.kind) {
    case 'fixed':
      return formatCurrencyAmount(candidate.commercial.price.amount)
    case 'range':
      return `${formatCurrencyAmount(candidate.commercial.price.minimum)} – ${formatCurrencyAmount(candidate.commercial.price.maximum)}`
    case 'on_request':
      return 'Price on request'
    default: {
      const _exhaustive: never = candidate.commercial.price
      return _exhaustive
    }
  }
}

function operationAuthenticationLabel(authentication: AnswerOperationCandidate['authority']['authentication']): string {
  switch (authentication.kind) {
    case 'keyless':
      return 'Keyless'
    case 'platform_credential':
      return authentication.scheme === 'api_key'
        ? `Platform credential · API key (${formatMachineLabel(authentication.in)})`
        : 'Platform credential · Bearer'
    case 'x402':
      return 'x402 payment'
    case 'unknown':
      return 'Authentication unknown'
    default: {
      const _exhaustive: never = authentication
      return _exhaustive
    }
  }
}

function operationExecutionAvailabilityReason(
  availability: AnswerOperationCandidate['availability'],
): string | undefined {
  switch (availability.posture) {
    case 'routeable':
      return undefined
    case 'integrated':
      return 'Not executable here: integrated availability requires review on the Operation page.'
    case 'unavailable':
      return `Not executable here: ${formatMachineLabel(availability.reason ?? 'unavailable')}.`
    default: {
      const _exhaustive: never = availability.posture
      return _exhaustive
    }
  }
}
