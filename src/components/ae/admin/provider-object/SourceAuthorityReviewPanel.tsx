import { useQuery } from 'convex/react'
import { useState } from 'react'

import { api } from '../../../../../convex/_generated/api'
import { AdminActionSheet } from '@/components/ae/admin/actions/AdminActionSheet'
import { SOURCE_AUTHORITY_REVIEW_COPY } from '@/components/ae/admin/actions/actions.contracts'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/arc/button/button'
import { ADMIN_ACTION_PERMISSION } from '@/lib/operator/admin-console/contracts'
import { canAdminRolePerformAction } from '@/modules/security/public'

import type { SourceAuthorityReviewPanelProps } from './source-authority-review.contracts'
import '../RecordWorkspaceComposition.css'

export function SourceAuthorityReviewPanel({ review }: SourceAuthorityReviewPanelProps) {
  const access = useQuery(api.adminConsoleAudit.readAdminAuditAccess, {})
  const [open, setOpen] = useState(false)
  const canVerify = access?.kind === 'allowed'
    && canAdminRolePerformAction(access.role, ADMIN_ACTION_PERMISSION.verify_capability_source_authority)
  const targetRefs = [
    { label: SOURCE_AUTHORITY_REVIEW_COPY.publication, value: review.publicationRef },
    { label: SOURCE_AUTHORITY_REVIEW_COPY.toolReference, value: review.operationRef },
    { label: SOURCE_AUTHORITY_REVIEW_COPY.source, value: review.sourceUrl },
    { label: SOURCE_AUTHORITY_REVIEW_COPY.digest, value: review.expectedSourceDigest },
  ]

  return (
    <AeSection
      className="arc-market arc-admin-source-review"
      title={SOURCE_AUTHORITY_REVIEW_COPY.title}
      description={SOURCE_AUTHORITY_REVIEW_COPY.description}
    >
      <div className="arc-market arc-admin-evidence-action">
        <dl className="arc-admin-source-facts">
          <div className="arc-admin-source-fact">
            <dt>{SOURCE_AUTHORITY_REVIEW_COPY.source}</dt>
            <dd>
              {review.sourceKind.replace('_', ' ')} · {review.sourceUrl}
            </dd>
          </div>
          <div className="arc-admin-source-fact">
            <dt>{SOURCE_AUTHORITY_REVIEW_COPY.digest}</dt>
            <dd><code>{review.expectedSourceDigest}</code></dd>
          </div>
          <div className="arc-admin-source-fact">
            <dt>{SOURCE_AUTHORITY_REVIEW_COPY.publication}</dt>
            <dd><code>{review.publicationRef}</code></dd>
          </div>
          <div className="arc-admin-source-fact">
            <dt>{SOURCE_AUTHORITY_REVIEW_COPY.revision}</dt>
            <dd><code>{review.expectedRevision}</code></dd>
          </div>
          <div className="arc-admin-source-fact">
            <dt>{SOURCE_AUTHORITY_REVIEW_COPY.toolReference}</dt>
            <dd><code>{review.operationRef}</code></dd>
          </div>
        </dl>
        {canVerify ? (
          <Button type="button" variant="secondary" size="md" className="arc-market arc-admin-source-action" onClick={() => setOpen(true)}>
            {SOURCE_AUTHORITY_REVIEW_COPY.open}
          </Button>
        ) : null}
        {canVerify ? (
          <AdminActionSheet
            action="verify_capability_source_authority"
            input={{
              publicationRef: review.publicationRef,
              expectedRevision: review.expectedRevision,
              expectedSourceDigest: review.expectedSourceDigest,
            }}
            targetRefs={targetRefs}
            open={open}
            onOpenChange={setOpen}
          />
        ) : null}
      </div>
    </AeSection>
  )
}
