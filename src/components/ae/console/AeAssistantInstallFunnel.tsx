import { useState } from 'react'
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block'
import { AeSection } from '@/components/ae/layout/AeSection'
import { trimTrailingSlashes } from '@/modules/common/trim-trailing-slashes'

export type AeAssistantInstallFunnelProps = Readonly<{
  canonicalBaseUrl: string
}>

export function AeAssistantInstallFunnel({
  canonicalBaseUrl,
}: AeAssistantInstallFunnelProps) {
  const baseUrl = trimTrailingSlashes(canonicalBaseUrl)
  const cli = 'ae'
  const steps = [
    {
      id: 'connect',
      title: 'Connect',
      access: 'Once per device',
      description: 'Opens browser approval, stores one origin-bound key with user-only permissions, verifies it, and configures MCP. No wallet or environment editing.',
      code: `npx @agentic-economy/cli connect --base-url "${baseUrl}" --mcp`,
    },
    {
      id: 'search',
      title: 'Search by job',
      access: 'Public catalogue',
      description: 'Describe the outcome in ordinary language. Results include current availability, total price, authentication, and last verification.',
      code: `${cli} search "weather forecast" --base-url "${baseUrl}" --json`,
    },
    {
      id: 'inspect',
      title: 'Inspect one exact Operation',
      access: 'Anonymous read',
      description: 'Read the exact schema, example input and output, provider, readiness, authentication, and total price before calling.',
      code: `${cli} inspect "$AE_OPERATION_REF" --base-url "${baseUrl}" --json`,
    },
    {
      id: 'call',
      title: 'Call',
      access: 'Connected',
      description: 'Pass schema-valid input. AE creates and retains the retry identity, then returns one durable receipt reference.',
      code: `${cli} call "$AE_OPERATION_REF" --input "$AE_INPUT_JSON" --base-url "${baseUrl}" --wait`,
    },
    {
      id: 'status',
      title: 'Read the recorded status',
      access: 'Authenticated',
      description: 'Open the same execution record to see progress, money movement, validation, and the one safe next action.',
      code: `${cli} status "$AE_INVOCATION_REF" --base-url "${baseUrl}" --json`,
    },
  ] as const
  const [copyNotice, setCopyNotice] = useState<string>()

  function handleCopy(title: string) {
    setCopyNotice(`${title} command copied.`)
  }

  function handleCopyError(title: string) {
    setCopyNotice(`Could not copy the ${title} command. Select it and copy it manually.`)
  }

  return (
    <AeSection
      title="Connect once. Call any listed capability."
      description="One setup command, one catalogue, one call shape, and one receipt. Search and inspection remain public."
    >
      <ol className="m-0 grid list-none divide-y divide-border p-0">
          {steps.map(({ id, title, access, description, code }, index) => (
            <li key={id} className="grid min-w-0 gap-3 py-5 first:pt-0 last:pb-0">
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
                      className="min-h-touch min-w-touch"
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
    </AeSection>
  )
}
