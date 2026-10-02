import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/arc/button/button'
import {
  NATIVE_MCP_CLIENTS,
  nativeMcpClient,
} from '@/lib/cli-distribution'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import './AgentInstallComposition.css'

export type AeAssistantInstallFunnelProps = Readonly<{
  canonicalBaseUrl: string
  checkingConnection?: boolean
  onCheckConnection?: () => void
  resumeToolRef?: string
  hideSelfLinks?: boolean
}>

export function AeAssistantInstallFunnel({
  canonicalBaseUrl,
  checkingConnection = false,
  onCheckConnection,
  resumeToolRef,
}: AeAssistantInstallFunnelProps) {
  const baseUrl = trimTrailingSlashes(canonicalBaseUrl)
  const recommended = nativeMcpClient('codex')

  return (
    <AeSection
      title="Connect with Codex"
      description="Follow these steps in order."
      className="arc-agent-install"
    >
      {resumeToolRef === undefined ? null : (
        <div className="arc-agent-install-saved">
          <h3 className="arc-agent-install-title">Selected Tool saved for this setup</h3>
          <p className="arc-agent-install-copy">After Agents confirms a connection, this page will offer one return action to that Tool. No Call is created during setup.</p>
        </div>
      )}
      <ol aria-label="Agent connection steps" className="arc-agent-install-steps">
        <li className="arc-agent-install-step">
          <span className="arc-agent-install-number" aria-hidden="true">1</span>
          <div className="arc-agent-install-step-body">
            <h3 className="arc-agent-install-title">Start the connection</h3>
            <AeCopyCommand
              label="Codex MCP command"
              code={recommended.setupCommand(baseUrl)}
              comfortable
            />
          </div>
        </li>
        <li className="arc-agent-install-step">
          <span className="arc-agent-install-number" aria-hidden="true">2</span>
          <div className="arc-agent-install-step-body">
            <h3 className="arc-agent-install-title">Approve access in the browser</h3>
            <p className="arc-agent-install-copy">{recommended.authenticationInstruction}</p>
          </div>
        </li>
        <li className="arc-agent-install-step">
          <span className="arc-agent-install-number" aria-hidden="true">3</span>
          <div className="arc-agent-install-step-body">
            <h3 className="arc-agent-install-title">Confirm the connection</h3>
            <p className="arc-agent-install-copy">
              Connection is complete only when it appears in Agents. A live result confirms the connection;
              installing it alone does not. Account connection does not set a Spending policy.
            </p>
            {onCheckConnection === undefined ? null : (
              <Button
                type="button"
                variant="secondary"
                className="arc-agent-install-check"
                disabled={checkingConnection}
                onClick={onCheckConnection}
              >
                {checkingConnection ? 'Checking connection…' : 'Check connection'}
              </Button>
            )}
          </div>
        </li>
      </ol>
      <Accordion type="single" collapsible className="arc-agent-install-alternatives">
        <AccordionItem value="alternatives">
          <AccordionTrigger>Use Claude Code or Cursor</AccordionTrigger>
          <AccordionContent className="arc-agent-install-alternative-list">
            {NATIVE_MCP_CLIENTS.filter((client) => client.id !== 'codex').map((client) => (
              <div key={client.id} className="arc-agent-install-alternative">
                <h3 className="arc-agent-install-title">{client.displayName}</h3>
                <AeCopyCommand
                  label={`${client.displayName} MCP command`}
                  code={client.setupCommand(baseUrl)}
                  comfortable
                />
                <p className="arc-agent-install-copy">{client.authenticationInstruction}</p>
              </div>
            ))}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="help">
          <AccordionTrigger>Troubleshoot a connection</AccordionTrigger>
          <AccordionContent className="arc-agent-install-help">
            <p>If Tools are missing, check the connection in your client settings. After connecting, start a fresh task and search again.</p>
            <p>If a Call needs permission, follow the action shown for that Call. If its result is uncertain, check its status before trying again.</p>
            <a href="/support" className="arc-agent-install-help-link">Get connection help</a>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </AeSection>
  )
}
