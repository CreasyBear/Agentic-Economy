import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import { FileQuestionIcon } from 'lucide-react'
import { actionLinkClassName } from '@/components/ae/shared/action-link/actionLinkClassName'
import './RouteRecoveryComposition.css'

export function AeNotFound() {
  return (
    <AePublicPage>
      <div className="arc-market arc-route-state">
        <div className="arc-route-state-stage" aria-hidden="true"><FileQuestionIcon /></div>
        <AePageHeader
          eyebrow="Route missing"
          title="This page is not here."
          description="The address moved, expired, or was never published. Search the catalog, or add a Tool."
          actions={(
            <>
              <a href="/market" className={actionLinkClassName('primary', 'md')}>Browse Tools</a>
              <a href="/for-providers" className={actionLinkClassName('secondary', 'md')}>Add Tool</a>
            </>
          )}
        />
      </div>
    </AePublicPage>
  )
}
