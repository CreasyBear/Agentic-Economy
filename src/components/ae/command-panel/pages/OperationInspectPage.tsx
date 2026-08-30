'use client'

import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRightIcon } from 'lucide-react'

import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { Button } from '@/components/ui/button'
import {
  formatOperationAuthentication,
  formatOperationPrice,
  formatOperationReadiness,
} from '@/modules/market/operation-view-model'
import {
  continuationForOperationFacts,
  type SuggestedContinuation,
} from '@/modules/market/suggested-continuation'
import type { PublicOperationDescriptor } from '@/modules/capability-supply/public'

import {
  useBuyerCredentialPresenceReader,
  useOperationDetailReader,
} from '../CommandPanelProvider'
import { rememberRecentOperationRef } from '../recent-operations'

type InspectState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{
      kind: 'found'
      operation: PublicOperationDescriptor
      hasBuyerCredential: boolean
    }>
  | Readonly<{ kind: 'unavailable'; operationRef: string }>


/**
 * Second layer of the command panel: one operation, rendered with the same
 * market view-model formatters the catalog tiles use, plus a CTA to the
 * canonical operation page.
 */
export function OperationInspectPage({ operationRef }: Readonly<{ operationRef: string }>) {
  const readDetail = useOperationDetailReader()
  const readBuyerCredentialPresence = useBuyerCredentialPresenceReader()
  const [state, setState] = useState<InspectState>({ kind: 'loading' })
  const headingRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setState({ kind: 'loading' })
    let current = true
    void (async () => {
      const [result, hasBuyerCredential] = await Promise.all([
        readDetail(operationRef),
        readBuyerCredentialPresence().catch(() => false),
      ])
      if (!current) return
      if (result.kind === 'found') {
        rememberRecentOperationRef(result.operation.operationRef)
        setState({ kind: 'found', operation: result.operation, hasBuyerCredential })
      } else setState({ kind: 'unavailable', operationRef })
    })()
    return () => {
      current = false
    }
  }, [operationRef, readBuyerCredentialPresence, readDetail])

  useEffect(() => {
    headingRef.current?.focus()
  }, [])

  return (
    <div
      ref={headingRef}
      tabIndex={-1}
      className="flex min-h-0 flex-1 flex-col gap-related overflow-y-auto outline-none"
    >
      {state.kind === 'loading' ? (
        <p role="status" className="px-gutter py-section text-sm text-muted-foreground">
          Loading operation…
        </p>
      ) : null}
      {state.kind === 'unavailable' ? (
        <div className="grid gap-intra px-gutter py-section">
          <p className="text-sm font-medium text-foreground">Operation unavailable</p>
          <p className="text-sm text-muted-foreground">
            “{state.operationRef}” could not be inspected right now.
          </p>
        </div>
      ) : null}
      {state.kind === 'found' ? (
        <FoundBody
          operation={state.operation}
          hasBuyerCredential={state.hasBuyerCredential}
        />
      ) : null}
    </div>
  )
}

function FoundBody({
  operation,
  hasBuyerCredential,
}: Readonly<{
  operation: PublicOperationDescriptor
  hasBuyerCredential: boolean
}>) {
  const invokeNavigation = operation.navigation.find(({ relation }) => relation === 'invoke')
  const callable = operation.availability.posture === 'routeable' && invokeNavigation !== undefined
  const inputExample = operation.contract.inputExamples?.[0]
  const requiresBuyerCredential = invokeNavigation?.authentication === 'required'
  const continuation = continuationForOperationFacts({
    operationRef: operation.operationRef,
    availabilityPosture: operation.availability.posture === 'routeable' && !callable
      ? 'integrated'
      : operation.availability.posture,
    requiresBuyerCredential,
    hasBuyerCredential,
  })

  return (
    <>
      <header className="grid gap-0.5 border-b border-border px-gutter pb-intra pt-intra">
        <h2 className="text-base font-semibold text-foreground">{operation.offering.label}</h2>
        <p className="text-xs text-muted-foreground">
          {operation.business.name} · {operation.contract.capabilityId}
        </p>
        <code dir="ltr" className="break-all font-mono text-xs text-muted-foreground">
          {operation.operationRef}
        </code>
      </header>
      <section className="grid gap-related px-gutter py-related">
        <p className="line-clamp-3 text-sm text-foreground">
          {catalogSummary(operation)}
        </p>
        <dl className="grid grid-cols-[max-content_1fr] items-baseline gap-x-related gap-y-intra">
          <Fact label="Price" value={formatOperationPrice(operation.commercial.price)} />
          <Fact label="Access" value={formatOperationAuthentication(operation.authentication)} />
          <Fact
            label="Readiness"
            value={operationReadinessForBuyer({
              availabilityPosture: operation.availability.posture,
              requiresBuyerCredential,
              hasBuyerCredential,
            })}
          />
          {operation.commercial.materialTerms.map((term) => (
            <Fact key={term.label} label={term.label} value={term.value} />
          ))}
        </dl>

        <PrimaryContinuation continuation={continuation} />

        <div className="grid gap-intra" aria-labelledby="operation-actions-title">
          <h3 id="operation-actions-title" className="text-sm font-semibold text-foreground">
            Actions
          </h3>
          <AeCopyCommand compact label="Operation reference" code={operation.operationRef} />
          <AeCopyCommand compact label="Inspect command" code={inspectCommand(operation.operationRef)} />
          {continuation.label === 'Call Operation' && inputExample !== undefined ? (
            <AeCopyCommand compact label="Call command" code={callCommand(operation.operationRef, inputExample.input)} />
          ) : null}
        </div>

        <Link
          to="/operations/$operationRef"
          params={{ operationRef: operation.operationRef }}
          data-testid="command-panel-open-operation"
          className="inline-flex min-h-touch items-center gap-1 justify-self-start text-sm font-medium text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Open full Operation details
          <ArrowUpRightIcon aria-hidden="true" className="size-4" />
        </Link>
      </section>
    </>
  )
}

function operationReadinessForBuyer({
  availabilityPosture,
  requiresBuyerCredential,
  hasBuyerCredential,
}: Readonly<{
  availabilityPosture: PublicOperationDescriptor['availability']['posture']
  requiresBuyerCredential: boolean
  hasBuyerCredential: boolean
}>): string {
  if (availabilityPosture === 'routeable' && requiresBuyerCredential && !hasBuyerCredential) {
    return 'Connection required'
  }
  return formatOperationReadiness(availabilityPosture)
}

function PrimaryContinuation({
  continuation,
}: Readonly<{ continuation: SuggestedContinuation }>) {
  const description = continuation.warning
    ?? (continuation.label === 'Connect agent'
      ? 'Connect an agent before making this protected call.'
      : continuation.label === 'Inspect Operation'
        ? 'This Operation can be inspected, but it is not currently callable.'
        : 'This is the single safe next step from the current Operation state.')

  return (
    <section
      className="grid gap-intra rounded-lg border border-border bg-muted/35 p-intra"
      aria-labelledby="operation-next-action"
    >
      <div className="grid gap-0.5">
        <h3 id="operation-next-action" className="text-sm font-semibold text-foreground">
          What you can do next
        </h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {continuation.kind === 'navigate' && continuation.href !== undefined ? (
        <Button asChild size="sm" className="min-h-touch justify-self-start">
          <Link to={continuation.href}>{continuation.label}</Link>
        </Button>
      ) : continuation.command !== undefined ? (
        <AeCopyCommand compact label={continuation.label} code={continuation.command} />
      ) : null}
    </section>
  )
}

function inspectCommand(operationRef: string): string {
  return `ae inspect '${operationRef}'`
}

function callCommand(operationRef: string, input: Readonly<Record<string, unknown>>): string {
  const inputJson = JSON.stringify(input).replaceAll("'", "'\\''")
  return `ae call '${operationRef}' --input '${inputJson}' --wait`
}

function Fact({ label, value }: Readonly<{ label: string; value: string }>) {
  return (
    <>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="min-w-0 break-words text-sm text-foreground">{value}</dd>
    </>
  )
}

function catalogSummary(operation: PublicOperationDescriptor): string {
  const summary = operation.summary.trim()
  return summary === '' ? operation.offering.summary : summary
}
