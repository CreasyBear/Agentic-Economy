import { useId, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'

import type { CustomerRoute } from '../../workspace-types'
import {
  FactBlock,
  effectLabel,
  readableLabel,
  reversibilityLabel,
  uncertaintyLabel,
} from '../shared'

export function RouteDisclosure({ trigger, children, defaultIsOpen = true }: Readonly<{
  trigger: ReactNode
  children: ReactNode
  defaultIsOpen?: boolean
}>) {
  const [isOpen, setIsOpen] = useState(defaultIsOpen)
  const contentId = `route-disclosure-${useId().replaceAll(':', '')}`
  return (
    <div>
      <Button
        type="button"
        variant="ghost"
        aria-expanded={isOpen}
        aria-controls={contentId}
        onClick={() => setIsOpen((current) => !current)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-md px-2 text-left font-semibold"
      >
        <span>{trigger}</span>
        <span aria-hidden="true">{isOpen ? '−' : '+'}</span>
      </Button>
      <div id={contentId} className="pt-1">
        {children}
      </div>
    </div>
  )
}

export function SharingSummary({ route }: { route: CustomerRoute }) {
  const recipients = route.dataUse.recipients
  if (recipients.length === 0) return <p className="text-muted-foreground">Nothing</p>
  const fieldCount = recipients.reduce((total, recipient) => total + recipient.fields.length, 0)
  return <p className="text-muted-foreground">
    {fieldCount} {fieldCount === 1 ? 'detail' : 'details'} to {recipients.map(({ name }) => name).join(', ')}
  </p>
}

export function SharingDetail({ route, emptyLabel }: { route: CustomerRoute; emptyLabel: string }) {
  return <FactBlock label="What you share">
    {route.dataUse.recipients.length === 0
      ? <p className="text-muted-foreground">{emptyLabel}</p>
      : <ul className="grid gap-2 text-sm text-muted-foreground">
          {route.dataUse.recipients.map((recipient) => <li key={recipient.recipientRef}>
            <strong>{recipient.name}</strong> — {recipient.purposes.map(readableLabel).join(', ')}. Fields: {recipient.fields.map(({ label, classification }) => `${label} (${classification})`).join(', ')}
          </li>)}
        </ul>}
  </FactBlock>
}

export function EffectsDetail({ route, label }: { route: CustomerRoute; label: string }) {
  return <FactBlock label={label}>
    {route.effects.length === 0
      ? <p className="text-muted-foreground">No external change is declared.</p>
      : <ul className="grid gap-1 text-sm text-muted-foreground">
          {route.effects.map((effect) => <li key={`${effect.kind}:${effect.reversibility}`}>
            {effectLabel(effect.kind)} — {reversibilityLabel(effect.reversibility)}
          </li>)}
        </ul>}
  </FactBlock>
}

export function CancellationDetail({ route }: { route: CustomerRoute }) {
  return <FactBlock label="Cancellation">
    <p className="text-muted-foreground">{route.cancellation.summary}</p>
  </FactBlock>
}

export function UncertaintyDetail({ route, subject }: { route: CustomerRoute; subject: string }) {
  return <FactBlock label="What remains uncertain">
    <p className="text-muted-foreground">{route.uncertainty.length === 0
      ? `No uncertainty is declared for this ${subject}.`
      : route.uncertainty.map(uncertaintyLabel).join(', ')}</p>
    <p className="text-sm text-muted-foreground">{route.comparison.duration === 'not_declared'
      ? 'Completion timing has not been declared.'
      : route.comparison.duration}</p>
  </FactBlock>
}

export function CommercialDetail({ route }: { route: CustomerRoute }) {
  const influence = route.comparison.commercialInfluence
  return <FactBlock label="Commercial relationships">
    <p className="text-muted-foreground">{influence.status === 'unknown'
      ? 'AE does not have enough commercial relationship evidence to recommend this option.'
      : influence.status === 'none'
        ? 'No registered commercial relationship affects this option.'
        : influence.summaries.join(' ')}</p>
  </FactBlock>
}

export function RecoveryDetail({ route }: { route: CustomerRoute }) {
  return <FactBlock label="If something goes wrong">
    <ul className="grid gap-1 text-sm text-muted-foreground">
      {route.recovery.map((recovery) => <li key={recovery.step}>
        Step {recovery.step}, {recovery.businessName}: {recovery.posture === 'retry_safe'
          ? 'AE can safely retry after a confirmed failure.'
          : 'AE must check what happened before any retry.'}
      </li>)}
    </ul>
    <p className="text-sm text-muted-foreground">{route.fallback.available
      ? `${route.fallback.alternatives.length} alternative ${route.fallback.alternatives.length === 1 ? 'way is' : 'ways are'} available before confirmation.`
      : 'No alternative way is currently declared.'}</p>
  </FactBlock>
}

export function EvidenceDetail({ route }: { route: CustomerRoute }) {
  return <FactBlock label="Evidence expected">
    <p className="text-muted-foreground">{route.evidence.map(({ label }) => label).join(', ') || 'No completion evidence is declared.'}</p>
  </FactBlock>
}

export function FullRouteDisclosure({ route, subject }: { route: CustomerRoute; subject: string }) {
  return <RouteDisclosure
    defaultIsOpen={false}
    trigger={<span className="text-base font-semibold">Uncertainty, commercial relationships, recovery, and evidence</span>}
  >
    <div className="grid gap-5 pt-4">
      <UncertaintyDetail route={route} subject={subject} />
      <CommercialDetail route={route} />
      <RecoveryDetail route={route} />
      <EvidenceDetail route={route} />
      <p className="text-sm text-muted-foreground">Choice code {route.quoteDigest}</p>
    </div>
  </RouteDisclosure>
}

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
