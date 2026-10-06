import { CopyButton } from '@/components/arc/copy-button/copy-button'
import { cn } from '@/lib/utils'

import type { AeCopyValueProps } from './copy-value.contracts'

export function AeCopyValue({ className, ...props }: AeCopyValueProps) {
  return <CopyButton {...props} className={cn('arc-market', className)} />
}
