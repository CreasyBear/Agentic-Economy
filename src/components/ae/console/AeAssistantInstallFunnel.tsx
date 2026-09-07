import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion'
import {
  NATIVE_MCP_CLIENTS,
  nativeMcpClient,
} from '@/lib/cli-distribution'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'

export type AeAssistantInstallFunnelProps = Readonly<{
  canonicalBaseUrl: string
}>

export function AeAssistantInstallFunnel({
  canonicalBaseUrl,
}: AeAssistantInstallFunnelProps) {
  const baseUrl = trimTrailingSlashes(canonicalBaseUrl)
  const recommended = nativeMcpClient('codex')

  return (
    <AeSection
      title="Connect with Codex"
      description="Use Codex's native connection to add Agentic Economy. You can browse Tools before connecting."
    >
      <div className="grid max-w-3xl gap-related">
        <AeCopyCommand
          label="Codex MCP command"
          code={recommended.setupCommand(baseUrl)}
          comfortable
        />
        <p className="text-sm leading-6 text-muted-foreground">{recommended.authenticationInstruction}</p>
        <p className="text-sm leading-6 text-muted-foreground">
          Return to Codex and ask it to find a Tool for your task. A live result confirms the connection;
          installing it alone does not. Account connection does not grant spending permission.
        </p>
      </div>
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
          <AccordionTrigger>Check a connection</AccordionTrigger>
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
