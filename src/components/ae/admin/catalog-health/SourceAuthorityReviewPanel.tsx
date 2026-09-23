import { useQuery } from 'convex/react'
import { useState } from 'react'

import { api } from '../../../../../convex/_generated/api'
import { AdminActionSheet } from '@/components/ae/admin/actions/AdminActionSheet'
import { SOURCE_AUTHORITY_REVIEW_COPY } from '@/components/ae/admin/actions/actions.contracts'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/ui/button'
import { ADMIN_ACTION_PERMISSION } from '@/lib/operator/admin-console/contracts'
import { canAdminRolePerformAction } from '@/modules/security/public'

import type { SourceAuthorityReviewPanelProps } from './catalog-health.contracts'

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
      title={SOURCE_AUTHORITY_REVIEW_COPY.title}
      description={SOURCE_AUTHORITY_REVIEW_COPY.description}
    >
      <div className="grid gap-4">
        <dl className="grid gap-2 text-sm">
          <div className="grid gap-1">
            <dt className="font-medium text-foreground">{SOURCE_AUTHORITY_REVIEW_COPY.source}</dt>
            <dd className="break-all text-muted-foreground">
              {review.sourceKind.replace('_', ' ')} · {review.sourceUrl}
            </dd>
          </div>
          <div className="grid gap-1">
            <dt className="font-medium text-foreground">{SOURCE_AUTHORITY_REVIEW_COPY.digest}</dt>
            <dd><code className="break-all text-xs text-muted-foreground">{review.expectedSourceDigest}</code></dd>
          </div>
          <div className="grid gap-1">
            <dt className="font-medium text-foreground">{SOURCE_AUTHORITY_REVIEW_COPY.publication}</dt>
            <dd><code className="break-all text-xs text-muted-foreground">{review.publicationRef}</code></dd>
          </div>
          <div className="grid gap-1">
            <dt className="font-medium text-foreground">{SOURCE_AUTHORITY_REVIEW_COPY.revision}</dt>
            <dd><code className="text-xs text-muted-foreground">{review.expectedRevision}</code></dd>
          </div>
          <div className="grid gap-1">
            <dt className="font-medium text-foreground">{SOURCE_AUTHORITY_REVIEW_COPY.toolReference}</dt>
            <dd><code className="break-all text-xs text-muted-foreground">{review.operationRef}</code></dd>
          </div>
        </dl>
        {canVerify ? (
          <Button type="button" variant="outline" className="min-h-touch" onClick={() => setOpen(true)}>
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
