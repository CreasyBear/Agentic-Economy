import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { Skeleton } from '@/components/arc/skeleton/skeleton'

import styles from './ToolPage.module.css'

/** The tool page's own grid while the loader runs (crumb, header, tabs row, phone bar), so nothing moves when the listing arrives. */
export function ToolPageSkeleton() {
  return <AePublicPage>
    <div className={`arc-market ${styles.page}`}>
      <div className={styles.skeletonRow}><Skeleton lines={1} label="Loading navigation" /></div>
      <header className={styles.header}>
        <Skeleton avatar lines={3} label="Loading tool" />
      </header>
      <div className={styles.layout}>
        <div className={styles.main}>
          <div className={styles.skeletonRow}><Skeleton lines={1} label="Loading tabs" /></div>
          <Skeleton lines={6} label="Loading tool details" />
        </div>
        <aside className={styles.aside} aria-label="Price">
          <Skeleton lines={4} label="Loading price" />
        </aside>
      </div>
    </div>
    <div className={styles.barSpace} aria-hidden="true" />
    <div className={`arc-market ${styles.bar}`}>
      <div className={styles.skeletonRow}><Skeleton lines={1} label="Loading price" /></div>
    </div>
  </AePublicPage>
}
