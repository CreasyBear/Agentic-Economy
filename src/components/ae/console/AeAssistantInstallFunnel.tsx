import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AeSection } from '@/components/ae/layout/AeSection'
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
}>

export function AeAssistantInstallFunnel({
  canonicalBaseUrl,
  checkingConnection = false,
  onCheckConnection,
}: AeAssistantInstallFunnelProps) {
  const baseUrl = trimTrailingSlashes(canonicalBaseUrl)
  const recommended = nativeMcpClient('codex')

  return (
    <AeSection
      title="Connect with Codex"
      description="Follow these steps in order. You can browse Tools before connecting."
    >
      <ol aria-label="Agent connection steps" className="grid max-w-3xl list-none gap-0 border-y border-border p-0">
        <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-related border-b border-border py-related">
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-muted font-mono text-sm font-semibold">1</span>
          <div className="grid min-w-0 gap-intra">
            <h3 className="font-medium">Start the connection</h3>
            <AeCopyCommand
              label="Codex MCP command"
              code={recommended.setupCommand(baseUrl)}
              comfortable
            />
          </div>
        </li>
        <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-related border-b border-border py-related">
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-muted font-mono text-sm font-semibold">2</span>
          <div className="grid min-w-0 gap-intra">
            <h3 className="font-medium">Approve access in the browser</h3>
            <p className="text-sm leading-6 text-muted-foreground">{recommended.authenticationInstruction}</p>
          </div>
        </li>
        <li className="grid grid-cols-[2rem_minmax(0,1fr)] gap-related py-related">
          <span aria-hidden="true" className="flex size-8 items-center justify-center rounded-full bg-muted font-mono text-sm font-semibold">3</span>
          <div className="grid min-w-0 gap-intra">
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
          </div>
        </li>
      </ol>
      <Accordion type="single" collapsible className="max-w-3xl">
        <AccordionItem value="alternatives">
          <AccordionTrigger>Use Claude Code or Cursor</AccordionTrigger>
          <AccordionContent className="grid gap-related">
        {NATIVE_MCP_CLIENTS.filter((client) => client.id !== 'codex').map((client) => (
          <div key={client.id} className="grid gap-related rounded-md border border-border bg-background p-related">
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
    </AeSection>
  )
}
