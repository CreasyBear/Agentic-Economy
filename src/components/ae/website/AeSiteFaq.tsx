import { Link } from '@tanstack/react-router'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

import { AeSiteSection } from './AeSiteSection'
import { AeSiteHeading } from './AeSiteType'

import type { AeSiteFaqProps } from './faq.contracts'

/** Port of aecon.ai's Dusk FAQ 1 two-column accordion. */
export function AeSiteFaq({
  labelledBy,
  questions,
  title,
  statusLinkLead,
  statusLinkLabel,
}: AeSiteFaqProps) {
  return (
    <AeSiteSection labelledBy={labelledBy} rhythm="section">
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-6 md:grid-cols-2 md:gap-6">
          <div>
            {title === undefined ? null : (
              <AeSiteHeading
                as="h2"
                size="md"
                id={labelledBy}
                className="max-w-sm"
              >
                {title}
              </AeSiteHeading>
            )}
          </div>
          <div>
            <Accordion type="single" collapsible className="w-full">
              {questions.map((item) => (
                <AccordionItem
                  key={item.question}
                  value={item.question}
                  className="border-dashed"
                >
                  <AccordionTrigger className="cursor-pointer text-base hover:no-underline">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent>
                    <p className="text-base text-muted-foreground">{item.answer}</p>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>

            {statusLinkLabel === undefined ? null : (
              <p className="mt-6 text-muted-foreground">
                {statusLinkLead === undefined ? null : <>{statusLinkLead}{' '}</>}
                <Link to="/status" className="font-medium text-primary hover:underline">
                  {statusLinkLabel}
                </Link>
              </p>
            )}
          </div>
        </div>
      </div>
    </AeSiteSection>
  )
}
