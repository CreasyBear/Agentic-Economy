import {
  buildAgentJsonUrl,
  buildInquiryHandoffNextStep,
  buildInquiryHandoffOneLine,
  buildInquiryHandoffSummary,
  inquiryHandoffProviders,
  resolveInquiryHandoff,
} from '@/modules/answer/public'

import { finalizeAnswerTurnSnapshot } from '../answer-turn-safety'
import {
  DEFAULT_TURN_PROVIDER_LIMIT,
  rejectBlockedSnapshot,
  reindexProviders,
  withFollowUpLayout,
  type TurnPath,
  type TurnPathContext,
  type TurnPathResult,
} from './types'

export const inquiryHandoffTurnPath: TurnPath = {
  id: 'inquiry_handoff',
  async run(ctx) {
    return streamInquiryHandoffTurn(ctx)
  },
}

async function streamInquiryHandoffTurn(
  ctx: TurnPathContext,
): Promise<TurnPathResult> {
  const priorProviders = reindexProviders(ctx.priorProviders)
  const resolution = resolveInquiryHandoff({ query: ctx.query, providers: priorProviders })
  const providers = reindexProviders(inquiryHandoffProviders(resolution))
  const selectedProvider =
    resolution.kind === 'resolved' || resolution.kind === 'provider_unavailable'
      ? resolution.provider
      : undefined
  const routeStartedAt = Date.now()

  ctx.workLog.emit({
    id: 'route.resolve_provider',
    phase: 'route',
    status: 'running',
    title: 'Resolving provider',
    summary: 'Matching the follow-up to a listed business already in this thread.',
    detailRows: [{ label: 'Listed businesses in thread', value: String(priorProviders.length) }],
    relatedProviderSlugs: priorProviders.map((provider) => provider.slug),
    startedAtMs: routeStartedAt,
  })
  ctx.workLog.emit({
    id: 'route.resolve_provider',
    phase: 'route',
    status: selectedProvider === undefined && resolution.kind !== 'choose_provider' ? 'skipped' : 'complete',
    title: 'Resolving provider',
    summary: describeInquiryHandoffResolution(resolution),
    detailRows: [
      { label: 'Listed businesses in thread', value: String(priorProviders.length) },
      { label: 'Selected business', value: selectedProvider?.name ?? 'Needs selection' },
    ],
    relatedProviderSlugs: providers.map((provider) => provider.slug),
    startedAtMs: routeStartedAt,
    completedAtMs: Date.now(),
  })

  const pathStartedAt = Date.now()
  ctx.workLog.emit({
    id: 'route.inquiry_path',
    phase: 'route',
    status: 'running',
    title: 'Checking inquiry path',
    summary: 'Checking whether the selected listing publishes a qualified inquiry form.',
    relatedProviderSlugs: providers.map((provider) => provider.slug),
    startedAtMs: pathStartedAt,
  })
  ctx.workLog.emit({
    id: 'route.inquiry_path',
    phase: 'route',
    status: resolution.kind === 'resolved' ? 'complete' : 'skipped',
    title: 'Checking inquiry path',
    summary: describeInquiryPath(resolution),
    detailRows: [{ label: 'Inquiry path', value: inquiryPathLabel(resolution) }],
    relatedProviderSlugs: providers.map((provider) => provider.slug),
    startedAtMs: pathStartedAt,
    completedAtMs: Date.now(),
  })

  const boundaryStartedAt = Date.now()
  ctx.workLog.emit({
    id: 'route.safe_boundary',
    phase: 'route',
    status: 'complete',
    title: 'Checking safe-action boundary',
    summary: 'AE can route a qualified inquiry for owner review; it does not book, charge, or dispatch.',
    detailRows: [{ label: 'Allowed next step', value: 'Qualified inquiry for owner review' }],
    relatedProviderSlugs: providers.map((provider) => provider.slug),
    startedAtMs: boundaryStartedAt,
    completedAtMs: Date.now(),
  })

  const snapshot = withFollowUpLayout(
    {
      query: ctx.query,
      oneLine: buildInquiryHandoffOneLine(resolution),
      providers,
      ...(selectedProvider === undefined ? {} : { selectedProvider }),
      summary: buildInquiryHandoffSummary(resolution),
      nextStep: buildInquiryHandoffNextStep(resolution),
      agentJsonUrl: buildAgentJsonUrl(ctx.query, DEFAULT_TURN_PROVIDER_LIMIT),
    },
    ctx.priorTurnsCount,
    ctx.intent,
  )

  const allowedSlugs = new Set(ctx.priorAllowedSlugs)
  const finalized = finalizeAnswerTurnSnapshot({ snapshot, allowedSlugs })
  if (!finalized.ok) {
    return rejectBlockedSnapshot(ctx, [], allowedSlugs, finalized)
  }
  const assembly = await ctx.emitOrDeferSnapshot(finalized.snapshot, 'inquiry_handoff', { planMode: 'boundary' })
  return {
    snapshot: finalized.snapshot,
    toolCalls: [],
    allowedSlugs,
    errorCopyId: undefined,
    gate: finalized.gate,
    ...(assembly === undefined ? {} : { assembly }),
  }
}

function describeInquiryHandoffResolution(resolution: ReturnType<typeof resolveInquiryHandoff>): string {
  switch (resolution.kind) {
    case 'resolved':
      return `${resolution.provider.name} was selected from the latest listed businesses.`
    case 'provider_unavailable':
      return `${resolution.provider.name} was selected, but it does not publish an AE inquiry form yet.`
    case 'choose_provider':
      return 'More than one listed business could match; the user needs to choose one.'
    case 'no_provider':
      return 'No listed business is available in the latest answer thread.'
    default: {
      const _exhaustive: never = resolution
      return _exhaustive
    }
  }
}

function describeInquiryPath(resolution: ReturnType<typeof resolveInquiryHandoff>): string {
  switch (resolution.kind) {
    case 'resolved':
      return `${resolution.provider.name} publishes a qualified inquiry path.`
    case 'provider_unavailable':
      return `${resolution.provider.name} does not publish an AE inquiry form yet.`
    case 'choose_provider':
      return 'Choose a business before opening an inquiry path.'
    case 'no_provider':
      return 'Find a listed business before opening an inquiry path.'
    default: {
      const _exhaustive: never = resolution
      return _exhaustive
    }
  }
}

function inquiryPathLabel(resolution: ReturnType<typeof resolveInquiryHandoff>): string {
  switch (resolution.kind) {
    case 'resolved':
      return 'Available'
    case 'provider_unavailable':
      return 'Not published'
    case 'choose_provider':
      return 'Needs business selection'
    case 'no_provider':
      return 'Needs listed business'
    default: {
      const _exhaustive: never = resolution
      return _exhaustive
    }
  }
}
