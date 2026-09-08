import { BracesIcon } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { cn } from '@/lib/utils'
import type { X402DirectoryEntry } from '@/modules/market/x402-directory'

/** Coinbase's published service icon identifies this Tool, not a verified company. */
export function DirectoryToolIdentity({ entry, className }: Readonly<{ entry: X402DirectoryEntry; className?: string }>) {
  return <Avatar className={cn('size-12 rounded-xl border border-border/60 bg-card', className)}>
    {entry.iconUrl === undefined ? null : <AvatarImage src={entry.iconUrl} alt="" referrerPolicy="no-referrer" className="object-cover" />}
    <AvatarFallback className="rounded-[inherit]"><BracesIcon className="size-5" aria-hidden="true" /></AvatarFallback>
  </Avatar>
}
