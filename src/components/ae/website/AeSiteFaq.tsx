import { Link } from '@tanstack/react-router'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

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
    <section className="py-16 md:py-24" aria-labelledby={labelledBy}>
      <div className="mx-auto max-w-7xl px-6">
        <div className="grid gap-6 md:grid-cols-2 md:gap-6">
          <div>
            {title === undefined ? null : (
              <h2
                id={labelledBy}
                className="max-w-sm text-balance text-4xl font-extralight tracking-[-0.035em] text-foreground"
              >
                {title}
              </h2>
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
    </section>
  )
}
