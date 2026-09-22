import type { AeFact } from '@/components/ae/data/AeFactList'
import { AeRecordSheet } from '@/components/ae/layout/AeRecordSheet'
import {
  ADMIN_EXCEPTIONS_COPY,
  type ExceptionEvidenceSheetProps,
} from '../exceptions.contracts'

export function ExceptionEvidenceSheet({ row, onOpenChange }: ExceptionEvidenceSheetProps) {
  const facts: readonly AeFact[] = row === null
    ? []
    : [
        { label: ADMIN_EXCEPTIONS_COPY.factLabels.kind, value: row.kindLabel },
        { label: ADMIN_EXCEPTIONS_COPY.factLabels.reference, value: row.ref, mono: true },
        {
          label: ADMIN_EXCEPTIONS_COPY.factLabels.business,
          value: row.businessSlug ?? ADMIN_EXCEPTIONS_COPY.unavailable,
          mono: row.businessSlug !== null,
        },
        {
          label: ADMIN_EXCEPTIONS_COPY.factLabels.since,
          value: `${row.sinceLabel} (${row.sinceRelativeLabel})`,
        },
      ]
  return (
    <AeRecordSheet
      open={row !== null}
      onOpenChange={onOpenChange}
      title={ADMIN_EXCEPTIONS_COPY.evidenceTitle}
      description={ADMIN_EXCEPTIONS_COPY.evidenceDescription}
      facts={facts}
    />
  )
}
