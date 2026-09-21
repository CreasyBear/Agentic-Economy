import { Link } from '@tanstack/react-router'
import { ArrowRightIcon } from 'lucide-react'

import { AeSiteHeading } from '@/components/ae/website/AeSiteType'
import { buttonVariants } from '@/components/ui/button-variants'
import { cn } from '@/lib/utils'

import { TermsCapabilityList } from './components/TermsCapabilityList'
import { TermsPracticeAccordion } from './components/TermsPracticeAccordion'
import {
  canDoItems,
  termsItems,
  termsLastUpdated,
  termsPracticeSection,
  termsTableOfContents,
  termsTableOfContentsHeading,
  termsTableOfContentsLabel,
} from './terms.contracts'

export function AeTermsPage() {
  return (
    <div className="ae-rail grid max-w-prose gap-page pb-page">
      <p className="text-sm text-muted-foreground">{termsLastUpdated}</p>

      <nav aria-label={termsTableOfContentsLabel} className="grid gap-intra">
        <p className="font-medium text-foreground">{termsTableOfContentsHeading}</p>
        <ul className="grid gap-1">
          {termsTableOfContents.map(({ id, title }) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className={cn(buttonVariants({ variant: 'link', size: 'sm' }), 'justify-start px-0')}
              >
                {title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <TermsCapabilityList items={canDoItems} />

      <section className="border-t border-border pt-section">
        <AeSiteHeading
          as="h2"
          size="sm"
          id={termsPracticeSection.id}
          className="mb-related"
        >
          {termsPracticeSection.title}
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
