import { useEffect, useRef, useState } from 'react'

import { Button } from '@astryxdesign/core/Button'
import { Dialog } from '@astryxdesign/core/Dialog'
import { Heading } from '@astryxdesign/core/Heading'
import { Text } from '@astryxdesign/core/Text'

import { AeCheckboxField } from '@/components/ae/forms/AeCheckboxField'
import {
  emitWave1JourneyEvent,
  getOrCreatePseudonymousJourneyId,
} from '@/lib/ui/journey-events'
import {
  createShortlistExportPreview,
  isShortlistExportPreviewCurrent,
  type ShortlistExportPreview,
} from '@/lib/ui/shortlist-export'
import type { AnswerSource } from '@/modules/answer/public'

export type AeExportPreviewProps = {
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  threadId: string
  revision: string
  sourceAt?: string
  providers: readonly AnswerSource[]
  origin?: string
}

type ArtifactStatus = 'idle' | 'copied' | 'error'

export function AeExportPreview({
  isOpen,
  onOpenChange,
  threadId,
  revision,
  providers,
  sourceAt,
  origin,
}: AeExportPreviewProps) {
  const [preview, setPreview] = useState<ShortlistExportPreview | null>(() => (
    isOpen ? buildPreview(threadId, revision, providers, origin, sourceAt) : null
  ))
  const [artifactStatus, setArtifactStatus] = useState<ArtifactStatus>('idle')
  const wasOpen = useRef(isOpen)

  useEffect(() => {
    if (isOpen && !wasOpen.current) {
      setPreview(buildPreview(threadId, revision, providers, origin, sourceAt))
      setArtifactStatus('idle')
    }
    wasOpen.current = isOpen
  }, [isOpen, origin, providers, revision, sourceAt, threadId])

  if (!isOpen || preview === null) return null

  const current = isShortlistExportPreviewCurrent(preview, revision)

  function updateField(fieldId: string, selected: boolean) {
    if (!current || preview === null) return
    const selectedFieldIds: string[] = []
    for (const field of preview.fields) {
      if (field.id === fieldId ? selected : field.selected) selectedFieldIds.push(field.id)
    }
    setPreview(createShortlistExportPreview({
      threadId,
      revision,
      providers,
      generatedAt: preview.generatedAt,
      origin: resolvedOrigin(origin),
      sanitized: preview.sanitized,
      selectedFieldIds,
      ...(preview.sourceAt === undefined ? {} : { sourceAt: preview.sourceAt }),
    }))
    setArtifactStatus('idle')
  }

  function refreshPreview() {
    setPreview(buildPreview(threadId, revision, providers, origin, sourceAt))
    setArtifactStatus('idle')
  }
  async function copySummary() {
    if (!current || preview === null) return
    try {
      if (typeof navigator.clipboard?.writeText !== 'function') throw new Error('Clipboard unavailable')
      await navigator.clipboard.writeText(preview.text)
      emitExportEvent(threadId, 'copy')
      setArtifactStatus('copied')
    } catch {
      setArtifactStatus('error')
    }
  }

  function printSummary() {
    if (!current) return
    window.print()
    emitExportEvent(threadId, 'print')
  }

  return (
    <Dialog
      id="ae-shortlist-export-preview"
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      purpose="form"
      width="min(44rem, calc(100vw - 2rem))"
      maxHeight="calc(100dvh - 2rem)"
      role="dialog"
      aria-labelledby="ae-export-preview-heading"
      className="print:static print:max-h-none print:w-full print:shadow-none"
    >
      <div className="grid gap-5" data-export-preview="">
        <div className="grid gap-1 print:hidden">
          <Heading id="ae-export-preview-heading" level={2} className="text-xl font-semibold">
            Export preview
          </Heading>
          <Text color="secondary">Review and select every field before anything is copied or printed.</Text>
        </div>

        <div className="grid gap-2 rounded-md border border-border bg-surface p-3 print:hidden">
          <AeCheckboxField
            id="sanitized-share"
            label="Sanitized share"
            description="On by default. Private links, access details, and personal information stay out."
            checked={preview.sanitized}
            disabled
            onCheckedChange={() => undefined}
          />
        </div>

        {current ? null : (
          <div role="alert" className="grid gap-2 rounded-md border border-warning bg-warning-subtle p-3 print:hidden">
            <Text weight="semibold">This preview is out of date.</Text>
            <Text color="secondary">The shortlist changed after this preview opened. Refresh it before copying or printing.</Text>
            <Button label="Refresh export preview" type="button" variant="secondary" className="min-h-11 justify-self-start" onClick={refreshPreview} />
          </div>
        )}

        <fieldset className="grid gap-3 print:hidden" disabled={!current}>
          <legend className="mb-1 font-heading text-base font-semibold text-primary">Included fields</legend>
          {preview.fields.map((field) => (
            <AeCheckboxField
              key={field.id}
              id={field.id}
              label={field.label}
              description={field.value}
              checked={field.selected}
              disabled={!current}
              onCheckedChange={(checked) => updateField(field.id, checked)}
            />
          ))}
        </fieldset>

        <pre
          aria-label="Export preview text"
          className="whitespace-pre-wrap break-words rounded-md border border-border bg-body p-4 font-mono text-sm tabular-nums text-primary"
        >{preview.text}</pre>

        <div className="flex flex-col-reverse gap-2 min-[376px]:flex-row min-[376px]:justify-end print:hidden">
          <Button label="Cancel" type="button" variant="ghost" className="min-h-11" onClick={() => onOpenChange(false)} />
          <Button label="Print" type="button" variant="secondary" className="min-h-11" isDisabled={!current} onClick={printSummary} />
          <Button label="Copy summary" type="button" variant="primary" className="min-h-11" isDisabled={!current} onClick={() => void copySummary()} />
        </div>
        {artifactStatus === 'idle' ? null : (
          <Text type="supporting" color="secondary" role="status" className="print:hidden">
            {artifactStatus === 'copied' ? 'Summary copied.' : 'The summary could not be copied.'}
          </Text>
        )}
      </div>
    </Dialog>
  )
}

function buildPreview(
  threadId: string,
  revision: string,
  providers: readonly AnswerSource[],
  origin: string | undefined,
  sourceAt: string | undefined,
): ShortlistExportPreview {
  return createShortlistExportPreview({
    threadId,
    revision,
    providers,
    generatedAt: new Date().toISOString(),
    origin: resolvedOrigin(origin),
    ...(sourceAt === undefined ? {} : { sourceAt }),
  })
}

function resolvedOrigin(origin: string | undefined): string {
  if (origin !== undefined) return origin
  return typeof window === 'undefined' ? 'https://agentic-economy.local' : window.location.origin
}

function emitExportEvent(threadId: string, format: 'copy' | 'print') {
  try {
    emitWave1JourneyEvent({
      event: 'shortlist_exported',
      eventVersion: 1,
      journey: 'J2',
      pseudonymousJourneyId: getOrCreatePseudonymousJourneyId('J2', threadId),
      format,
    })
  } catch {
    // Measurement is best effort and must never block or misreport an artifact action.
  }
}
