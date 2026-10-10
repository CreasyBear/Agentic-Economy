import type { ReactNode } from 'react'
import { SearchXIcon } from 'lucide-react'

import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { EmptyState } from '@/components/arc/empty-state/empty-state'

import { MarketBackButton } from './MarketBackButton'
import styles from './ToolPage.module.css'

/** Linear-style empty state in the tool page's own shell, so every tool URL shows one brand and one footer. */
export function ToolPageState({ title, description, action, icon }: Readonly<{ title: string; description: string; action: ReactNode; icon?: ReactNode }>) {
  return <AePublicPage>
    <div className={`arc-market ${styles.page}`}>
      <nav aria-label="Breadcrumb" className={styles.crumbs}><MarketBackButton label="Back to tools" className="min-h-touch" variant="ghost" /></nav>
      <EmptyState icon={icon ?? <SearchXIcon aria-hidden="true" />} title={title} description={description} action={action} titleAs="h1" />
    </div>
  </AePublicPage>
}
