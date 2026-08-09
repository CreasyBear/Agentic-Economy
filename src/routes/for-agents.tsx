import { Link, createFileRoute } from '@tanstack/react-router'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { AeAssistantInstallFunnel } from '@/components/ae/console/AeAssistantInstallFunnel'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { AePublicShell } from '@/components/ae/layout/AePublicShell'
import { AGENT_PAGE } from '@/content/brand-copy'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { ANSWER_THREAD_AGENT_ENTRYPOINT } from '@/modules/answer-thread/agent-entry'
import { CUSTOMER_REQUEST_AGENT_ENTRYPOINT } from '@/modules/customer-request/agent-contract'

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

/**
 * The surfaces below are the ones AE already publishes and advertises in
 * `llms.txt` and the sitemap (`discovery/internal/discovery-files.ts`). This
 * page hands them to a human reading on an agent's behalf; it never describes
 * an endpoint the discovery documents do not already carry.
 */
const readSurfaces = [
  {
    href: '/llms.txt',
    title: 'llms.txt',
    description: 'The entry document: published businesses, assistant setup, and the request recipe.',
  },
  {
    href: '/SKILL.md',
    title: 'SKILL.md',
    description: 'The full procedure — relation-following, stop rules, and confirmation.',
  },
  {
    href: '/api/businesses',
    title: '/api/businesses',
    description: 'Every published business page as JSON. Search with /api/businesses/search?q=.',
  },
  {
    href: '/api/v1/services',
    title: '/api/v1/services',
    description: 'Canonical agent-native Services with flat endpoints. Search with /api/v1/services/search?q=.',
  },
  {
    href: '/.well-known/ucp',
    title: '/.well-known/ucp',
    description: 'The Universal Commerce Protocol descriptor for this deployment.',
  },
] as const

const callSurfaces = [
  {
    title: `${ANSWER_THREAD_AGENT_ENTRYPOINT.method} ${ANSWER_THREAD_AGENT_ENTRYPOINT.path}`,
    description: 'Ask a question and stream the answer. No credential needed.',
    authentication: `No credential. Send ${Object.entries(ANSWER_THREAD_AGENT_ENTRYPOINT.requiredHeaders)
      .map(([name, value]) => `${name}: ${value}`)
      .join('; ')}.`,
  },
  {
    title: `${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.method} ${CUSTOMER_REQUEST_AGENT_ENTRYPOINT.path}`,
    description: 'Open a Customer Request and carry it through comparison, approval, and execution.',
    authentication: 'Needs an assistant key you approve',
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
            <Button asChild variant="default" className="min-h-11"><a href="/llms.txt">Read llms.txt</a></Button>
            <Button asChild variant="secondary" className="min-h-11"><a href="/SKILL.md">Read SKILL.md</a></Button>
          </>
        }
      />
      <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 pb-16 md:px-6">
        <AeAssistantInstallFunnel canonicalBaseUrl={canonicalBaseUrl} />

        <section aria-labelledby="agent-read-surfaces" className="grid gap-4">
          <div className="grid gap-1">
            <h2 id="agent-read-surfaces" className="text-xl font-semibold text-foreground">What your agent can read</h2>
            <p className="block max-w-3xl text-muted-foreground">
              Every published fact is available as a document your agent can fetch without a key.
            </p>
          </div>
          <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
            {readSurfaces.map((surface) => (
              <li key={surface.href}>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="font-mono text-base text-foreground">{surface.title}</CardTitle>
                    <CardDescription>{surface.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Button asChild variant="secondary" size="sm" className="min-h-11">
                      <a href={surface.href}>Open {surface.title}</a>
                    </Button>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="agent-call-surfaces" className="grid gap-4">
          <div className="grid gap-1">
            <h2 id="agent-call-surfaces" className="text-xl font-semibold text-foreground">What your agent can call</h2>
            <p className="block max-w-3xl text-muted-foreground">
              Answers are open. Anything that commits a person stays behind access they approved and can revoke.
            </p>
          </div>
          <ul className="m-0 grid list-none gap-3 p-0 md:grid-cols-2">
            {callSurfaces.map((surface) => (
              <li key={surface.title}>
                <Card className="h-full">
                  <CardHeader>
                    <CardTitle className="font-mono text-base text-foreground">{surface.title}</CardTitle>
                    <CardDescription>{surface.description}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <p className="block text-sm text-muted-foreground">{surface.authentication}</p>
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
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
