import { Link } from '@tanstack/react-router'
import { ChevronDownIcon } from 'lucide-react'
import { MCP_LATEST_PROTOCOL_VERSION } from '@/lib/mcp-protocol'

import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { AeAgentQuickstartStep, AeAgentReferenceList } from '@/components/ae/console/AeAgentQuickstart'
import {
  AeAgentInstructionCard,
  AeSiteBody,
  AeSiteButton,
  AeSiteCallout,
  AeSiteEyebrow,
  AeSiteHeading,
  AeSiteHeadingPair,
  AeSiteHeroIntro,
  AeSiteSection,
  AeSiteSignoff,
} from '@/components/ae/website'
import { AGENT_PAGE, AGENT_SETUP_INSTRUCTION, BUSINESS_DOOR } from '@/content/brand-copy'
import { AGENT_ACCESS_OAUTH_PATHS } from '@/modules/agent-access/oauth-state'
import { OPERATION_INVOKE_ROUTE_CONTRACT } from '@/modules/capability-execution/operation-invoke-entry'
import {
  OPERATION_MARKET_ACTION_ENTRIES,
  OPERATION_MARKET_COMPARE_PATH,
  OPERATION_MARKET_DETAIL_PATH,
  OPERATION_MARKET_INSPECT_PLAN_PATH,
  OPERATION_MARKET_SEARCH_PATH,
} from '@/modules/registry/operation-entry'

const CLI_ENTRYPOINT = 'ae'

export function AeAgentDoorPage({ canonicalBaseUrl }: { canonicalBaseUrl: string }) {
  return (
    <>
      <AeSiteSection labelledBy="agent-hero" rhythm="hero" scheme="muted">
        <div className="flex flex-col">
          <AeSiteHeroIntro className="order-2 mt-section md:order-1 md:mt-0">
            <AeSiteHeadingPair>
              <AeSiteEyebrow>{AGENT_PAGE.eyebrow}</AeSiteEyebrow>
              <div className="mx-auto w-full max-w-xl">
                <AeSiteHeading as="h1" size="md" id="agent-hero">
                  {AGENT_PAGE.heading}
                </AeSiteHeading>
              </div>
              <p className="font-medium text-foreground">{AGENT_PAGE.harnesses}</p>
              <div className="mx-auto w-full max-w-lg">
                <AeSiteBody muted size="sm" className="mx-auto">
                  {AGENT_PAGE.subhead}
                </AeSiteBody>
              </div>
            </AeSiteHeadingPair>
            <div className="flex flex-wrap items-center justify-center gap-related">
              <AeSiteButton asChild>
                <Link to="/market" search={{ window: '30d' }}>Browse tools</Link>
              </AeSiteButton>
              <AeSiteButton asChild variant="outlined">
                <Link to="/SKILL.md">Read the skill</Link>
              </AeSiteButton>
            </div>
          </AeSiteHeroIntro>
          <div className="order-1 md:order-2 md:mt-hero">
            <AeAgentInstructionCard
              headingId="agent-setup"
              instruction={AGENT_SETUP_INSTRUCTION}
            />
          </div>
        </div>
      </AeSiteSection>
      <AeSiteSection labelledBy="agent-quickstart" scheme="surface">
        <h2 id="agent-quickstart" className="sr-only">Four-step agent quickstart</h2>
        <div className="grid divide-y divide-border border-y border-border">
          <AeAgentQuickstartStep number="01" title="Search" access="Public" command={`${CLI_ENTRYPOINT} search "weather forecast" --base-url "${canonicalBaseUrl}"`} body="Find live tools by the outcome you need." />
          <AeAgentQuickstartStep number="02" title="Inspect" access="Public" command={`${CLI_ENTRYPOINT} inspect "$AE_OPERATION_REF" --base-url "${canonicalBaseUrl}"`} body="Read exact inputs, total price, readiness, and provider." />
          <AeAgentQuickstartStep number="03" title="Call" access="Public when eligible" command={`${CLI_ENTRYPOINT} call "$AE_OPERATION_REF" --input "$AE_INPUT_JSON" --base-url "${canonicalBaseUrl}" --wait`} body="Eligible tools return the result immediately." />
          <AeAgentQuickstartStep number="04" title="Connect if asked" access="Once" command={`npx @agentic-economy/cli connect --base-url "${canonicalBaseUrl}" --mcp`} body="Only if the selected tool cannot run anonymously." />
        </div>
      </AeSiteSection>
      <AeSiteCallout
        headingId="agent-one-wallet"
        heading="One wallet for everything"
        body="Every call settles from the same balance, across every provider. The price is on the card before anything runs. Payments land with one receipt and no per-provider billing."
        actions={
          <AeSiteButton asChild variant="outlined">
            <Link to="/market" search={{ window: '30d' }}>Compare tools</Link>
          </AeSiteButton>
        }
      />
      <AeSiteCallout
        headingId="agent-public-path"
        heading="Search first. Connect when the call needs it."
        body="Search, inspect, and run eligible tools without an account. Connect only if the selected tool requires it. Provider credentials stay with Agentic Economy."
        scheme="canvas"
        actions={
          <AeSiteButton asChild variant="outlined">
            <Link to="/.well-known/ucp">Open machine manifest</Link>
          </AeSiteButton>
        }
      />
      <AeSiteSection ariaLabel="Installation and reference" scheme="canvas">
        <div className="grid gap-section">
          <details className="group border-t border-border pt-6">
            <summary className="flex min-h-touch cursor-pointer items-center justify-between gap-4 font-medium marker:content-none">
              Full installation and recovery guide
              <ChevronDownIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform duration-base group-open:rotate-180" />
            </summary>
            <div className="pt-4"><AeAssistantInstallFunnel canonicalBaseUrl={canonicalBaseUrl} /></div>
          </details>
          <details className="group border-t border-border pt-6">
            <summary className="flex min-h-touch cursor-pointer items-center justify-between gap-4 font-medium marker:content-none">
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
        </div>
      </AeSiteSection>
      <AeSiteSignoff
        heading="Want agents to find your tool?"
        headingId="agent-supplier-next"
        body="Publish the job, the price, and how to call it."
        crosshairSide="left"
      >
        <AeSiteButton asChild variant="outlined">
          <Link to={BUSINESS_DOOR.href}>{BUSINESS_DOOR.cta}</Link>
        </AeSiteButton>
      </AeSiteSignoff>
    </>
  )
}

function operationMarketRoute(path: string): string {
  const route = OPERATION_MARKET_ACTION_ENTRIES.find((entry) => entry.pathTemplate === path)
  if (route === undefined) throw new Error(`Operation market route is not registered: ${path}`)
  return `${route.method} ${route.pathTemplate}`
}

function curlCommand(base: string, path: string, body: string): string {
  return `curl -sS '${base}${path}' -H 'content-type: application/json' --data '${body}'`
}

function anonymousReads(canonicalBaseUrl: string) {
  return [
    {
      command: curlCommand(canonicalBaseUrl, OPERATION_MARKET_SEARCH_PATH, '{"query":"weather forecast","limit":5}'),
      route: operationMarketRoute(OPERATION_MARKET_SEARCH_PATH),
      description: 'Find current tools for a natural-language job.',
    },
    {
      command: curlCommand(canonicalBaseUrl, OPERATION_MARKET_DETAIL_PATH, '{"operationRef":"operation:v1:…"}'),
      route: operationMarketRoute(OPERATION_MARKET_DETAIL_PATH),
      description: 'Read one tool’s inputs, terms, price, effects, availability, and evidence.',
    },
    {
      command: curlCommand(canonicalBaseUrl, OPERATION_MARKET_COMPARE_PATH, '{"operationRefs":["operation:v1:…","operation:v1:…"]}'),
      route: operationMarketRoute(OPERATION_MARKET_COMPARE_PATH),
      description: 'Compare current tools without calling them.',
    },
    {
      command: curlCommand(canonicalBaseUrl, OPERATION_MARKET_INSPECT_PLAN_PATH, '{"operationRefs":["operation:v1:…","operation:v1:…"]}'),
      route: operationMarketRoute(OPERATION_MARKET_INSPECT_PLAN_PATH),
      description: 'Inspect aggregate cost, data sharing, and effects for a bounded plan.',
    },
    {
      command: `curl -fsSL ${canonicalBaseUrl}/.well-known/ucp`,
      route: 'GET /.well-known/ucp',
      description: 'Read the raw machine handshake before installing the repo-local CLI.',
    },
  ] as const
}

function authenticatedCalls(canonicalBaseUrl: string) {
  return [
    {
      command: `npx @agentic-economy/cli connect --base-url "${canonicalBaseUrl}" --mcp`,
      route: `POST ${AGENT_ACCESS_OAUTH_PATHS.deviceAuthorization} · POST ${AGENT_ACCESS_OAUTH_PATHS.token}`,
      description: 'Obtain one owner-approved AE caller key through the OAuth device flow or validate the configured key against the gateway.',
    },
    {
      command: `${CLI_ENTRYPOINT} call "<operationRef>" --input "$AE_INPUT_JSON" --base-url "${canonicalBaseUrl}" --wait`,
      route: `${OPERATION_INVOKE_ROUTE_CONTRACT.invoke.method} ${OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path}`,
      description: 'Call the inspected tool; Agentic Economy creates and retains the safe retry identity.',
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
  ] as const
}
