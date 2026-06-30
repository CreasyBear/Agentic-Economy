import type { ReactNode } from 'react'

import {
  artifactsToMessageParts,
  inferLayoutProfileFromArtifacts,
  type AnswerLayoutProfile,
  type AnswerMessagePart,
} from '@/modules/answer/public'
import type { AnswerArtifact, AnswerSource } from '@/modules/answer/public'
import { AeProviderSourceCard } from '@/components/ae/landing/AeProviderSourceCard'
import { AeAgentJsonAffordance } from '@/components/ae/landing/AeAgentJsonAffordance'
import { AeStreamingLabel } from '@/components/ae/chat/AeStreamingLabel'
import { AeGenerativeMap } from './AeGenerativeMap'
import { AeProtectedByAe } from './AeProtectedByAe'

export type AeGenerativeAnswerPhase =
  | 'idle'
  | 'streaming'
  | 'reconnecting'
  | 'complete'
  | 'stopped'
  | 'error'

export type AeGenerativeAnswerProps = {
  artifacts: readonly AnswerArtifact[]
  query: string
  layoutProfile?: AnswerLayoutProfile
  busy?: boolean
  oneLineFallback?: string
  onStop?: () => void
  phase?: AeGenerativeAnswerPhase
  errorMessage?: ReactNode | null
}

export function AeGenerativeAnswer({
  artifacts,
  query,
  layoutProfile,
  busy = false,
  oneLineFallback = '',
  onStop,
  phase = 'idle',
  errorMessage = null,
}: AeGenerativeAnswerProps) {
  const profile = inferLayoutProfileFromArtifacts({
    artifacts,
    ...(layoutProfile === undefined ? {} : { layoutProfile }),
    busy,
  })

  const parts = artifactsToMessageParts(artifacts, profile)
  const oneLinePart = parts.find((part) => part.kind === 'one-line')
  const headline =
    oneLinePart?.kind === 'one-line'
      ? oneLinePart.text
      : oneLineFallback.length > 0
        ? oneLineFallback
        : ''

  const providerCards = artifacts.find((artifact) => artifact.kind === 'provider-cards')
  const providerCount = providerCards?.kind === 'provider-cards' ? providerCards.providers.length : 0
  const empty = phase === 'complete' && providerCount === 0
  const isFirstTurnProfile = profile === 'discovery_full' || profile === 'empty_state'

  return (
    <section
      className="ae-answer ae-generative-answer"
      data-phase={phase}
      data-profile={profile}
      data-empty={empty ? 'true' : 'false'}
      aria-busy={busy}
    >
      <div className="ae-answer__head">
        {headline.length > 0 ? (
          <p
            className={`ae-answer__one-line${isFirstTurnProfile ? '' : ' ae-answer__one-line--follow-up'}`}
            aria-live={busy ? 'polite' : 'off'}
          >
            {headline}
          </p>
        ) : busy ? (
          <p
            className="ae-answer__one-line ae-answer__one-line--thinking"
            aria-live="polite"
            aria-label="Finding listed providers"
          >
            <AeStreamingLabel as="span">Finding listed providers</AeStreamingLabel>
          </p>
        ) : (
          <p className="ae-answer__one-line ae-answer__one-line--placeholder">Finding listed providers</p>
        )}

        {phase === 'reconnecting' ? (
          <span className="ae-answer__reconnect" role="status">
            <AeStreamingLabel as="span">Reconnecting…</AeStreamingLabel>
          </span>
        ) : null}

        {busy && onStop !== undefined ? (
          <button type="button" className="ae-answer__stop" onClick={onStop} aria-label="Stop generating the answer">
            Stop
          </button>
        ) : null}
      </div>

      {phase === 'error' && errorMessage !== null ? (
        <div className="ae-answer__error" role="alert">
          <div>{errorMessage}</div>
        </div>
      ) : null}

      {parts.map((part, index) => (
        <AnswerPartView key={`${part.kind}-${index}`} part={part} query={query} empty={empty} phase={phase} />
      ))}

      {phase === 'complete' && !empty ? (
        <p className="sr-only" role="status">
          Answer ready.
        </p>
      ) : null}
    </section>
  )
}

function AnswerPartView({
  part,
  query,
  empty,
  phase,
}: {
  part: AnswerMessagePart
  query: string
  empty: boolean
  phase: AeGenerativeAnswerPhase
}) {
  switch (part.kind) {
    case 'one-line':
      return null
    case 'provider-cards':
      return <ProviderCardsRail providers={part.providers} scroll={part.scroll === true} />
    case 'location-map':
      return <AeGenerativeMap label={part.label} placeQuery={part.placeQuery} />
    case 'empty-state':
      return empty ? (
        <div className="ae-answer__empty" role="status">
          <p>{part.text}</p>
        </div>
      ) : null
    case 'prose':
      return !empty && part.text.length > 0 ? (
        <p className="ae-answer__summary" aria-live="off">
          {part.text}
        </p>
      ) : null
    case 'what-to-do-now':
      return !empty && part.text.length > 0 ? (
        part.compact === true ? (
          <p className="ae-answer__next-step ae-answer__next-step--compact">{part.text}</p>
        ) : (
          <p className="ae-answer__next-step">
            <span className="ae-answer__next-step-label">What to do now</span> {part.text}
          </p>
        )
      ) : null
    case 'protected-by-ae':
      return phase === 'complete' ? <AeProtectedByAe /> : null
    case 'agent-json':
      return phase === 'complete' ? (
        <AeAgentJsonAffordance agentJsonUrl={part.url} query={query} />
      ) : null
    default: {
      const _exhaustive: never = part
      void _exhaustive
      return null
    }
  }
}

function ProviderCardsRail({
  providers,
  scroll,
}: {
  providers: readonly AnswerSource[]
  scroll: boolean
}) {
  if (providers.length === 0) {
    return null
  }

  return (
    <ul
      className={`ae-answer__sources${scroll ? ' ae-answer__sources--scroll' : ''}`}
      aria-label="Cited local providers"
    >
      {providers.map((source) => (
        <li key={source.slug}>
          <AeProviderSourceCard source={source} />
        </li>
      ))}
    </ul>
  )
}
