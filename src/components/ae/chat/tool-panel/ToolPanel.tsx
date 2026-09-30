// Invariant: contract loading stays inside one stable review panel, following the chat's contained async sections.
import { useEffect, useId, useRef } from 'react'
import { chatToolPanel } from '@/lib/public/chat-ia'
import { useToolPanel } from './useToolPanel'
import type { ToolPanelProps } from './tool-panel.contracts'
import { ToolPanelActions } from './components/ToolPanelActions'
import { ToolPanelForm } from './components/ToolPanelForm'
import { ToolPanelHeader } from './components/ToolPanelHeader'
import { ToolPanelSkeleton } from './ToolPanelSkeleton'

export function ToolPanel(props: ToolPanelProps) {
  const { view, setInputText, run, runAgain } = useToolPanel(props)
  const id = useId()
  const headingId = `${id}-heading`
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (props.open && props.focusOnOpen) headingRef.current?.focus()
  }, [props.focusOnOpen, props.open])


  return (
    <section {...(props.panelId === undefined ? {} : { id: props.panelId })} aria-labelledby={headingId}
      aria-busy={view.phase === 'loading' || view.submission === 'submitting'} aria-hidden={!props.open}
      inert={!props.open} data-open={props.open}
      className="grid min-w-0 gap-3 rounded-card border border-border bg-card p-4 motion-safe:transition-[opacity,translate] motion-safe:duration-base motion-safe:ease-emphasized motion-safe:starting:translate-y-1 motion-safe:starting:opacity-0 motion-safe:data-[open=false]:translate-y-1 motion-safe:data-[open=false]:opacity-0 motion-safe:data-[open=false]:duration-fast motion-safe:data-[open=false]:ease-standard">
      <ToolPanelHeader view={view} headingId={headingId} headingRef={headingRef} onClose={props.onClose} />
      {view.phase === 'loading' ? <ToolPanelSkeleton recommended={props.recommendedBy !== undefined} /> : null}
      {view.phase === 'unavailable' ? <p role="status" className="break-words text-sm text-muted-foreground">{chatToolPanel.unavailable}</p> : null}
      {view.phase === 'form' || view.phase === 'json' ? (
        <>
          <ToolPanelForm view={view} idPrefix={`${id}-form`} onInputTextChange={setInputText} />
          <ToolPanelActions view={view} statusId={`${id}-form-incomplete`} onRun={() => void run()} onRunAgain={runAgain} />
        </>
      ) : null}
    </section>
  )
}
