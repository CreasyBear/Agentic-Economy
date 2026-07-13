import { useState } from 'react'

import { Button } from '@astryxdesign/core/Button'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'

import type { AnswerArtifact, AnswerSource } from '@/modules/answer/public'
import type { NeedTiming } from '@/modules/answer/search-context'

export type ShortlistTerminal = {
  providers: readonly AnswerSource[]
  timing: NeedTiming | undefined
}

type AeShortlistTerminalProps = ShortlistTerminal & {
  onChangeCriteria?: () => void
}

export function AeShortlistTerminal({ providers, timing, onChangeCriteria }: AeShortlistTerminalProps) {
  const [copyStatus, setCopyStatus] = useState<'idle' | 'copied' | 'error'>('idle')
  const firstBusiness = providers.at(0)

  async function copyShortlist() {
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(shortlistCopy(providers, window.location.origin))
      setCopyStatus('copied')
    } catch {
      setCopyStatus('error')
    }
  }

  return (
    <section className="grid gap-4 rounded-lg border border-border bg-surface p-4" aria-labelledby="shortlist-terminal-heading">
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
        <Button label="Copy" type="button" variant="secondary" className="min-h-11" isDisabled={providers.length === 0} onClick={() => void copyShortlist()} />
        <Button label="Call" type="button" variant="secondary" className="min-h-11" isDisabled />
        <Button label="Close" variant="ghost" className="min-h-11" href="/" />
      </div>
      {copyStatus === 'idle' ? null : (
        <Text type="supporting" color="secondary" role="status">
          {copyStatus === 'copied' ? 'Shortlist copied.' : 'The shortlist could not be copied.'}
        </Text>
      )}
      <Text type="supporting" color="secondary">Call is unavailable until a business publishes a phone number here.</Text>
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
    .sort((left, right) => Number(hasActionableContact(right.provider)) - Number(hasActionableContact(left.provider)) || left.index - right.index)
    .map(({ provider }) => provider)
}

function hasActionableContact(provider: AnswerSource): boolean {
  return typeof provider.inquiryUrl === 'string' && provider.inquiryUrl.length > 0
}

function shortlistCopy(providers: readonly AnswerSource[], origin: string): string {
  return providers
    .map((provider) => {
      const location = [provider.suburb, provider.stateTerritory].filter(Boolean).join(', ')
      const businessPage = new URL(provider.detailUrl, origin).toString()
      return `${provider.name}\nLocation: ${location || 'Location not published'}\nBusiness page: ${businessPage}`
    })
    .join('\n\n')
}
