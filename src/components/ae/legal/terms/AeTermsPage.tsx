import { Link } from '@tanstack/react-router'
import { ArrowRightIcon } from 'lucide-react'

import { AeSiteHeading } from '@/components/ae/website/AeSiteType'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

import { TermsCapabilityList } from './components/TermsCapabilityList'
import { TermsPracticeAccordion } from './components/TermsPracticeAccordion'
import { canDoItems, termsItems } from './terms.contracts'

export function AeTermsPage() {
  return (
    <div className="ae-rail grid max-w-prose gap-page pb-page">
      <TermsCapabilityList items={canDoItems} />

      <section className="border-t border-border pt-section">
        <AeSiteHeading as="h2" size="sm" className="mb-related">
          What these terms mean in practice
        </AeSiteHeading>
        <TermsPracticeAccordion items={termsItems} />
      </section>

      <section className="flex flex-wrap gap-related border-t border-border pt-section">
        <Link to="/market" className={cn(buttonVariants(), 'min-h-touch')}>Browse catalog</Link>
        <Link to="/for-providers" className={cn(buttonVariants({ variant: 'secondary' }), 'min-h-touch')}>
          Publish a Tool <ArrowRightIcon aria-hidden="true" />
        </Link>
      </section>
    </div>
  )
}
