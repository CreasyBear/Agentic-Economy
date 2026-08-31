import { useState } from 'react'
import {
  CodeBlock,
  CodeBlockActions,
  CodeBlockCopyButton,
  CodeBlockHeader,
  CodeBlockTitle,
} from '@/components/ai-elements/code-block'
import { AeSection } from '@/components/ae/layout/AeSection'
import {
  aeCliInstallCommand,
  aeMcpInstallCommand,
  aeMcpListCommand,
} from '@/lib/cli-distribution'
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
      id: 'install',
      title: 'Install and verify',
      access: 'Once per device',
      description: 'Installs the pinned, dependency-free CLI from this Agentic Economy deployment. The version check proves the executable is ready before you start.',
      code: `${aeCliInstallCommand(baseUrl)}\n${cli} --version`,
    },
    {
      id: 'search',
      title: 'Search by job',
      access: 'Public catalogue',
      description: 'Describe the outcome in ordinary language. Results include current availability, total price, authentication, and last verification.',
      code: `${cli} search "weather forecast" --base-url "${baseUrl}" --json`,
    },
    {
      id: 'mcp',
      title: 'Add MCP to your harness',
      access: 'Once per harness',
      description: 'Replace <agent> with codex, claude-code, or cursor. The pinned installer preserves the existing config and changes exactly that harness; restart it after verification.',
      code: `${aeMcpInstallCommand(baseUrl)}\n${aeMcpListCommand()}\n${cli} doctor --base-url "${baseUrl}" --json`,
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
      access: 'Public when eligible',
      description: 'Pass schema-valid input. Eligible keyless reads run immediately; otherwise AE returns the exact connection or authority step without starting the call.',
      code: `${cli} call "$AE_OPERATION_REF" --input "$AE_INPUT_JSON" --base-url "${baseUrl}" --wait`,
    },
    {
      id: 'connect',
      title: 'Connect if asked',
      access: 'Once per device',
      description: 'Opens browser approval, stores one origin-bound key with user-only permissions, and verifies it. No provider accounts or environment editing.',
      code: `${cli} connect --base-url "${baseUrl}"`,
    },
    {
      id: 'wait',
      title: 'Wait for the recorded result',
      access: 'Authenticated',
      description: 'Return to the same execution record after any process restart. This only observes progress and the safe next action; it never repeats the call.',
      code: `${cli} wait "$AE_INVOCATION_REF" --base-url "${baseUrl}" --json`,
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
      title="Install once. Verify both entry points."
      description="One pinned CLI and one pinned MCP installer. Search and inspection remain public; connect only when a call asks."
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
