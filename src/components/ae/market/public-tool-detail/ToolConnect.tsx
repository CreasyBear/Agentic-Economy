import { Link } from '@tanstack/react-router'

import { CodeBlock } from '@/components/arc/code-block/code-block'
import { CopyButton } from '@/components/arc/copy-button/copy-button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/arc/tabs/tabs'
import { nativeMcpClient, type NativeMcpClientId } from '@/lib/cli-distribution'
import { TOOL_QUOTE_PATH } from '@/modules/capability-execution/quote'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'

import styles from './ToolPage.module.css'

const CLIENTS: readonly NativeMcpClientId[] = ['claude-code', 'cursor', 'codex']

function shellLiteral(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

/** Clerk/Vercel quickstart tabs: the stock MCP setup lines, plus a quote request for this exact tool. */
export function ToolConnect({ baseUrl, toolRef, sampleInput }: Readonly<{ baseUrl: string; toolRef?: string; sampleInput?: unknown }>) {
  const origin = trimTrailingSlashes(baseUrl)
  const mcpUrl = `${origin}/mcp`
  const input = sampleInput !== null && typeof sampleInput === 'object' && !Array.isArray(sampleInput) ? sampleInput : {}
  const curl = toolRef === undefined ? undefined : [
    `curl -sS ${origin}${TOOL_QUOTE_PATH} \\`,
    '  -H "Authorization: Bearer $AE_API_KEY" \\',
    "  -H 'content-type: application/json' \\",
    `  --data ${shellLiteral(JSON.stringify({ toolRef, input }))}`,
  ].join('\n')
  return <div className={styles.stack}>
    <div className={styles.sectionHead}>
      <p className={styles.muted}>MCP URL</p>
      <span className={styles.ref}><code>{mcpUrl}</code><CopyButton value={mcpUrl} label="Copy MCP URL" iconOnly variant="plain" /></span>
    </div>
    <Tabs defaultValue="claude-code">
      <TabsList aria-label="Connect from">
        {CLIENTS.map(id => <TabsTrigger key={id} value={id}>{nativeMcpClient(id).displayName}</TabsTrigger>)}
        {curl === undefined ? null : <TabsTrigger value="curl">curl</TabsTrigger>}
      </TabsList>
      {CLIENTS.map(id => {
        const client = nativeMcpClient(id)
        return <TabsContent key={id} value={id}>
          <div className={styles.panel}>
            <CodeBlock code={client.setupCommand(origin)} language="bash" filename="Terminal" />
            <p className={styles.muted}>{client.authenticationInstruction}</p>
          </div>
        </TabsContent>
      })}
      {curl === undefined ? null : <TabsContent value="curl">
        <div className={styles.panel}>
          <CodeBlock code={curl} language="bash" filename="Quote this call" />
          <p className={styles.muted}>Returns the exact price for this input. Nothing is paid until you approve it.</p>
          {/* OpenRouter's quickstart puts the key step beside the snippet, so the copied command works first time. */}
          <p className={styles.muted}>Set AE_API_KEY to an agent key from your account settings. <Link to="/owner/settings/agent-keys" className={styles.inlineLink}>Create an agent key</Link></p>
        </div>
      </TabsContent>}
    </Tabs>
  </div>
}
