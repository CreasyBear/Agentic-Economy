import { Link } from '@tanstack/react-router'
import { ArrowRightIcon } from 'lucide-react'

import { AeSiteHeading } from '@/components/ae/website/AeSiteType'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

export function PrivacyCorrectionCta() {
  return (
    <section className="flex flex-col gap-related border-t border-border pt-section md:flex-row md:items-center md:justify-between">
      <div className="max-w-2xl">
        <AeSiteHeading as="h2" size="sm">
          Need a Provider profile fixed?
        </AeSiteHeading>
        <p className="mt-intra text-muted-foreground">
          Send the Provider slug and what should change.
        </p>
      </div>
      <Link
        to="/privacy/remove-business"
        className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-touch')}
      >
        Open corrections <ArrowRightIcon aria-hidden="true" />
      </Link>
    </section>
  )
}
