/**
 * Adapted from the licensed Arc Pro Security settings block:
 * https://uiarc.dev/components/blocks/security-settings
 * Upstream security-settings.tsx SHA-256:
 * 3609e832d4a55be80402d0da7db029b7b58795e241eac6ccc85dfab54fd714e4
 * Embeds its header/section framing and page rail in the host frame. Live content
 * replaces the sample MFA, password, backup-code and session implementations.
 */
import { useId } from 'react'
import type { ReactNode } from 'react'
import styles from './security-settings.module.css'

export type SecuritySettingsProps = Readonly<{
  content: ReactNode
  navigation?: ReactNode
}>

/**
 * Requires live provider content. Ensures the provider keeps its own controls,
 * errors and state. The frame has no security state, fallback data or mutations.
 */
export function SecuritySettings({ content, navigation }: SecuritySettingsProps) {
  const id = useId()
  return <section className={`arc-market ${styles.block}`} aria-labelledby={`${id}-title`}>
    <header className={styles.header}>
      <h1 id={`${id}-title`}>Security</h1>
      <p>Manage your sign-in security.</p>
    </header>
    {navigation}
    <div className={styles.section}>
      <div className={styles.content}>{content}</div>
    </div>
  </section>
}

export type SecuritySettingsNavigationProps = Readonly<{
  activePage: 'profile' | 'security'
  profile: ReactNode
  security: ReactNode
}>

/** The host supplies its real routed links; the rail only marks the active page. */
export function SecuritySettingsNavigation({ activePage, profile, security }: SecuritySettingsNavigationProps) {
  return <nav aria-label="Account pages" className={styles.navigation}>
    <ul className={styles.rail}>
      {([{ page: 'profile', link: profile }, { page: 'security', link: security }] as const).map(({ page, link }) =>
        <li key={page} className={styles.railItem} data-state={activePage === page ? 'current' : 'next'}>
          {activePage === page && <span className={styles.railHighlight} aria-hidden="true" />}
          {link}
        </li>,
      )}
    </ul>
  </nav>
}
