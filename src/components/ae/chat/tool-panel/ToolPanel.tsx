// Invariant: contract loading stays inside one stable review panel, following the chat's contained async sections.
import { useEffect, useId, useRef } from 'react'
import { chatToolPanel } from '@/lib/public/chat-ia'
import { useToolPanel } from './useToolPanel'
import type { ToolPanelProps } from './tool-panel.contracts'
import { ToolPanelActions } from './components/ToolPanelActions'
import { ToolPanelForm } from './components/ToolPanelForm'
import { ToolPanelHeader } from './components/ToolPanelHeader'
import { ToolPanelSkeleton } from './ToolPanelSkeleton'
import { DecisionPanel } from '@/components/arc/chat/DecisionPanel'

export function ToolPanel(props: ToolPanelProps) {
  const { view, setInputText, run, runAgain } = useToolPanel(props)
  const id = useId()
  const headingId = `${id}-heading`
  const headingRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    if (props.open && props.focusOnOpen) headingRef.current?.focus()
  }, [props.focusOnOpen, props.open])


  return (
    <DecisionPanel {...(props.panelId === undefined ? {} : { id: props.panelId })} aria-labelledby={headingId}
      aria-busy={view.phase === 'loading' || view.submission === 'submitting'} aria-hidden={!props.open}
      inert={!props.open} data-open={props.open}
      className="arc-tool-review-panel">
      <ToolPanelHeader view={view} headingId={headingId} headingRef={headingRef} onClose={props.onClose} />
      {view.phase === 'loading' ? <ToolPanelSkeleton recommended={props.recommendedBy !== undefined} /> : null}
      {view.phase === 'unavailable' ? <p role="status" className="break-words text-sm text-muted-foreground">{chatToolPanel.unavailable}</p> : null}
      {view.phase === 'form' || view.phase === 'json' ? (
        <>
          <ToolPanelForm view={view} idPrefix={`${id}-form`} onInputTextChange={setInputText} />
          <ToolPanelActions view={view} statusId={`${id}-form-incomplete`} onRun={() => void run()} onRunAgain={runAgain} />
        </>
      ) : null}
    </DecisionPanel>
  )
}
