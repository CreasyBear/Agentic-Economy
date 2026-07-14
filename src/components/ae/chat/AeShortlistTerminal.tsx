import { useState } from 'react'

import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'

import { emitWave1JourneyEvent, getOrCreatePseudonymousJourneyId } from '@/lib/ui/journey-events'
import { shortlistSemanticRevision } from '@/lib/ui/shortlist-export'

import type { AnswerArtifact, AnswerSource } from '@/modules/answer/public'
import type { NeedTiming } from '@/modules/answer/search-context'

import { AeExportPreview } from './AeExportPreview'
export type ShortlistTerminal = {
  providers: readonly AnswerSource[]
  timing: NeedTiming | undefined
}

type AeShortlistTerminalProps = ShortlistTerminal & {
  threadId?: string
  revision?: string
  sourceAt?: string
  onChangeCriteria?: () => void
}

export function AeShortlistTerminal({
  providers,
  timing,
  threadId = 'shortlist',
  revision = 'shortlist:current',
  sourceAt,
  onChangeCriteria,
}: AeShortlistTerminalProps) {
  const [closed, setClosed] = useState(false)
  const [exportPreviewOpen, setExportPreviewOpen] = useState(false)
  const firstBusiness = providers.at(0)
  const publishedPhone = firstBusiness?.publishedPhone
  const callHref = directCallHref(firstBusiness)
  const urgentBusiness = timing === 'today' ? providers.find((provider) => directCallHref(provider) !== undefined) : undefined
  const urgentPhone = urgentBusiness?.publishedPhone
  const urgentCallHref = directCallHref(urgentBusiness)
  const semanticRevision = shortlistSemanticRevision(revision, providers)
  const urgentContact = urgentBusiness !== undefined && urgentPhone !== undefined && urgentCallHref !== undefined
    ? (
        <div className="grid gap-3 rounded-md border border-border bg-body p-4" aria-label="Call first option">
          <div className="grid gap-1">
            <Text type="large" weight="semibold" color="primary" display="block">{urgentBusiness.name}</Text>
            <Text type="supporting" color="secondary" display="block">No reply history yet</Text>
          </div>
          <Button label={`Call ${urgentPhone}`} variant="primary" className="min-h-11 justify-self-start" href={urgentCallHref} />
        </div>
      )
    : null
  if (closed) {
    return (
      <section className="grid gap-3 rounded-lg border border-border bg-surface p-4" aria-labelledby="shortlist-closed-heading">
        <Heading id="shortlist-closed-heading" level={2} className="text-xl font-semibold">Shortlist closed</Heading>
        <Text color="secondary" role="status">Nothing was sent.</Text>
        <Button label="Return home" variant="secondary" className="min-h-11 justify-self-start" href="/" />
      </section>
    )
  }

  function openExportPreview() {
    setExportPreviewOpen(true)
    try {
      emitWave1JourneyEvent({
        event: 'export_preview_opened',
        eventVersion: 1,
        journey: 'J2',
        pseudonymousJourneyId: getOrCreatePseudonymousJourneyId('J2', threadId),
      })
    } catch {
      // Measurement is best effort and must never block the preview.
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-surface p-4" aria-labelledby="shortlist-terminal-heading">
      {urgentContact}
      <div className="grid gap-1">
        <Heading id="shortlist-terminal-heading" level={2} className="text-xl font-semibold">
          Your shortlist is ready
        </Heading>
        <Text color="secondary">
          {timing === 'today'
            ? 'For today, listings with a published contact path appear first. Phone details are shown only when published.'
            : 'Compare the listed facts, then open a business page when you are ready.'}
        </Text>
      </div>
      <div className="flex flex-col gap-2 min-[376px]:flex-row min-[376px]:flex-wrap" aria-label="Shortlist actions">
        <Button
          label="Change criteria"
          type="button"
          variant="secondary"
          className="min-h-11"
          isDisabled={onChangeCriteria === undefined}
          {...(onChangeCriteria === undefined ? {} : { onClick: onChangeCriteria })}
        />
        <Button label="Open" variant="secondary" className="min-h-11" href={firstBusiness?.detailUrl ?? '/registry'} />
        <Button label="Copy" type="button" variant="secondary" className="min-h-11" isDisabled={providers.length === 0} onClick={openExportPreview} />
        {callHref === undefined
          ? <Button label="Call" type="button" variant="secondary" className="min-h-11" isDisabled />
          : <Button label={`Call ${publishedPhone}`} variant="secondary" className="min-h-11" href={callHref} />}
        <Button label="Close" type="button" variant="ghost" className="min-h-11" onClick={() => setClosed(true)} />
      </div>
      {callHref === undefined
        ? <Text type="supporting" color="secondary">Call is unavailable until a business publishes a phone number here.</Text>
        : <Text type="supporting" color="secondary">Calls go directly to the published business number.</Text>}
      <AeExportPreview
        isOpen={exportPreviewOpen}
        onOpenChange={setExportPreviewOpen}
        threadId={threadId}
        revision={semanticRevision}
        providers={providers}
        {...(sourceAt === undefined ? {} : { sourceAt })}
      />
    </section>
  )
}

export function settledShortlistFromArtifacts(
  artifacts: readonly AnswerArtifact[],
  timing: NeedTiming | undefined,
): ShortlistTerminal | null {
  const shortlistArtifacts = artifacts.filter(
    (artifact) => artifact.kind === 'provider-cards' || artifact.kind === 'provider-compare-table',
  )
  const providers = providersFromArtifacts(shortlistArtifacts)
  if (providers.length === 0) return null
  return { providers: orderProviders(providers, timing), timing }
}

export function orderShortlistArtifacts(
  artifacts: readonly AnswerArtifact[],
  timing: NeedTiming | undefined,
): readonly AnswerArtifact[] {
  if (timing !== 'today') return artifacts
  return artifacts.map((artifact) => {
    if (artifact.kind === 'provider-cards' || artifact.kind === 'provider-compare-table') {
      return { ...artifact, providers: orderProviders(artifact.providers, timing) }
    }
    return artifact
  })
}

function providersFromArtifacts(artifacts: readonly AnswerArtifact[]): readonly AnswerSource[] {
  const bySlug = new Map<string, AnswerSource>()
  for (const artifact of artifacts) {
    if (artifact.kind === 'provider-cards' || artifact.kind === 'provider-compare-table') {
      for (const provider of artifact.providers) bySlug.set(provider.slug, provider)
    }
  }
  return [...bySlug.values()]
}

function orderProviders(providers: readonly AnswerSource[], timing: NeedTiming | undefined): readonly AnswerSource[] {
  if (timing !== 'today') return providers
  return providers
    .map((provider, index) => ({ provider, index }))
    .sort((left, right) => contactPriority(right.provider) - contactPriority(left.provider) || left.index - right.index)
    .map(({ provider }) => provider)
}

function contactPriority(provider: AnswerSource): number {
  if (directCallHref(provider) !== undefined) return 2
  return typeof provider.inquiryUrl === 'string' && provider.inquiryUrl.length > 0 ? 1 : 0
}

function directCallHref(provider: AnswerSource | undefined): string | undefined {
  const dialNumber = provider?.publishedPhone?.replace(/[^+\d]/g, '')
  return dialNumber !== undefined && /\d{6,}/.test(dialNumber) ? `tel:${dialNumber}` : undefined
}

