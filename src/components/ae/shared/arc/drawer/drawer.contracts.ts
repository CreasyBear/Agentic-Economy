import type { ComponentProps } from 'react'

import type { DrawerContent as ArcDrawerContent } from '@/components/arc/drawer/drawer'

export type AeDrawerContentProps = ComponentProps<typeof ArcDrawerContent> & {
  'data-phone-bottom'?: string
}
