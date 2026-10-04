import { Outlet, createFileRoute, useLocation } from '@tanstack/react-router'
import { KeyRound } from 'lucide-react'

import { AeAgentAccessHome } from '@/components/ae/agent-access/home/AeAgentAccessHome'
import { readCanonicalBaseUrlServer } from '@/lib/server/canonical-url.functions'
import { operatorRouteOptions } from '@/lib/operator/route-options'
import { readAgentDirectoryServer } from '@/lib/server/agent-access-console.functions'
import { readAgentOnboardingRequestServer } from '@/lib/server/agent-access-consent.functions'
import type { AgentAccessSearch } from '@/modules/agent-access/agent-lifecycle.view-model'
import type { AgentDirectoryProjection } from '@/modules/agent-access/agent-operator-view-model'
import { degrade } from '@/lib/observability/degrade'

const canonicalPrincipalIdPattern = /^prn_[0-9a-f]{32}$/u
const canonicalToolRefPattern = /^operation:v1:[0-9a-f]{64}$/u

export function validateAgentAccessSearch(search: Record<string, unknown>): AgentAccessSearch {
  const caller = typeof search.caller === 'string' ? search.caller.trim() : undefined
  const resumeTool = typeof search.resumeTool === 'string' ? search.resumeTool.trim() : undefined
  const setup = search.setup === 'choose' || search.setup === 'oauth' ? search.setup : undefined
  const grantRef = typeof search.grantRef === 'string' && search.grantRef.trim().length >= 3 && search.grantRef.length <= 160 ? search.grantRef.trim() : undefined
  const userCode = typeof search.userCode === 'string' && search.userCode.trim().length >= 3 && search.userCode.length <= 32 ? search.userCode.trim() : undefined
  const requestInvalid = search.grantRef !== undefined && search.userCode !== undefined
    || search.grantRef !== undefined && grantRef === undefined || search.userCode !== undefined && userCode === undefined
  const callRef = typeof search.callRef === 'string' && /^[a-zA-Z0-9_:.-]{1,500}$/u.test(search.callRef) ? search.callRef : undefined
  return {
    ...(caller !== undefined && canonicalPrincipalIdPattern.test(caller) ? { caller } : {}),
    ...(resumeTool !== undefined && canonicalToolRefPattern.test(resumeTool) ? { resumeTool } : {}),
    ...(setup === undefined ? {} : { setup }),
    ...(callRef === undefined ? {} : { callRef }),
    ...(search.callRef !== undefined && callRef === undefined ? { callInvalid: true as const } : {}),
    ...(requestInvalid ? { requestInvalid: true as const } : {
      ...(grantRef === undefined ? {} : { grantRef }), ...(userCode === undefined ? {} : { userCode }),
      ...((grantRef !== undefined || userCode !== undefined) && typeof search.state === 'string' && search.state.length <= 2048 ? { state: search.state } : {}),
    }),
  }
}

export const Route = createFileRoute('/_operator/agent-access')({
  staticData: {
    nav: {
      label: 'Agents',
      header: { order: 1, audience: 'signed-in' },
      operator: {
        roles: ['owner'],
        group: 'Buy',
        groupOrder: 0,
        order: 1,
        icon: KeyRound,
        tier: 'core',
        mobilePrimary: true,
        mobileOrder: 20,
      },
    },
  },
  ...operatorRouteOptions,
  validateSearch: validateAgentAccessSearch,
  loaderDeps: ({ search }) => ({ caller: search.caller, callRef: search.callRef, grantRef: search.grantRef, userCode: search.userCode }),
  loader: async ({ deps, location }) => {
    const onboarding = deps.grantRef !== undefined ? await readAgentOnboardingRequestServer({ data: { grantRef: deps.grantRef } })
      : deps.userCode !== undefined ? await readAgentOnboardingRequestServer({ data: { userCode: deps.userCode } }) : undefined
    const caller = onboarding?.kind === 'request' ? onboarding.principalRef : deps.caller
    const requestPending = (deps.grantRef !== undefined || deps.userCode !== undefined) && caller === undefined
    const refused = onboarding?.kind === 'refused' && onboarding.reason !== 'not_found'
    const empty: AgentDirectoryProjection = { items: [], details: [] }
    // Consent does not depend on unrelated directory/report enrichment. A
    // source outage is unknown progress, never an invitation to issue again.
    const [canonicalBaseUrl, readback] = await Promise.all([
      readCanonicalBaseUrlServer(),
      location.pathname !== '/agent-access' || requestPending || refused ? Promise.resolve({ directory: empty, directoryUnavailable: false })
        : readAgentDirectoryServer({ data: { ...(caller === undefined ? {} : { principalRef: caller }), ...(deps.callRef === undefined ? {} : { callRef: deps.callRef }) } })
          .then(directory => ({ directory, directoryUnavailable: false })).catch(cause => degrade(cause, { directory: empty, directoryUnavailable: true },
            { site: 'agentAccessLoader', reason: 'source_unavailable' })),
    ])
    return { canonicalBaseUrl, ...readback, onboarding }
  },
  head: () => ({ meta: [
    { title: 'Agents | Agentic Economy' },
    { name: 'robots', content: 'noindex' },
    { name: 'referrer', content: 'no-referrer' },
  ] }),
  headers: () => ({ 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }),
  component: AgentAccessRoute,
})

function AgentAccessRoute() {
  const location = useLocation()
  const loaded = Route.useLoaderData()
  const { canonicalBaseUrl, directory, onboarding } = loaded
  const search = Route.useSearch()
  if (location.pathname !== '/agent-access') return <Outlet />
  return (
    <AeAgentAccessHome
      canonicalBaseUrl={canonicalBaseUrl}
      initialDirectory={directory}
      initialDirectoryUnavailable={loaded.directoryUnavailable}
      {...(onboarding === undefined ? {} : { initialOnboarding: onboarding })}
      search={search}
    />
  )
}
