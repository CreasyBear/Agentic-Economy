'use client'

import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'

import { AeToolInspector } from '@/components/ae/market/tool-detail'
import '../CommandPanelComposition.css'
import type { PublicToolDescriptor } from '@/modules/capability-supply/public'
import { captureClientExceptionOnClient } from '@/lib/observability/capture-client-exception'

import { useToolDetailReader } from '../CommandPanelProvider'
import { rememberRecentToolRef } from '../recent-tools'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'

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
      className="arc-market arc-command-detail"
    >
      {state.kind === 'loading' ? (
        <p role="status" className="arc-market arc-command-status">
          Loading Tool…
        </p>
      ) : null}
      {state.kind === 'unavailable' ? (
        <div className="arc-market arc-command-recovery">
          <p className="arc-command-detail-title">Tool unavailable</p>
          <p>
            “{state.toolRef}” could not be inspected right now.
          </p>
          <Link
            to="/market"
            onClick={onNavigate}
            className={actionLinkClassName('primary', 'md')}
          >
            Browse current Tools
          </Link>
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
