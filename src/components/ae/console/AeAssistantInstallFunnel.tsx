import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AeCollectionRail } from '@/components/ae/shared/AeCollectionRail'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import {
  NATIVE_MCP_CLIENTS,
  nativeMcpClient,
} from '@/lib/cli-distribution'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'

export type AeAssistantInstallFunnelProps = Readonly<{
  canonicalBaseUrl: string
  checkingConnection?: boolean
  onCheckConnection?: () => void
  resumeToolRef?: string
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
    <AeCollectionRail
      kicker="Agent connection"
      title="Connect with Codex"
      deck="Follow these steps in order. You can browse Tools before connecting."
    >
      {resumeToolRef === undefined ? null : (
        <div className="grid max-w-3xl gap-1 rounded-card border border-border bg-muted/30 p-4">
          <h3 className="font-medium">Selected Tool saved for this setup</h3>
          <p className="text-sm text-muted-foreground">After Agents confirms a connection, this page will offer one return action to that Tool. No Call is created during setup.</p>
        </div>
      )}
      <ol aria-label="Agent connection steps" className="m-0 grid max-w-3xl list-decimal gap-0 border-y border-border p-0 pl-5">
        <li className="grid gap-intra border-b border-border py-related">
          <h3 className="font-medium">Start the connection</h3>
          <AeCopyCommand
            label="Codex MCP command"
            code={recommended.setupCommand(baseUrl)}
            comfortable
          />
        </li>
        <li className="grid gap-intra border-b border-border py-related">
          <h3 className="font-medium">Approve access in the browser</h3>
          <p className="text-sm leading-6 text-muted-foreground">{recommended.authenticationInstruction}</p>
        </li>
        <li className="grid gap-intra py-related">
          <h3 className="font-medium">Confirm the connection</h3>
          <p className="text-sm leading-6 text-muted-foreground">
            Connection is complete only when it appears in Agents. A live result confirms the connection;
            installing it alone does not. Account connection does not grant spending permission.
          </p>
          {onCheckConnection === undefined ? null : (
            <Button
              type="button"
              variant="secondary"
              className="w-fit min-h-touch"
              disabled={checkingConnection}
              onClick={onCheckConnection}
            >
              {checkingConnection ? 'Checking connection…' : 'Check connection'}
            </Button>
          )}
        </li>
      </ol>
      <Accordion type="single" collapsible className="max-w-3xl">
        <AccordionItem value="alternatives">
          <AccordionTrigger>Use Claude Code or Cursor</AccordionTrigger>
          <AccordionContent className="grid gap-related">
        {NATIVE_MCP_CLIENTS.filter((client) => client.id !== 'codex').map((client) => (
          <div key={client.id} className="grid gap-related rounded-card border border-border bg-background p-related">
            <h3 className="font-medium">{client.displayName}</h3>
            <AeCopyCommand
              label={`${client.displayName} MCP command`}
              code={client.setupCommand(baseUrl)}
              comfortable
            />
            <p className="text-sm leading-6 text-muted-foreground">{client.authenticationInstruction}</p>
          </div>
        ))}
          </AccordionContent>
        </AccordionItem>
        <AccordionItem value="help">
          <AccordionTrigger>Troubleshoot a connection</AccordionTrigger>
          <AccordionContent className="grid gap-related">
            <p>If tools are missing, check the connection in your client settings. After connecting, start a fresh task and search again.</p>
            <p>If a Call needs permission, follow the action shown for that Call. If its result is uncertain, check its status before trying again.</p>
            <a href="/support" className="inline-flex min-h-touch items-center underline underline-offset-4">Get connection help</a>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </AeCollectionRail>
  )
}
