import { Link } from '@tanstack/react-router'

import type { AeFact } from '@/components/ae/data/AeFactList'
import { AeRecordSheet } from '@/components/ae/layout/AeRecordSheet'
import { buttonVariants } from '@/components/ui/button-variants'
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
        ...(row.state === null ? [] : [{ label: 'Current state', value: row.state }]),
        {
          label: ADMIN_EXCEPTIONS_COPY.factLabels.since,
          value: `${row.sinceLabel} (${row.sinceRelativeLabel})`,
        },
      ]
  const objectHref = row?.kind === 'removal_dispute' || row?.kind === 'admission_case'
    ? row.businessHref : row?.href
  return (
    <AeRecordSheet
      open={row !== null}
      onOpenChange={onOpenChange}
      title={ADMIN_EXCEPTIONS_COPY.detailsTitle}
      description={ADMIN_EXCEPTIONS_COPY.detailsDescription}
      facts={facts}
    >
      {row === null ? null : (
        <div className="grid gap-related">
          {row.kind === 'source_authority_review' ? (
            <p className="text-sm text-muted-foreground">{ADMIN_EXCEPTIONS_COPY.verifySourceAuthority}</p>
          ) : null}
          {objectHref === null || objectHref === undefined ? null : (
            <Link to={objectHref} className={buttonVariants({ variant: 'outline', className: 'w-fit' })}>
              {ADMIN_EXCEPTIONS_COPY.openObject}
            </Link>
          )}
        </div>
      )}
    </AeRecordSheet>
  )
}
