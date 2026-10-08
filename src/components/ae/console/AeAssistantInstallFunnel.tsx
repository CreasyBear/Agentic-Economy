import { useEffect, useRef, useState } from 'react'
import { Link } from '@tanstack/react-router'

import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/arc/button/button'
import { MultiStepForm } from '@/components/ae/shared/arc-pro/multi-step-form/multi-step-form'
import { useClientMounted } from '@/hooks/use-client-mounted'
import {
  NATIVE_MCP_CLIENTS,
  type NativeMcpClientId,
} from '@/lib/cli-distribution'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import './AgentInstallComposition.css'

export type AeAssistantInstallFunnelProps = Readonly<{
  canonicalBaseUrl: string
  checkingConnection?: boolean
  onCheckConnection?: () => void
  resumeToolRef?: string
  hideSelfLinks?: boolean
  setupApp?: NativeMcpClientId
  onSetupAppChange?: (id: NativeMcpClientId | undefined) => void
}>

export function AeAssistantInstallFunnel({
  canonicalBaseUrl,
  checkingConnection = false,
  onCheckConnection,
  resumeToolRef,
  setupApp,
  onSetupAppChange,
}: AeAssistantInstallFunnelProps) {
  const baseUrl = trimTrailingSlashes(canonicalBaseUrl)
  const clientMounted = useClientMounted()
  const [localClientId, setLocalClientId] = useState<NativeMcpClientId>()
  const candidateClientId = onSetupAppChange === undefined ? localClientId : setupApp
  // Router search may retain raw values beside its validated projection.
  // Only a known recipe supplies the displayed choice or continuation URL.
  const client = NATIVE_MCP_CLIENTS.find(option => option.id === candidateClientId)
  const clientId = client?.id
  const stepHeading = useRef<HTMLDivElement>(null)
  const previousClientId = useRef(clientId)
  const continuationSearch = {
    ...(resumeToolRef === undefined ? {} : { resumeTool: resumeToolRef }),
    ...(clientId === undefined ? {} : { setupApp: clientId }),
  }

  // Requires an explicit or validated app selection. Ensures only that choice is
  // marked complete; setup instructions never prove approval or authentication.
  // The existing optional check observes access and never completes this form.
  const chooseClient = (id: NativeMcpClientId | undefined) => {
    if (onSetupAppChange === undefined) setLocalClientId(id)
    else onSetupAppChange(id)
  }

  useEffect(() => {
    if (clientId === previousClientId.current) return
    previousClientId.current = clientId
    const frame = requestAnimationFrame(() => {
      const legend = stepHeading.current?.querySelector('legend')
      if (legend) { legend.tabIndex = -1; legend.focus() }
    })
    return () => cancelAnimationFrame(frame)
  }, [clientId])

  return (
    <AeSection
      title="Put outside services within your Agent’s reach"
      description="Choose your app, approve access, then return to your task for a first useful Tool result."
      className="arc-agent-install"
    >
      {resumeToolRef === undefined ? null : (
        <div className="arc-agent-install-saved">
          <h3 className="arc-agent-install-title">Selected Tool saved for this setup</h3>
          <p className="arc-agent-install-copy">Your Tool stays selected through setup. Keep its input in your Agent’s task; setup creates no Call.</p>
        </div>
      )}
      <div ref={stepHeading}>
        <MultiStepForm
          progressLabel="Agent connection steps"
          activeStep={client === undefined ? 'app' : 'connect'}
          steps={[
            { id: 'app', title: 'Choose your Agent app', description: 'Use your existing app. No new Agent or task needs to be created here.' },
            { id: 'connect', title: 'Connect and approve access', description: 'Run the setup commands in your app, then follow its approval link.' },
          ]}
          completedSteps={client === undefined ? [] : [{
            id: 'app', title: 'Agent app', detail: client.displayName,
            disabled: !clientMounted, onEdit: () => chooseClient(undefined),
          }]}
        >
          <div className="arc-agent-install-step-body">
          {client === undefined ? (
            <>
              <div className="arc-agent-client-choices" role="group" aria-label="Agent app">
                {NATIVE_MCP_CLIENTS.map(option => (
                  <Button key={option.id} type="button" variant="secondary" disabled={!clientMounted}
                    onClick={() => chooseClient(option.id)}>
                    {option.displayName}
                  </Button>
                ))}
              </div>
              <Link
                to="/owner/settings/agent-keys"
                search={{ issue: 'manual', ...(resumeToolRef === undefined ? {} : { resumeTool: resumeToolRef }) }}
                className="arc-agent-install-help-link"
              >
                Connect an app or script with a manual key
              </Link>
            </>
          ) : <>
              <AeCopyCommand key={client.id} label={`${client.displayName} MCP command`} code={client.setupCommand(baseUrl)} comfortable actionLabel="Copy setup commands" />
              <p className="arc-agent-install-copy">{client.authenticationInstruction}</p>
              <p className="arc-agent-install-copy">In the approval page, choose Browse only, Ask each time, or Work within limits. Your Account balance never grants permission to spend.</p>
            </>}
            <p className="arc-agent-install-copy">
              {onCheckConnection === undefined
                ? 'After approval, open Agents to follow live service progress while you continue in your existing task.'
                : 'This page follows approved access automatically while you continue in your existing Agent task. You can check again below.'} Only a delivered Tool result and receipt completes first use.
            </p>
            {onCheckConnection !== undefined ? (
              <Button
                type="button"
                variant="secondary"
                className="arc-agent-install-check"
                disabled={checkingConnection}
                onClick={onCheckConnection}
              >
                {checkingConnection ? 'Checking connection…' : 'Check approved access'}
              </Button>
            ) : <Link to="/agent-access" search={continuationSearch} className="arc-agent-install-help-link">Continue after approval</Link>}
          </div>
        </MultiStepForm>
      </div>
      <Accordion type="single" collapsible className="arc-agent-install-alternatives">
        <AccordionItem value="manual">
          <AccordionTrigger>Connecting a custom script or another app?</AccordionTrigger>
          <AccordionContent className="arc-agent-install-help">
            <p>Issue a manual key, save it securely and configure your client. The key stays out of your conversation and setup URL.</p>
            <Link to="/owner/settings/agent-keys" search={{ issue: 'manual', ...(resumeToolRef === undefined ? {} : { resumeTool: resumeToolRef }) }} className="arc-agent-install-help-link">Issue a manual key</Link>
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="help">
          <AccordionTrigger>Troubleshoot a connection</AccordionTrigger>
          <AccordionContent className="arc-agent-install-help">
            <p>If Tools are missing, check the connection in your client settings and refresh its Tool list. Keep the selected Tool and input in your existing task.</p>
            <p>If a Call needs permission, follow the action shown for that Call. If its result is uncertain, check its status before trying again.</p>
            <a href="/support#agent-connection" className="arc-agent-install-help-link">Get connection help</a>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </AeSection>
  )
}
