import { Link } from '@tanstack/react-router'

import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

import type { StatusRecoveryPanelProps } from '../system-status.contracts'

export function StatusRecoveryPanel({ recovery }: StatusRecoveryPanelProps) {
  return (
    <section
      aria-labelledby="status-recovery-title"
      className="mt-related grid gap-related rounded-card border border-border bg-card p-gutter sm:grid-cols-[1fr_auto] sm:items-center"
    >
      <div className="grid gap-1">
        <h2 id="status-recovery-title" className="font-medium text-foreground">
          {recovery.title}
        </h2>
        <p className="text-sm text-muted-foreground">{recovery.description}</p>
      </div>
      <Link
        to={recovery.href}
        className={cn(buttonVariants({ variant: 'outline' }), 'min-h-touch')}
      >
        {recovery.label}
      </Link>
    </section>
  )
}
