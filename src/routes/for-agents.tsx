import { Link, createFileRoute } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
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

const CLI_ENTRYPOINT = 'npm run -s ae --'

function anonymousReads(canonicalBaseUrl: string) {
  return [
    {
      command: `${CLI_ENTRYPOINT} search "<job>" --json`,
      route: operationMarketRoute(OPERATION_MARKET_SEARCH_PATH),
      description: 'Find current Operations for a natural-language job.',
    },
    {
      command: `${CLI_ENTRYPOINT} inspect "<operationRef>" --json`,
      route: operationMarketRoute(OPERATION_MARKET_DETAIL_PATH),
      description: 'Read one exact Operation’s inputs, terms, price, effects, availability, and evidence.',
    },
    {
      command: `${CLI_ENTRYPOINT} compare "<operationRef1>" "<operationRef2>" --json`,
      route: operationMarketRoute(OPERATION_MARKET_COMPARE_PATH),
      description: 'Compare exact current Operations without invoking them.',
    },
    {
      command: `curl -fsSL ${canonicalBaseUrl}/.well-known/ucp`,
      route: 'GET /.well-known/ucp',
      description: 'Read the raw machine handshake before installing the repo-local CLI.',
    },
  ] as const
}

const authenticatedCalls = [
  {
    command: `${CLI_ENTRYPOINT} connect --json`,
    route: `POST ${AGENT_ACCESS_OAUTH_PATHS.deviceAuthorization} · POST ${AGENT_ACCESS_OAUTH_PATHS.token}`,
    description: 'Obtain one owner-approved AE caller key through the OAuth device flow or validate the configured key against the gateway.',
  },
  {
    command: `${CLI_ENTRYPOINT} invoke "<operationRef>" "$AE_INPUT_JSON" --idempotency-key "<key>" --json`,
    route: `${OPERATION_INVOKE_ROUTE_CONTRACT.invoke.method} ${OPERATION_INVOKE_ROUTE_CONTRACT.invoke.path}`,
    description: 'Invoke the inspected Operation with one explicit stable idempotency key.',
  },
  {
    command: `${CLI_ENTRYPOINT} status "<invocationRef>" --json`,
    route: `${OPERATION_INVOKE_ROUTE_CONTRACT.status.method} ${OPERATION_INVOKE_ROUTE_CONTRACT.status.path}`,
    description: 'Read the durable state for the same invocation.',
  },
  {
    command: `${CLI_ENTRYPOINT} recover "<invocationRef>" "$AE_EVIDENCE_JSON" --idempotency-key "<key>" --json`,
    route: `${OPERATION_INVOKE_ROUTE_CONTRACT.reconcile.method} ${OPERATION_INVOKE_ROUTE_CONTRACT.reconcile.path}`,
    description: 'Recover uncertain work using the original invocation and stable key.',
  },
] as const

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
            <Button asChild variant="default" className="min-h-11"><a href="/SKILL.md">Read the Operation skill</a></Button>
            <Button asChild variant="secondary" className="min-h-11"><a href="/.well-known/ucp">Open deployment manifest</a></Button>
          </>
        }
      />
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-16 md:px-6">
        <AeAssistantInstallFunnel canonicalBaseUrl={canonicalBaseUrl} />

        <section aria-labelledby="agent-contract" className="grid gap-5">
          <div className="grid max-w-3xl gap-1">
            <h2 id="agent-contract" className="text-xl font-semibold text-foreground">The boundary is visible before you connect</h2>
            <p className="block text-muted-foreground">
              Search, detail, compare, and plan inspection are anonymous reads. Invoke, status, and recovery require one revocable AE caller key.
            </p>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="gap-4">
              <CardHeader>
                <CardTitle>Anonymous reads</CardTitle>
                <CardDescription>No account, caller key, provider credential, or execution authority.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4">
                  {anonymousReads(canonicalBaseUrl).map((surface) => (
                    <div key={surface.route} className="grid gap-1 border-t border-border pt-4 first:border-t-0 first:pt-0">
                      <dt className="font-mono text-sm font-semibold text-foreground">{surface.command}</dt>
                      <dd className="grid gap-1 text-sm text-muted-foreground">
                        <code>{surface.route}</code>
                        <span>{surface.description}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>

            <Card className="gap-4">
              <CardHeader>
                <CardTitle>Authenticated invoke and recovery</CardTitle>
                <CardDescription>The AE key identifies the caller. AE keeps provider credentials separate and still enforces explicit authority.</CardDescription>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4">
                  {authenticatedCalls.map((surface) => (
                    <div key={surface.command} className="grid gap-1 border-t border-border pt-4 first:border-t-0 first:pt-0">
                      <dt className="font-mono text-sm font-semibold text-foreground">{surface.command}</dt>
                      <dd className="grid gap-1 text-sm text-muted-foreground">
                        <code>{surface.route}</code>
                        <span>{surface.description}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </div>
        </section>

        <section aria-labelledby="agent-next-step" className="grid gap-3 border-t border-border pt-6">
          <h2 id="agent-next-step" className="text-xl font-semibold text-foreground">Own a business instead?</h2>
          <p className="block max-w-3xl text-muted-foreground">
            Publish what you do once, and these are the surfaces agents read it from.
          </p>
          <Button asChild variant="secondary" className="min-h-11 justify-self-start"><Link to="/claim">List your business</Link></Button>
        </section>
      </div>
    </AePublicShell>
  )
}
