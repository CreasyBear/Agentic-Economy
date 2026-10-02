import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AePageHeader } from '@/components/ae/layout/AePageHeader'
import buttonStyles from '@/components/arc/button/button.module.css'
import { FileQuestionIcon } from 'lucide-react'
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
              <a href="/market" className={`${buttonStyles.button} ${buttonStyles.primary} ${buttonStyles.md}`}>Browse Tools</a>
              <a href="/for-providers" className={`${buttonStyles.button} ${buttonStyles.secondary} ${buttonStyles.md}`}>Add Tool</a>
            </>
          )}
        />
      </div>
    </AePublicPage>
  )
}
