import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'

export type AeAssistantInstallFunnelProps = Readonly<{
  canonicalBaseUrl: string
}>

export function AeAssistantInstallFunnel({ canonicalBaseUrl }: AeAssistantInstallFunnelProps) {
  const baseUrl = canonicalBaseUrl.replace(/\/+$/u, '')
  const commands = [
    { id: 'claude', label: 'Claude', command: `claude mcp add --transport http agentic-economy ${baseUrl}/mcp` },
    { id: 'codex', label: 'Codex', command: `codex mcp add agentic-economy --url ${baseUrl}/mcp` },
  ] as const
  const [copiedId, setCopiedId] = useState<string>()
  const [copyFailed, setCopyFailed] = useState(false)

  async function copyCommand(id: string, command: string) {
    if (navigator.clipboard?.writeText === undefined) {
      setCopyFailed(true)
      return
    }
    try {
      await navigator.clipboard.writeText(command)
      setCopiedId(id)
      setCopyFailed(false)
    } catch {
      setCopyFailed(true)
    }
  }

  return (
    <Card className="gap-5 border-border bg-card">
      <CardHeader>
        <h2 className="text-xl font-semibold tracking-tight text-foreground">Connect your assistant</h2>
        <CardDescription>
          Let your assistant find the right business and compare real options for your next ask.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-3">
        <h3 className="font-semibold text-foreground">Copy a setup command</h3>
        {commands.map(({ id, label, command }) => (
          <div key={id} className="grid gap-2">
            <p className="block text-sm font-semibold text-muted-foreground">{label}</p>
            <pre className="overflow-x-auto rounded-md border border-border bg-muted p-4 text-sm leading-6 text-foreground"><code>{command}</code></pre>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void copyCommand(id, command)}
              className="min-h-11 justify-self-start"
            >
              {copiedId === id ? 'Copied' : `Copy ${label} command`}
            </Button>
          </div>
        ))}
        {copyFailed ? <p role="status" className="block text-sm text-muted-foreground">Select the command above and copy it manually.</p> : null}
        <p className="block text-sm text-muted-foreground">
          You approve each action before it runs. Revoke assistant access from this page at any time.
        </p>
      </CardContent>
    </Card>
  )
}
