'use client'

import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'

import { AeToolInspector } from '@/components/ae/market/tool-detail'
import { Button } from '@/components/ui/button'
import type { PublicToolDescriptor } from '@/modules/capability-supply/public'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'

import { useToolDetailReader } from '../CommandPanelProvider'
import { rememberRecentToolRef } from '../recent-tools'

type InspectState =
  | Readonly<{ kind: 'loading' }>
  | Readonly<{
      kind: 'found'
      tool: PublicToolDescriptor
    }>
  | Readonly<{ kind: 'unavailable'; toolRef: string }>


/** Second layer of the command panel: the compact canonical inspector. */
export function ToolDetailPage({
  toolRef,
  onNavigate,
}: Readonly<{
  toolRef: string
  onNavigate: () => void
}>) {
  const readDetail = useToolDetailReader()
  const [state, setState] = useState<InspectState>({ kind: 'loading' })
  const headingRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setState({ kind: 'loading' })
    let current = true
    void (async () => {
      try {
        const result = await readDetail(toolRef)
        if (!current) return
        if (result.kind === 'found') {
          rememberRecentToolRef(result.tool.toolRef)
          setState({ kind: 'found', tool: result.tool })
        } else setState({ kind: 'unavailable', toolRef })
      } catch (cause) {
        captureClientExceptionOnClient(cause)
        if (current) setState({ kind: 'unavailable', toolRef })
      }
    })()
    return () => {
      current = false
    }
  }, [toolRef, readDetail])

  useEffect(() => {
    headingRef.current?.focus()
  }, [toolRef])

  return (
    <div
      ref={headingRef}
      tabIndex={-1}
      role="region"
      aria-label="Tool details"
      className="flex min-h-0 flex-1 flex-col gap-related overflow-y-auto outline-none"
    >
      {state.kind === 'loading' ? (
        <p role="status" className="px-gutter py-section text-sm text-muted-foreground">
          Loading Tool…
        </p>
      ) : null}
      {state.kind === 'unavailable' ? (
        <div className="grid gap-intra px-gutter py-section">
          <p className="text-sm font-medium text-foreground">Tool unavailable</p>
          <p className="text-sm text-muted-foreground">
            “{state.toolRef}” could not be inspected right now.
          </p>
          <Button asChild size="sm" className="min-h-touch justify-self-start">
            <Link
              to="/market"
              search={{ window: '30d' }}
              hash="tools"
              onClick={onNavigate}
            >
              Browse current Tools
            </Link>
          </Button>
        </div>
      ) : null}
      {state.kind === 'found' ? (
        <AeToolInspector
          tool={state.tool}
          variant="compact"
          onNavigate={onNavigate}
        />
      ) : null}
    </div>
  )
}
