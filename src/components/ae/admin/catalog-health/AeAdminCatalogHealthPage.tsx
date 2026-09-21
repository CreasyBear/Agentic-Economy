import { AeOperatorPage } from '@/components/ae/layout/AeOperatorPage'
import { AeAdminReadbackPanel } from '@/components/ae/readback/AeAdminReadbackPanel'

import type { AeAdminCatalogHealthPageProps } from './catalog-health.contracts'
import { SourceAuthorityReviewPanel } from './SourceAuthorityReviewPanel'

export function AeAdminCatalogHealthPage({ readback, review }: AeAdminCatalogHealthPageProps) {
  return (
    <AeOperatorPage
      operatorRole="admin"
      title="Catalog health"
      description="Check catalog and projection readbacks before public discovery files are allowed to ship."
      currentPath="/admin/index-health"
      navBadges={{ '/admin/index-health': readback.rows.length }}
    >
      <div className="grid gap-6">
        {review === undefined ? null : (
          <SourceAuthorityReviewPanel review={review} />
        )}
        <AeAdminReadbackPanel
          title="Catalog readback"
          description="Denied reads return no private rows; authorized reads show source, attempt, repair, and affected public surfaces."
          readback={readback}
        />
      </div>
    </AeOperatorPage>
  )
}
