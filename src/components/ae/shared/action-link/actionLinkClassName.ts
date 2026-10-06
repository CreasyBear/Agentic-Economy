import { cn } from '@/lib/utils'

import type { AeActionLinkSize, AeActionLinkVariant } from './action-link.contracts'
import styles from './action-link.module.css'

/** Arc button look for elements Arc's `Button` cannot render (router links, anchors, Base UI `render` targets). */
export function actionLinkClassName(variant: AeActionLinkVariant = 'primary', size: AeActionLinkSize = 'md'): string {
  return cn(styles.link, styles.action, styles[variant], styles[size])
}
