import { useState } from 'react'

import { Button } from '@/components/ui/button'

import { emitWave1JourneyEvent, getOrCreatePseudonymousJourneyId } from '@/lib/ui/journey-events'
import { shortlistSemanticRevision } from '@/lib/ui/shortlist-export'

import type { AnswerSource } from '@/modules/answer/public'
import type { NeedTiming } from '@/modules/answer/search-context'

import { AeExportPreview } from './AeExportPreview'
import { directCallHref, type ShortlistTerminal } from './shortlist-projection'

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
        <div className="grid gap-3 rounded-md border border-border bg-background p-4" aria-label="Call first option">
          <div className="grid gap-1">
            <p className="block text-lg font-semibold text-foreground">{urgentBusiness.name}</p>
          </div>
          <Button asChild variant="default" className="min-h-11 justify-self-start">
            <a href={urgentCallHref}>Call {urgentPhone}</a>
          </Button>
        </div>
      )
    : null
  if (closed) {
    return (
      <section className="grid gap-3 rounded-lg border border-border bg-card p-4" aria-labelledby="shortlist-closed-heading">
        <h2 id="shortlist-closed-heading" className="text-xl font-semibold text-foreground">Shortlist closed</h2>
        <p className="text-muted-foreground" role="status">Nothing was sent.</p>
        <Button asChild variant="secondary" className="min-h-11 justify-self-start">
          <a href="/">Return home</a>
        </Button>
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
    <section className="grid gap-4 rounded-lg border border-border bg-card p-4" aria-labelledby="shortlist-terminal-heading">
      {urgentContact}
      <div className="grid gap-1">
        <h2 id="shortlist-terminal-heading" className="text-xl font-semibold text-foreground">
          Your shortlist is ready
        </h2>
        <p className="text-muted-foreground">
          {timing === 'today'
            ? 'For today, listings with a published contact path appear first. Phone details are shown only when published.'
            : 'Compare the listed facts, then open a business page when you are ready.'}
        </p>
      </div>
      <div className="flex flex-col gap-2 min-[376px]:flex-row min-[376px]:flex-wrap" aria-label="Shortlist actions">
        <Button
          type="button"
          variant="secondary"
          className="min-h-11"
          disabled={onChangeCriteria === undefined}
          {...(onChangeCriteria === undefined ? {} : { onClick: onChangeCriteria })}
        >
          Change criteria
        </Button>
        <Button asChild variant="secondary" className="min-h-11">
          <a href={firstBusiness?.detailUrl ?? '/registry'}>Open</a>
        </Button>
        <Button type="button" variant="secondary" className="min-h-11" disabled={providers.length === 0} onClick={openExportPreview}>Copy</Button>
        {callHref === undefined
          ? <Button type="button" variant="secondary" className="min-h-11" disabled>Call</Button>
          : <Button asChild variant="secondary" className="min-h-11"><a href={callHref}>Call {publishedPhone}</a></Button>}
        <Button type="button" variant="ghost" className="min-h-11" onClick={() => setClosed(true)}>Close</Button>
      </div>
      {callHref === undefined
        ? <p className="block text-sm text-muted-foreground">Open the listing for its published contact options.</p>
        : <p className="block text-sm text-muted-foreground">Calls go directly to the published business number.</p>}
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
