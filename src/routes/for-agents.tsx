import { Link, createFileRoute } from '@tanstack/react-router'
import { MCP_LATEST_PROTOCOL_VERSION } from '@/lib/mcp-protocol'

import { Button } from '@/components/ui/button'
import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { AeAgentQuickstartStep, AeAgentReferenceList } from '@/components/ae/console/AeAgentQuickstart'
import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AGENT_PAGE } from '@/content/brand-copy'
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
    command: `npx ae connect --base-url "${canonicalBaseUrl}" --mcp`,
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
      <div className="mx-auto grid w-full max-w-[1080px] gap-8 px-4 py-10 sm:px-6 sm:py-14">
        <header className="grid gap-5 border-b pb-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="grid max-w-3xl gap-3">
            <p className="font-mono text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">{AGENT_PAGE.eyebrow}</p>
            <h1 className="text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">{AGENT_PAGE.heading}</h1>
            <p className="text-base leading-7 text-muted-foreground">{AGENT_PAGE.subhead}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild><Link to="/market" search={{ window: '30d' }}>Browse tools</Link></Button>
            <Button asChild variant="outline"><Link to="/SKILL.md">Read the skill</Link></Button>
          </div>
        </header>

        <section aria-labelledby="agent-instruction" className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_minmax(18rem,0.75fr)] sm:items-center sm:p-5">
          <div className="grid gap-1">
            <h2 id="agent-instruction" className="font-semibold">Give this to your agent</h2>
            <p className="text-sm leading-6 text-muted-foreground">It can connect, find the capability, inspect the exact terms, and make the call through the same public workflow.</p>
          </div>
          <AeCopyCommand
            compact
            label="agent setup instruction"
            code="Connect to Agentic Economy, find the best capability for my task, show me its total price and inputs, then use it."
            copyText="Read $ORIGIN/llms.txt. Connect to Agentic Economy, find the best capability for my task, show me its total price and inputs, then use it."
          />
        </section>

        <section aria-labelledby="agent-quickstart" className="grid overflow-hidden rounded-lg border bg-card md:grid-cols-4">
          <h2 id="agent-quickstart" className="sr-only">Four-step agent quickstart</h2>
          <AeAgentQuickstartStep number="01" title="Connect" access="Once" command={`npx ae connect --base-url "${canonicalBaseUrl}" --mcp`} body="Browser approval stores and verifies one bounded key." />
          <AeAgentQuickstartStep number="02" title="Search" access="Public" command={`${CLI_ENTRYPOINT} search "weather forecast" --base-url "${canonicalBaseUrl}"`} body="Find current capabilities by the outcome you need." />
          <AeAgentQuickstartStep number="03" title="Inspect" access="Public" command={`${CLI_ENTRYPOINT} inspect "$AE_OPERATION_REF" --base-url "${canonicalBaseUrl}"`} body="Read exact inputs, total price, readiness, and provider." />
          <AeAgentQuickstartStep number="04" title="Call" access="Connected" command={`${CLI_ENTRYPOINT} call "$AE_OPERATION_REF" --input "$AE_INPUT_JSON" --base-url "${canonicalBaseUrl}" --wait`} body="Get one durable execution receipt." />
        </section>

        <div className="grid gap-3 rounded-lg border bg-muted/30 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
          <div><p className="font-semibold">The catalogue is public.</p><p className="text-sm leading-6 text-muted-foreground">Search and inspect without an account. Connect only to call; provider credentials stay behind AE.</p></div>
          <Button asChild variant="outline"><Link to="/.well-known/ucp">Open machine manifest</Link></Button>
        </div>

        <details className="group overflow-hidden rounded-lg border bg-card">
          <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 px-5 font-semibold marker:content-none">Full installation and recovery guide <span aria-hidden="true" className="text-muted-foreground group-open:rotate-180">⌄</span></summary>
          <div className="border-t p-4 sm:p-5"><AeAssistantInstallFunnel canonicalBaseUrl={canonicalBaseUrl} /></div>
        </details>

        <details className="group overflow-hidden rounded-lg border bg-card">
          <summary className="flex min-h-14 cursor-pointer items-center justify-between gap-4 px-5 font-semibold marker:content-none">API and MCP reference <span aria-hidden="true" className="text-muted-foreground group-open:rotate-180">⌄</span></summary>
          <div className="grid gap-7 border-t p-5">
            <AeAgentReferenceList title="Anonymous catalogue reads" items={anonymousReads(canonicalBaseUrl)} />
            <AeAgentReferenceList title="Authenticated calls" items={authenticatedCalls(canonicalBaseUrl)} />
            <section aria-labelledby="mcp-lifecycle" className="grid gap-2 border-t pt-5">
              <h2 id="mcp-lifecycle" className="font-semibold">MCP connection</h2>
              <p className="max-w-3xl text-sm leading-6 text-muted-foreground">Connect a Streamable HTTP client to <code>{canonicalBaseUrl}/mcp</code> using protocol <code>{MCP_LATEST_PROTOCOL_VERSION}</code>. Initialize the session before <code>tools/list</code> or <code>tools/call</code>, then close the transport when finished.</p>
            </section>
          </div>
        </details>

        <section aria-labelledby="agent-supplier-next" className="flex flex-col gap-3 border-t pt-7 sm:flex-row sm:items-center sm:justify-between">
          <div><h2 id="agent-supplier-next" className="font-semibold">Want agents to find your tool?</h2><p className="text-sm text-muted-foreground">Publish the capability, terms and access details once.</p></div>
          <Button asChild variant="outline"><Link to="/for-providers">List a tool</Link></Button>
        </section>
      </div>
    </AePublicShell>
  )
}
