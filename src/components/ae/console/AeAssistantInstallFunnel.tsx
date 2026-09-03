import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  NATIVE_MCP_CLIENTS,
} from '@/lib/cli-distribution'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'

export type AeAssistantInstallFunnelProps = Readonly<{
  canonicalBaseUrl: string
}>

export function AeAssistantInstallFunnel({
  canonicalBaseUrl,
}: AeAssistantInstallFunnelProps) {
  const baseUrl = trimTrailingSlashes(canonicalBaseUrl)

  return (
    <AeSection
      title="Add Agentic Economy"
      description="Choose the client you already use, copy one native setup, and approve the connection in your browser."
    >
      <Tabs defaultValue="codex" className="grid max-w-3xl gap-related">
        <TabsList aria-label="Agent client" className="h-auto w-full justify-start overflow-x-auto">
          {NATIVE_MCP_CLIENTS.map((client) => (
            <TabsTrigger key={client.id} value={client.id} className="min-h-touch flex-1">
              {client.displayName}
            </TabsTrigger>
          ))}
        </TabsList>
        {NATIVE_MCP_CLIENTS.map((client) => (
          <TabsContent key={client.id} value={client.id} className="mt-0 grid gap-related rounded-md border border-border bg-background p-related">
            <AeCopyCommand
              label={`${client.displayName} MCP command`}
              code={client.setupCommand(baseUrl)}
              copyText={client.setupCommand('$ORIGIN')}
              comfortable
            />
            <p className="text-sm leading-6 text-muted-foreground">{client.authenticationInstruction}</p>
          </TabsContent>
        ))}
      </Tabs>
      <p className="max-w-3xl text-sm leading-6 text-muted-foreground">Public search works immediately. You approve protected work once in your browser, then continue in your agent client.</p>
    </AeSection>
  )
}
