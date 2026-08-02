import { useState } from 'react'
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'

export type AeAssistantInstallFunnelProps = Readonly<{
  canonicalBaseUrl: string
}>

export function AeAssistantInstallFunnel({ canonicalBaseUrl }: AeAssistantInstallFunnelProps) {
  const baseUrl = trimTrailingSlashes(canonicalBaseUrl)
  const commands = [
    { id: 'claude', label: 'Claude', command: `claude mcp add --transport http agentic-economy ${baseUrl}/mcp` },
    { id: 'codex', label: 'Codex', command: `codex mcp add agentic-economy --url ${baseUrl}/mcp` },
  ] as const
  const [copyNotice, setCopyNotice] = useState<string>()

  function handleCopy(label: string) {
    setCopyNotice(`${label} command copied.`)
  }

  function handleCopyError(label: string) {
    setCopyNotice(`Could not copy the ${label} command. Select it and copy it manually.`)
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
          <div key={id} className="grid min-w-0 gap-2">
            <p className="block text-sm font-semibold text-muted-foreground">{label}</p>
            <CodeBlock
              code={command}
              language="bash"
              className="min-w-0 [&_code]:break-all [&_pre]:whitespace-pre-wrap"
            >
              <CodeBlockHeader>
                <CodeBlockTitle>{label} setup command</CodeBlockTitle>
                <CodeBlockActions>
                  <CodeBlockCopyButton
                    className="min-h-11 min-w-11"
                    aria-label={`Copy ${label} command`}
                    title={`Copy ${label} command`}
                    onCopy={() => handleCopy(label)}
                    onError={() => handleCopyError(label)}
                  />
                </CodeBlockActions>
              </CodeBlockHeader>
            </CodeBlock>
          </div>
        ))}
        {copyNotice === undefined ? null : <p role="status" aria-live="polite" className="block text-sm text-muted-foreground">{copyNotice}</p>}
        <p className="block text-sm text-muted-foreground">
          You approve each action before it runs. Revoke assistant access from this page at any time.
        </p>
      </CardContent>
    </Card>
  )
}
