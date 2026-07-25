import { Collapsible } from '@astryxdesign/core/Collapsible'
import { Text } from '@astryxdesign/core/Text'

import type { CustomerRoute } from '../../workspace-types'
import {
  FactBlock,
  effectLabel,
  readableLabel,
  reversibilityLabel,
  uncertaintyLabel,
} from '../shared'

/**
 * Disclosure content for one route, split so a surface can choose how much to
 * show at once. DESIGN.md keeps technical projections in progressive detail;
 * the decision surface shows the sections a person needs to choose, and parks
 * the rest behind an on-demand trigger. Nothing here is ever dropped — the
 * collapsed sections stay mounted and reachable.
 */

export function SharingSummary({ route }: { route: CustomerRoute }) {
  const recipients = route.dataUse.recipients
  if (recipients.length === 0) return <Text color="secondary">Nothing</Text>
  const fieldCount = recipients.reduce((total, recipient) => total + recipient.fields.length, 0)
  return <Text color="secondary">
    {fieldCount} {fieldCount === 1 ? 'detail' : 'details'} to {recipients.map(({ name }) => name).join(', ')}
  </Text>
}

export function SharingDetail({ route, emptyLabel }: { route: CustomerRoute; emptyLabel: string }) {
  return <FactBlock label="What you share">
    {route.dataUse.recipients.length === 0
      ? <Text color="secondary">{emptyLabel}</Text>
      : <ul className="grid gap-2 text-sm text-secondary">
          {route.dataUse.recipients.map((recipient) => <li key={recipient.recipientRef}>
            <strong>{recipient.name}</strong> — {recipient.purposes.map(readableLabel).join(', ')}. Fields: {recipient.fields.map(({ label, classification }) => `${label} (${classification})`).join(', ')}
          </li>)}
        </ul>}
  </FactBlock>
}

export function EffectsDetail({ route, label }: { route: CustomerRoute; label: string }) {
  return <FactBlock label={label}>
    {route.effects.length === 0
      ? <Text color="secondary">No external change is declared.</Text>
      : <ul className="grid gap-1 text-sm text-secondary">
          {route.effects.map((effect) => <li key={`${effect.kind}:${effect.reversibility}`}>
            {effectLabel(effect.kind)} — {reversibilityLabel(effect.reversibility)}
          </li>)}
        </ul>}
  </FactBlock>
}

export function CancellationDetail({ route }: { route: CustomerRoute }) {
  return <FactBlock label="Cancellation">
    <Text color="secondary">{route.cancellation.summary}</Text>
  </FactBlock>
}

export function UncertaintyDetail({ route, subject }: { route: CustomerRoute; subject: string }) {
  return <FactBlock label="What remains uncertain">
    <Text color="secondary">{route.uncertainty.length === 0
      ? `No uncertainty is declared for this ${subject}.`
      : route.uncertainty.map(uncertaintyLabel).join(', ')}</Text>
    <Text type="supporting" color="secondary">{route.comparison.duration === 'not_declared'
      ? 'Completion timing has not been declared.'
      : route.comparison.duration}</Text>
  </FactBlock>
}

export function CommercialDetail({ route }: { route: CustomerRoute }) {
  const influence = route.comparison.commercialInfluence
  return <FactBlock label="Commercial relationships">
    <Text color="secondary">{influence.status === 'unknown'
      ? 'AE does not have enough commercial relationship evidence to recommend this option.'
      : influence.status === 'none'
        ? 'No registered commercial relationship affects this option.'
        : influence.summaries.join(' ')}</Text>
  </FactBlock>
}

export function RecoveryDetail({ route }: { route: CustomerRoute }) {
  return <FactBlock label="If something goes wrong">
    <ul className="grid gap-1 text-sm text-secondary">
      {route.recovery.map((recovery) => <li key={recovery.step}>
        Step {recovery.step}, {recovery.businessName}: {recovery.posture === 'retry_safe'
          ? 'AE can safely retry after a confirmed failure.'
          : 'AE must check what happened before any retry.'}
      </li>)}
    </ul>
    <Text type="supporting" color="secondary">{route.fallback.available
      ? `${route.fallback.alternatives.length} alternative ${route.fallback.alternatives.length === 1 ? 'way is' : 'ways are'} available before confirmation.`
      : 'No alternative way is currently declared.'}</Text>
  </FactBlock>
}

export function EvidenceDetail({ route }: { route: CustomerRoute }) {
  return <FactBlock label="Evidence expected">
    <Text color="secondary">{route.evidence.map(({ label }) => label).join(', ') || 'No completion evidence is declared.'}</Text>
  </FactBlock>
}

/**
 * Everything AE has registered about this route, behind one trigger. The
 * collapsed label names what is inside so the surface stays scannable without
 * opening it.
 */
export function FullRouteDisclosure({ route, subject }: { route: CustomerRoute; subject: string }) {
  return <Collapsible
    defaultIsOpen={false}
    trigger={<span className="text-base font-semibold">Uncertainty, commercial relationships, recovery, and evidence</span>}
  >
    <div className="grid gap-5 pt-4">
      <UncertaintyDetail route={route} subject={subject} />
      <CommercialDetail route={route} />
      <RecoveryDetail route={route} />
      <EvidenceDetail route={route} />
      <Text type="supporting" color="secondary">Choice code {route.quoteDigest}</Text>
    </div>
  </Collapsible>
}

/** Flat stack of every section, for surfaces that compare rather than decide. */
export function RouteDisclosureDetails({ route }: { route: CustomerRoute }) {
  return <>
    <SharingDetail route={route} emptyLabel="This way forward shares nothing." />
    <EffectsDetail route={route} label="What this changes" />
    <UncertaintyDetail route={route} subject="way forward" />
    <CommercialDetail route={route} />
    <RecoveryDetail route={route} />
    <CancellationDetail route={route} />
    <EvidenceDetail route={route} />
  </>
}
