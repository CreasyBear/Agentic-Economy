import { useState } from 'react'
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block'
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'
import {
  OPERATION_MARKET_ACTION_ENTRIES,
  OPERATION_MARKET_COMPARE_PATH,
  OPERATION_MARKET_DETAIL_PATH,
  OPERATION_MARKET_SEARCH_PATH,
} from '@/modules/registry/operation-entry'

export type AeAssistantInstallFunnelProps = Readonly<{
  canonicalBaseUrl: string
  onIssue?: () => void
  issuing?: boolean
  issueDisabled?: boolean
  issueDisabledReason?: string
  issueError?: string
  issuedSecret?: string
  onDismissIssuedSecret?: () => void
}>
function operationMarketRoute(baseUrl: string, path: string): string {
  const route = OPERATION_MARKET_ACTION_ENTRIES.find((entry) => entry.pathTemplate === path)
  if (route === undefined) throw new Error(`Operation market route is not registered: ${path}`)
  return `${route.method} ${baseUrl}${route.pathTemplate}`
}

export function AeAssistantInstallFunnel({
  canonicalBaseUrl,
  onIssue,
  issuing = false,
  issueDisabled = false,
  issueDisabledReason,
  issueError,
  issuedSecret,
  onDismissIssuedSecret,
}: AeAssistantInstallFunnelProps) {
  const baseUrl = trimTrailingSlashes(canonicalBaseUrl)
  const apiKeyOrigin = new URL(canonicalBaseUrl).origin
  const cli = 'npm run -s ae --'
  const steps = [
    {
      id: 'manifest',
      title: 'Read the raw handshake (no install)',
      access: 'No key',
      description: 'Start with the live machine contract. It carries canonical routes, action-derived POST schemas, valid examples, and authority boundaries.',
      code: `curl -fsSL ${baseUrl}/.well-known/ucp`,
    },
    {
      id: 'search',
      title: 'Search by job',
      access: 'Anonymous read',
      description: `Use the repo-local CLI after reading the handshake. Search current Operations through ${operationMarketRoute(baseUrl, OPERATION_MARKET_SEARCH_PATH)}.`,
      code: `${cli} search "weather forecast" --base-url "${baseUrl}" --json`,
    },
    {
      id: 'inspect',
      title: 'Inspect one exact Operation',
      access: 'Anonymous read',
      description: `Read its current inputs, terms, price, effects, and evidence through ${operationMarketRoute(baseUrl, OPERATION_MARKET_DETAIL_PATH)}.`,
      code: `${cli} inspect "$AE_OPERATION_REF" --base-url "${baseUrl}" --json`,
    },
    {
      id: 'compare',
      title: 'Compare exact candidates',
      access: 'Anonymous read',
      description: `When search returns more than one viable Operation, compare two to four exact references through ${operationMarketRoute(baseUrl, OPERATION_MARKET_COMPARE_PATH)}.`,
      code: `${cli} compare "$AE_OPERATION_REF_1" "$AE_OPERATION_REF_2" --base-url "${baseUrl}" --json`,
    },
    {
      id: 'direct-keyless',
      title: 'Use the direct-keyless MCP lane',
      access: 'No caller key',
      description: 'When exact detail advertises an anonymous execute continuation for a free, keyless, read-only Operation, call the MCP tool ae_operation_execute. This lane neither requires nor issues an AE caller key.',
      code: 'ae_operation_execute',
    },
    {
      id: 'connect',
      title: 'Authenticated lane: connect one AE caller key',
      access: 'Only when required',
      description: 'Connect before invoking through the authenticated gateway. Complete the OAuth device flow, or validate an existing AE_API_KEY against the authenticated gateway. A nonempty environment string is never treated as connected. The caller key identifies the caller at AE; it does not contain provider credentials or silently approve spending.',
      code: `${cli} connect --base-url "${baseUrl}" --json`,
    },
    {
      id: 'invoke',
      title: 'Invoke with a stable key',
      access: 'Authenticated',
      description: 'Use input that matches the inspected schema. The idempotency key is required; choose it once and keep it with this invocation.',
      code: `export AE_IDEMPOTENCY_KEY='invoice-extract-2026-08-11-001'
${cli} invoke "$AE_OPERATION_REF" "$AE_INPUT_JSON" --idempotency-key "$AE_IDEMPOTENCY_KEY" --base-url "${baseUrl}" --json`,
    },
    {
      id: 'status',
      title: 'Read the recorded status',
      access: 'Authenticated',
      description: 'Use the invocation reference returned by invoke. Do not start replacement work while the outcome is uncertain.',
      code: `${cli} status "$AE_INVOCATION_REF" --base-url "${baseUrl}" --json`,
    },
    {
      id: 'recover',
      title: 'Recover uncertain work',
      access: 'Authenticated',
      description: 'Recover the same invocation with bounded evidence and the same stable key. Never create a replacement invocation to guess at an uncertain outcome.',
      code: `${cli} recover "$AE_INVOCATION_REF" "$AE_EVIDENCE_JSON" --idempotency-key "$AE_IDEMPOTENCY_KEY" --base-url "${baseUrl}" --json`,
    },
  ] as const
  const keyCommand = issuedSecret === undefined ? undefined : `export AE_API_KEY='${issuedSecret.replaceAll("'", "'\\''")}'
export AE_API_KEY_ORIGIN='${apiKeyOrigin}'`
  const keyDownload = issuedSecret === undefined
    ? undefined
    : `data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify({
      AE_API_KEY: issuedSecret,
      AE_API_KEY_ORIGIN: apiKeyOrigin,
    }))}`
  const [copyNotice, setCopyNotice] = useState<string>()
  const [keyCopyNotice, setKeyCopyNotice] = useState<string>()

  function handleCopy(title: string) {
    setCopyNotice(`${title} command copied.`)
  }

  function handleCopyError(title: string) {
    setCopyNotice(`Could not copy the ${title} command. Select it and copy it manually.`)
  }

  return (
    <Card className="gap-5 border-border bg-card shadow-none">
      <CardHeader>
        <h2 className="text-lg font-semibold text-foreground">Connect an agent</h2>
        <CardDescription>
          Read and compare without a key. Eligible direct-keyless Operations can run through anonymous MCP; connect only when you need the authenticated invoke, status, or recovery lane.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <ol className="m-0 grid list-none gap-0 p-0">
          {steps.map(({ id, title, access, description, code }, index) => (
            <li key={id} className="grid min-w-0 gap-3 border-t border-border py-5 first:border-t-0 first:pt-0 last:pb-0">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h3 className="font-semibold text-foreground">{index + 1}. {title}</h3>
                <span className="text-sm font-medium text-muted-foreground">{access}</span>
              </div>
              <p className="block max-w-3xl text-sm text-muted-foreground">{description}</p>
              <CodeBlock code={code} language="bash" className="min-w-0 [&_code]:break-all [&_pre]:whitespace-pre-wrap">
                <CodeBlockHeader>
                  <CodeBlockTitle>{title}</CodeBlockTitle>
                  <CodeBlockActions>
                    <CodeBlockCopyButton
                      className="min-h-11 min-w-11"
                      aria-label={`Copy ${title} command`}
                      title={`Copy ${title} command`}
                      onCopy={() => handleCopy(title)}
                      onError={() => handleCopyError(title)}
                    />
                  </CodeBlockActions>
                </CodeBlockHeader>
              </CodeBlock>
            </li>
          ))}
        </ol>
        {copyNotice === undefined ? null : <p role="status" aria-live="polite" className="mt-3 block text-sm text-muted-foreground">{copyNotice}</p>}
      </CardContent>

      {onIssue === undefined ? null : (
        <CardContent className="grid gap-3 border-t border-border pt-5">
          <div className="grid gap-1">
            <h3 className="font-semibold text-foreground">Create a caller key for authenticated invocation</h3>
            <p className="text-sm text-muted-foreground">Direct-keyless MCP does not need this key. For authenticated invocation, the key identifies your agent at AE and never contains a supplier credential or silently grants paid or consequential authority.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" className="min-h-11" disabled={issuing || issueDisabled} onClick={onIssue}>
              {issuing ? 'Creating key…' : 'Create agent access key'}
            </Button>
            {issuing ? <p role="status" aria-live="polite" className="text-sm text-muted-foreground">Creating the agent access key…</p> : issueDisabledReason === undefined ? null : <p role="status" className="text-sm text-muted-foreground">{issueDisabledReason}</p>}
          </div>
          {issueError === undefined ? null : <p role="alert" className="text-sm text-destructive">{issueError}</p>}
          {keyCommand === undefined || keyDownload === undefined ? null : (
            <div className="grid min-w-0 gap-3" aria-labelledby="issued-key-title">
              <div className="grid gap-1">
                <h4 id="issued-key-title" className="font-semibold text-foreground">Save this access now</h4>
                <p className="text-sm text-muted-foreground">This is the only key reveal. The command and JSON file already include the canonical AE origin, so save either artifact before dismissing it.</p>
              </div>
              <CodeBlock code={keyCommand} language="bash" className="min-w-0 [&_code]:break-all [&_pre]:whitespace-pre-wrap">
                <CodeBlockHeader>
                  <CodeBlockTitle>AE caller environment commands</CodeBlockTitle>
                  <CodeBlockActions>
                    <CodeBlockCopyButton
                      className="min-h-11 min-w-11"
                      aria-label="Copy agent access key command"
                      title="Copy agent access key command"
                      onCopy={() => setKeyCopyNotice('Agent access key command copied.')}
                      onError={() => setKeyCopyNotice('Could not copy the agent access key command. Select it and copy it manually.')}
                    />
                  </CodeBlockActions>
                </CodeBlockHeader>
              </CodeBlock>
              {keyCopyNotice === undefined ? null : <p role="status" aria-live="polite" className="text-sm text-muted-foreground">{keyCopyNotice}</p>}
              <div className="flex flex-wrap gap-3">
                <Button asChild variant="secondary" className="min-h-11">
                  <a href={keyDownload} download="agent-access.json">Download agent-access.json</a>
                </Button>
                {onDismissIssuedSecret === undefined ? null : (
                  <Button type="button" variant="ghost" className="min-h-11" onClick={() => { setKeyCopyNotice(undefined); onDismissIssuedSecret() }}>I saved it — hide key</Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      )}

    </Card>
  )
}
