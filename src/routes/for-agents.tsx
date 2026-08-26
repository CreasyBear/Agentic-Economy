import { Link, createFileRoute } from '@tanstack/react-router'
import { ChevronDownIcon } from 'lucide-react'
import { MCP_LATEST_PROTOCOL_VERSION } from '@/lib/mcp-protocol'

import { Button } from '@/components/ui/button'
import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { AeResolveWalkthrough } from '@/components/ae/console/AeResolveWalkthrough'
import { AeAgentQuickstartStep, AeAgentReferenceList } from '@/components/ae/console/AeAgentQuickstart'
import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AGENT_INSTRUCTION, AGENT_PAGE } from '@/content/brand-copy'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { AGENT_ACCESS_OAUTH_PATHS } from '@/modules/agent-access/oauth-state'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import {
  OPERATION_MARKET_ACTION_ENTRIES,
  OPERATION_MARKET_COMPARE_PATH,
  OPERATION_MARKET_DETAIL_PATH,
  OPERATION_MARKET_INSPECT_PLAN_PATH,
  OPERATION_MARKET_SEARCH_PATH,
} from '@/modules/registry/operation-entry'

export const Route = createFileRoute('/for-agents')({
  loader: () => readCanonicalBaseUrlServer(),
  head: () => ({
    meta: [
      { title: AGENT_PAGE.metaTitle },
      { name: 'description', content: AGENT_PAGE.metaDescription },
      { name: 'robots', content: 'index,follow' },
    ],
  }),
  component: ForAgentsRoute,
})
function operationMarketRoute(path: string): string {
  const route = OPERATION_MARKET_ACTION_ENTRIES.find((entry) => entry.pathTemplate === path)
  if (route === undefined) throw new Error(`Operation market route is not registered: ${path}`)
  return `${route.method} ${route.pathTemplate}`
}

const CLI_ENTRYPOINT = 'ae'

function curlCommand(base: string, path: string, body: string): string {
  return `curl -sS '${base}${path}' -H 'content-type: application/json' --data '${body}'`
}

function searchCommand(base: string): string {
  return curlCommand(base, OPERATION_MARKET_SEARCH_PATH, '{"query":"weather forecast","limit":5}')
}

function detailCommand(base: string): string {
  return curlCommand(base, OPERATION_MARKET_DETAIL_PATH, '{"operationRef":"operation:v1:…"}')
}

function anonymousReads(canonicalBaseUrl: string) {
  return [
    {
      command: searchCommand(canonicalBaseUrl),
      route: operationMarketRoute(OPERATION_MARKET_SEARCH_PATH),
      description: 'Find current Operations for a natural-language job.',
    },
    {
      command: detailCommand(canonicalBaseUrl),
      route: operationMarketRoute(OPERATION_MARKET_DETAIL_PATH),
      description: 'Read one exact Operation’s inputs, terms, price, effects, availability, and evidence.',
    },
    {
      command: curlCommand(canonicalBaseUrl, OPERATION_MARKET_COMPARE_PATH, '{"operationRefs":["operation:v1:…","operation:v1:…"]}'),
      route: operationMarketRoute(OPERATION_MARKET_COMPARE_PATH),
      description: 'Compare exact current Operations without invoking them.',
    },
    {
      command: curlCommand(canonicalBaseUrl, OPERATION_MARKET_INSPECT_PLAN_PATH, '{"operationRefs":["operation:v1:…","operation:v1:…"]}'),
      route: operationMarketRoute(OPERATION_MARKET_INSPECT_PLAN_PATH),
      description: 'Inspect aggregate cost, data sharing, and effects for a bounded plan of exact Operations.',
    },
    {
      command: `curl -fsSL ${canonicalBaseUrl}/.well-known/ucp`,
      route: 'GET /.well-known/ucp',
      description: 'Read the raw machine handshake before installing the repo-local CLI.',
    },
  ] as const
}

function authenticatedCalls(canonicalBaseUrl: string) { return [
  {
    command: `npx @agentic-economy/cli connect --base-url "${canonicalBaseUrl}" --mcp`,
    route: `POST ${AGENT_ACCESS_OAUTH_PATHS.deviceAuthorization} · POST ${AGENT_ACCESS_OAUTH_PATHS.token}`,
    description: 'Obtain one owner-approved AE caller key through the OAuth device flow or validate the configured key against the gateway.',
  },
  {
    command: `${CLI_ENTRYPOINT} call "<operationRef>" --input "$AE_INPUT_JSON" --base-url "${canonicalBaseUrl}" --wait`,
    route: `${OPERATION_INVOKE_ROUTE_CONTRACT.invoke.method} ${OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path}`,
    description: 'Call the inspected Operation; AE creates and retains the safe retry identity.',
  },
  {
    command: `${CLI_ENTRYPOINT} status "<invocationRef>" --base-url "${canonicalBaseUrl}" --json`,
    route: `${OPERATION_INVOKE_ROUTE_CONTRACT.status.method} ${OPERATION_INVOKE_ROUTE_CONTRACT.status.path}`,
    description: 'Read the durable state for the same invocation.',
  },
  {
    command: `${CLI_ENTRYPOINT} recover "<invocationRef>" "$AE_EVIDENCE_JSON" --idempotency-key "<key>" --base-url "${canonicalBaseUrl}" --json`,
    route: `${OPERATION_INVOKE_ROUTE_CONTRACT.reconcile.method} ${OPERATION_INVOKE_ROUTE_CONTRACT.reconcile.path}`,
    description: 'Recover uncertain work using the original invocation and stable key.',
  },
] as const }

function ForAgentsRoute() {
  const canonicalBaseUrl = Route.useLoaderData()

  return (
    <AePublicShell>
      <AePageHeader
        eyebrow={AGENT_PAGE.eyebrow}
        title={AGENT_PAGE.heading}
        description={AGENT_PAGE.subhead}
        actions={
          <>
            <Button asChild><Link to="/market" search={{ window: '30d' }}>Browse tools</Link></Button>
            <Button asChild variant="outline"><Link to="/SKILL.md">Read the skill</Link></Button>
          </>
        }
      />
      <div className="ae-rail grid gap-section pb-page sm:pb-16">
        <section aria-labelledby="agent-instruction" className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[minmax(0,1fr)_minmax(18rem,0.75fr)] sm:items-center sm:p-5">
          <div className="grid gap-1">
            <h2 id="agent-instruction" className="font-semibold">{AGENT_INSTRUCTION.heading}</h2>
            <p className="text-sm leading-6 text-muted-foreground">{AGENT_INSTRUCTION.body}</p>
          </div>
          <AeCopyCommand
            compact
            label={AGENT_INSTRUCTION.label}
            code={AGENT_INSTRUCTION.code}
            copyText={AGENT_INSTRUCTION.copyText}
          />
        </section>

        <section aria-labelledby="agent-quickstart" className="grid overflow-hidden rounded-lg border bg-card md:grid-cols-4 md:divide-x">
          <h2 id="agent-quickstart" className="sr-only">Four-step agent quickstart</h2>
          <AeAgentQuickstartStep number="01" title="Search" access="Public" command={`${CLI_ENTRYPOINT} search "weather forecast" --base-url "${canonicalBaseUrl}"`} body="Find current capabilities by the outcome you need." />
          <AeAgentQuickstartStep number="02" title="Inspect" access="Public" command={`${CLI_ENTRYPOINT} inspect "$AE_OPERATION_REF" --base-url "${canonicalBaseUrl}"`} body="Read exact inputs, total price, readiness, and provider." />
          <AeAgentQuickstartStep number="03" title="Call" access="Public when eligible" command={`${CLI_ENTRYPOINT} call "$AE_OPERATION_REF" --input "$AE_INPUT_JSON" --base-url "${canonicalBaseUrl}" --wait`} body="Free keyless reads return literal output and an evidence hash." />
          <AeAgentQuickstartStep number="04" title="Connect if asked" access="Once" command={`npx @agentic-economy/cli connect --base-url "${canonicalBaseUrl}" --mcp`} body="Required only for capabilities that cannot run anonymously." />
        </section>

        <AeResolveWalkthrough />

        <section aria-labelledby="agent-one-wallet" className="grid gap-3 border-t pt-7 sm:flex sm:items-center sm:justify-between sm:gap-4">
          <div>
            <h2 id="agent-one-wallet" className="font-semibold">One wallet for everything</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Every call settles from the same balance, across every provider. Payments land instantly, with one receipt
              and no per-provider billing.
            </p>
          </div>
          <Button asChild variant="outline" className="justify-self-start sm:justify-self-end">
            <Link to="/market" search={{ window: '30d' }}>Compare Operations</Link>
          </Button>
        </section>

        <div className="grid gap-3 rounded-lg border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div><p className="font-semibold">Try the public path first.</p><p className="text-sm leading-6 text-muted-foreground">Search, inspect, and call eligible free keyless reads without an account. Connect only when the selected capability requires it; provider credentials stay behind AE.</p></div>
          <Button asChild variant="outline"><Link to="/.well-known/ucp">Open machine manifest</Link></Button>
        </div>

        <details className="group border-t border-border pt-6">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-4 font-medium marker:content-none">
            Full installation and recovery guide
            <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-base group-open:rotate-180" />
          </summary>
          <div className="pt-4"><AeAssistantInstallFunnel canonicalBaseUrl={canonicalBaseUrl} /></div>
        </details>

        <details className="group border-t border-border pt-6">
          <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-4 font-medium marker:content-none">
            API and MCP reference
            <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-base group-open:rotate-180" />
          </summary>
          <div className="grid gap-7 pt-4">
            <AeAgentReferenceList title="Anonymous catalogue reads" items={anonymousReads(canonicalBaseUrl)} />
            <AeAgentReferenceList title="Authenticated calls" items={authenticatedCalls(canonicalBaseUrl)} />
            <section aria-labelledby="mcp-lifecycle" className="grid gap-2 border-t border-border pt-5">
              <h2 id="mcp-lifecycle" className="font-medium">MCP connection</h2>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">Use the official MCP SDK with <code>{canonicalBaseUrl}/mcp</code> and protocol <code>{MCP_LATEST_PROTOCOL_VERSION}</code>. Client connect performs initialization; this server is stateless and may omit <code>Mcp-Session-Id</code>. List tools before calling one, then close the client transport. A malformed JSON-RPC request returns a top-level protocol error; valid <code>tools/call</code> requests with invalid tool arguments return a tool result with <code>isError</code>.</p>
            </section>
          </div>
        </details>

        <section aria-labelledby="agent-supplier-next" className="grid gap-3 rounded-lg border p-5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div><h2 id="agent-supplier-next" className="font-semibold">Want agents to find your tool?</h2><p className="mt-1 text-sm text-muted-foreground">Publish the capability, terms and access details once.</p></div>
          <Button asChild variant="outline" className="justify-self-start sm:justify-self-end"><Link to="/for-providers">List a tool</Link></Button>
        </section>
      </div>
    </AePublicShell>
  )
}
