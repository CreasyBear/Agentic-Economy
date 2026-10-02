import { Link } from '@tanstack/react-router'

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'

import type { AeSiteFaqProps } from './faq.contracts'
import './FaqComposition.css'

/** Arc FAQ composition over the existing accessible accordion engine. */
export function AeSiteFaq({
  labelledBy,
  questions,
  title,
  statusLinkLead,
  statusLinkLabel,
}: AeSiteFaqProps) {
  return (
    <section className="arc-market arc-site-faq" aria-labelledby={title === undefined ? undefined : labelledBy}>
      <div className="arc-site-faq-grid">
        <header>
          {title === undefined ? null : (
            <h2
              id={labelledBy}
              className="arc-site-faq-heading"
            >
              {title}
            </h2>
          )}
        </header>
        <div className="arc-site-faq-questions">
          <Accordion type="single" collapsible className="arc-site-faq-list">
            {questions.map((item) => (
              <AccordionItem
                key={item.question}
                value={item.question}
                className="arc-site-faq-item"
              >
                <AccordionTrigger className="arc-site-faq-trigger">
                  {item.question}
                </AccordionTrigger>
                <AccordionContent>
                  <p className="arc-site-faq-answer">{item.answer}</p>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>

          {statusLinkLabel === undefined ? null : (
            <p className="arc-site-faq-status">
              {statusLinkLead === undefined ? null : <>{statusLinkLead}{' '}</>}
              <Link to="/status">
                {statusLinkLabel}
              </Link>
            </p>
          )}
        </div>
      </div>
    </section>
  )
}
