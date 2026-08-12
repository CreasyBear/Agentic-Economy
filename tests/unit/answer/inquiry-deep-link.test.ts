import { describe, expect, it, vi } from 'vitest'
import type {
  projectCurrentOfferingInquiryDetail as ProjectCurrentOfferingInquiryDetail,
} from '@/modules/registry/public-inquiry-projection'
import type { PublicBusinessCatalogV2DetailResult } from '@/modules/registry/public'
import type { KeylessExecutableSourcePort } from '@/modules/capability-execution'
import { runAnswerToolUseAgent } from '@/modules/answer/server'
import {
  getPublicBusinessOfferingSupplyBySlug,
  listPublicBusinessOfferingSupply,
  resolvePublishedInquiryTarget,
  searchPublicBusinessOfferingSupply,
} from '@/modules/registry/public'
import { setPublicRegistrySourcePortForTests } from '@/modules/registry/registry.functions'
import { createLocalE2eRegistrySourceState } from '../../helpers/registry-local-e2e'

import {
  openRouterToolThenProseResponses,
  startOpenRouterContractServer,
} from '../../helpers/openrouter-contract-server'
type PublicInquiryProjectionModule = Readonly<{
  projectCurrentOfferingInquiryDetail: typeof ProjectCurrentOfferingInquiryDetail
}>
type PublicInquiryProjectionDependencies = NonNullable<
  Parameters<typeof ProjectCurrentOfferingInquiryDetail>[1]
>
type PublicInquiryAvailabilityReader = PublicInquiryProjectionDependencies['readAvailability']
type PublicInquiryAvailabilityTargets = Parameters<PublicInquiryAvailabilityReader>[0]
type PublicInquiryAvailabilityTarget = PublicInquiryAvailabilityTargets[number]

vi.mock('@/modules/registry/public-inquiry-projection', async (importOriginal) => {
  const actual = await importOriginal<PublicInquiryProjectionModule>()
  return {
    ...actual,
    projectCurrentOfferingInquiryDetail: (
      detail: PublicBusinessCatalogV2DetailResult,
    ) => actual.projectCurrentOfferingInquiryDetail(detail, {
      readAvailability: async (
        targets: PublicInquiryAvailabilityTargets,
      ) => targets.map((target: PublicInquiryAvailabilityTarget) => ({
        ...target,
        admitted: target.businessSlug === 'joondalup-rapid-plumbing',
      })),
    }),
  }
})

const emptyKeylessDataAsk = {
  kind: 'resolved' as const,
  descriptors: [],
  candidates: [],
}

const emptyKeylessSource: KeylessExecutableSourcePort = {
  list: async () => [],
  read: async () => null,
  search: async () => [],
}

function installFixtureRegistry(): () => void {
  const state = createLocalE2eRegistrySourceState()
  return setPublicRegistrySourcePortForTests({
    list: (input) => Promise.resolve(listPublicBusinessOfferingSupply(state, input)),
    search: (input) => Promise.resolve(searchPublicBusinessOfferingSupply(state, input)),
    detail: (input) => Promise.resolve(getPublicBusinessOfferingSupplyBySlug(state, input)),
    resolveInquiryTarget: (input) => Promise.resolve(resolvePublishedInquiryTarget(state, input)),
  })
}

/**
 * `inquiryAdmission: 'admitted'`. It also publishes a phone number, so it is
 * the case that proves both facts survive the Offering projection as separate
 * reachability paths: phone stays published and AE inquiry remains a deep link.
 */
describe('tool-use agent inquiry deep links', () => {
  it('surfaces inquiryUrl for an admitted business that also publishes a phone number', async () => {
    const server = await startOpenRouterContractServer(openRouterToolThenProseResponses({
      toolCalls: [{ toolId: 'registry.detail', input: { slug: 'joondalup-rapid-plumbing' } }],
      prose: {
        oneLine: 'One listed business matches this need.',
        summary:
          'The listing publishes inquiry options. Scope, price, and current availability still need confirmation.',
        whatToDoNow: 'Contact the business and ask whether it handles the work, what it costs, and when it is available.',
      },
    }))
    const restoreOpenRouter = server.installEnv()
    const previousLocalRegistry = process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
    const previousConvexUrl = process.env.CONVEX_URL
    const previousPublicConvexUrl = process.env.VITE_CONVEX_URL
    process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = 'true'
    delete process.env.CONVEX_URL
    delete process.env.VITE_CONVEX_URL
    const restoreRegistry = installFixtureRegistry()
    try {
      const result = await runAnswerToolUseAgent({
        query: 'plumbing',
        keylessDataAsk: emptyKeylessDataAsk,
        keylessExecutableSource: emptyKeylessSource,
      })
      const provider = result.providers.find((candidate) => candidate.slug === 'joondalup-rapid-plumbing')
      expect(provider?.inquiryUrl).toBe('/joondalup-rapid-plumbing/inquiry')
      expect(provider?.nextStepLabel).toBe('Send inquiry')
      expect(provider?.publishedPhone).toBe('0412 345 678')
    } finally {
      restoreRegistry()
      restoreOpenRouter()
      await server.close()
      if (previousLocalRegistry === undefined) {
        delete process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E
      } else {
        process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E = previousLocalRegistry
      }
      if (previousConvexUrl === undefined) {
        delete process.env.CONVEX_URL
      } else {
        process.env.CONVEX_URL = previousConvexUrl
      }
      if (previousPublicConvexUrl === undefined) {
        delete process.env.VITE_CONVEX_URL
      } else {
        process.env.VITE_CONVEX_URL = previousPublicConvexUrl
      }
    }
  })
})
