import type { AnswerSource } from '@/modules/answer/public'
import { canonicalDigest } from '@/modules/common/canonical-digest'

export const SHORTLIST_EXPORT_PROOF =
  'This artifact proves what was sent, when, to whom, and their reply. It does not prove acceptance, availability, booking, or confirmation.'

export type ShortlistExportInput = {
  threadId: string
  revision: string
  providers: readonly AnswerSource[]
  generatedAt: string
  sourceAt?: string
  origin: string
  sanitized?: boolean
  selectedFieldIds?: readonly string[]
}

export type ShortlistExportField = {
  id: string
  label: string
  value: string
  selected: boolean
  sensitive: boolean
}

export type ShortlistExportPreview = {
  threadId: string
  revision: string
  generatedAt: string
  sourceAt?: string
  sanitized: boolean
  fields: readonly ShortlistExportField[]
  text: string
}

export function createShortlistExportPreview(input: ShortlistExportInput): ShortlistExportPreview {
  const sanitized = input.sanitized ?? true
  const selectedIds = input.selectedFieldIds === undefined ? null : new Set(input.selectedFieldIds)
  const fields: ShortlistExportField[] = []
  for (const [index, business] of input.providers.entries()) {
    for (const field of businessFields(business, index + 1, input.origin)) {
      fields.push({
        ...field,
        selected: selectedIds === null ? !field.sensitive : selectedIds.has(field.id),
      })
    }
  }
  const preview = {
    threadId: input.threadId,
    revision: input.revision,
    generatedAt: input.generatedAt,
    ...(input.sourceAt === undefined ? {} : { sourceAt: input.sourceAt }),
    sanitized,
    fields,
  }
  return { ...preview, text: serializeShortlistExport(preview) }
}

export function serializeShortlistExport(
  preview: Omit<ShortlistExportPreview, 'text'> | ShortlistExportPreview,
): string {
  const selected: string[] = []
  for (const field of preview.fields) {
    if (field.selected) selected.push(`${safeRecordValue(field.label)}: ${safeRecordValue(field.value)}`)
  }

  return [
    'Shortlist summary',
    `Decision record ID: ${safeRecordValue(preview.threadId)}`,
    `Source revision: ${safeRecordValue(preview.revision)}`,
    `Source timestamp: ${safeRecordValue(preview.sourceAt ?? 'Not available')}`,
    `Generated: ${safeRecordValue(preview.generatedAt)}`,
    'Sent status: Not sent',
    'Business reply: No business reply',
    ...selected,
    SHORTLIST_EXPORT_PROOF,
  ].join('\n')
}

export function isShortlistExportPreviewCurrent(preview: ShortlistExportPreview, revision: string): boolean {
  return preview.revision === revision
}

export function shortlistSemanticRevision(baseRevision: string, providers: readonly AnswerSource[]): string {
  return `${safeRecordValue(baseRevision)}:${canonicalDigest(providers.map((business) => ({
    slug: business.slug,
    name: business.name,
    suburb: business.suburb,
    stateTerritory: business.stateTerritory,
    detailUrl: business.detailUrl,
  })))}`
}

function businessFields(
  business: AnswerSource,
  position: number,
  origin: string,
): Omit<ShortlistExportField, 'selected'>[] {
  const location = [business.suburb, business.stateTerritory].filter(Boolean).join(', ') || 'Location not published'
  return [
    {
      id: `business-${position}-name`,
      label: `Business ${position} name`,
      value: safeRecordValue(business.name),
      sensitive: false,
    },
    {
      id: `business-${position}-location`,
      label: `Business ${position} location`,
      value: safeRecordValue(location),
      sensitive: false,
    },
    {
      id: `business-${position}-page`,
      label: `Business ${position} page`,
      value: publicPageUrl(business.detailUrl, origin, business.slug),
      sensitive: false,
    },
  ]
}

function publicPageUrl(detailUrl: string, origin: string, slug: string): string {
  const trustedOrigin = new URL(origin).origin
  const fallback = new URL(`/${encodeURIComponent(slug)}`, trustedOrigin).toString()
  try {
    const url = new URL(detailUrl, trustedOrigin)
    if (url.origin !== trustedOrigin || !url.pathname.startsWith('/')) return fallback
    return `${trustedOrigin}${url.pathname}`
  } catch {
    return fallback
  }
}

function safeRecordValue(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/\s+/g, ' ').trim()
}
