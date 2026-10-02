import { Link } from '@tanstack/react-router'

import type { AeFact } from '@/components/ae/data/AeFactList'
import { AeRecordSheet } from '@/components/ae/layout/AeRecordSheet'
import buttonStyles from '@/components/arc/button/button.module.css'
import '../../RecordWorkspaceComposition.css'
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
        <div className="arc-market arc-admin-evidence-action">
          {row.kind === 'source_authority_review' ? (
            <p className="arc-admin-record-context">{ADMIN_EXCEPTIONS_COPY.verifySourceAuthority}</p>
          ) : null}
          {objectHref === null || objectHref === undefined ? null : (
            <Link to={objectHref} className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md}`}>
              {ADMIN_EXCEPTIONS_COPY.openObject}
            </Link>
          )}
        </div>
      )}
    </AeRecordSheet>
  )
}
