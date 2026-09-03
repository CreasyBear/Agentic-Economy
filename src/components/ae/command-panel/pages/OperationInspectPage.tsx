'use client'

import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'

import { AeOperationInspector } from '@/components/ae/market/operation-detail'
import { Button } from '@/components/ui/button'
import type { PublicOperationDescriptor } from '@/modules/capability-supply/public'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'

import { useOperationDetailReader } from '../CommandPanelProvider'
import { rememberRecentOperationRef } from '../recent-operations'

type InspectState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{
      kind: 'found'
      operation: PublicOperationDescriptor
    }>
  | Readonly<{ kind: 'unavailable'; operationRef: string }>


/** Second layer of the command panel: the compact canonical inspector. */
export function OperationInspectPage({
  operationRef,
  onNavigate,
}: Readonly<{
  operationRef: string
  onNavigate: () => void
}>) {
  const readDetail = useOperationDetailReader()
  const [state, setState] = useState<InspectState>({ kind: 'loading' })
  const headingRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setState({ kind: 'loading' })
    let current = true
    void (async () => {
      try {
        const result = await readDetail(operationRef)
        if (!current) return
        if (result.kind === 'found') {
          rememberRecentOperationRef(result.operation.operationRef)
          setState({ kind: 'found', operation: result.operation })
        } else setState({ kind: 'unavailable', operationRef })
      } catch (cause) {
        captureClientExceptionOnClient(cause)
        if (current) setState({ kind: 'unavailable', operationRef })
      }
    })()
    return () => {
      current = false
    }
  }, [operationRef, readDetail])

  useEffect(() => {
    headingRef.current?.focus()
  }, [operationRef])

  return (
    <div
      ref={headingRef}
      tabIndex={-1}
      role="region"
      aria-label="Operation inspection"
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
          <Button asChild size="sm" className="min-h-touch justify-self-start">
            <Link
              to="/market"
              search={{ window: '30d' }}
              hash="operations"
              onClick={onNavigate}
            >
              Browse current Operations
            </Link>
          </Button>
        </div>
      ) : null}
      {state.kind === 'found' ? (
        <AeOperationInspector
          operation={state.operation}
          variant="compact"
          onNavigate={onNavigate}
        />
      ) : null}
    </div>
  )
}
