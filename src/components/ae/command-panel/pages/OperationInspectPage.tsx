'use client'

import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'
import { ArrowUpRightIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  formatOperationAuthentication,
  formatOperationPrice,
  formatOperationReadiness,
} from '@/modules/market/operation-view-model'
import type { PublicOperationDescriptor } from '@/modules/capability-supply/public'

import { useOperationDetailReader } from '../CommandPanelProvider'

type InspectState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{ kind: 'found'; operation: PublicOperationDescriptor }>
  | Readonly<{ kind: 'unavailable'; operationRef: string }>


/**
 * Second layer of the command panel: one operation, rendered with the same
 * market view-model formatters the catalog tiles use, plus a CTA to the
 * canonical operation page.
 */
export function OperationInspectPage({ operationRef }: Readonly<{ operationRef: string }>) {
  const readDetail = useOperationDetailReader()
  const [state, setState] = useState<InspectState>({ kind: 'loading' })
  const headingRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setState({ kind: 'loading' })
    let current = true
    void (async () => {
      const result = await readDetail(operationRef)
      if (!current) return
      if (result.kind === 'found') setState({ kind: 'found', operation: result.operation })
      else setState({ kind: 'unavailable', operationRef })
    })()
    return () => {
      current = false
    }
  }, [operationRef, readDetail])

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
      {state.kind === 'found' ? <FoundBody operation={state.operation} /> : null}
    </div>
  )
}

function FoundBody({ operation }: Readonly<{ operation: PublicOperationDescriptor }>) {
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
          <Fact label="Readiness" value={formatOperationReadiness(operation.availability.posture)} />
          {operation.commercial.materialTerms.map((term) => (
            <Fact key={term.label} label={term.label} value={term.value} />
          ))}
        </dl>

        <Button asChild size="sm" className="min-h-touch self-start">
          <Link
            to="/operations/$operationRef"
            params={{ operationRef: operation.operationRef }}
            data-testid="command-panel-open-operation"
          >
            Open operation page
            <ArrowUpRightIcon aria-hidden="true" className="size-4" />
          </Link>
        </Button>
      </section>
    </>
  )
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
