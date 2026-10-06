import { Link } from '@tanstack/react-router'

import { FaqSection } from '@/components/arc/blocks/faq-section/faq-section'

import type { AeSiteFaqProps } from './faq.contracts'
import './FaqComposition.css'

/** The Arc FAQ block receives authored headings and questions; AE keeps its link at the edge. */
export function AeSiteFaq({
  labelledBy,
  questions,
  title,
  statusLinkLead,
  statusLinkLabel,
}: AeSiteFaqProps) {
  const faq = (
    <FaqSection
      variant="accordion"
      title={title ?? null}
      {...(title === undefined ? {} : { titleId: labelledBy })}
      description=""
      items={questions.map((item, index) => ({ ...item, id: `question-${index}` }))}
      defaultValue={[]}
      multiple={false}
      contact={null}
    />
  )

  return (
    <div className="arc-market arc-site-faq">
      {faq}
      {statusLinkLabel === undefined ? null : (
        <p className="arc-site-faq-status">
          {statusLinkLead === undefined ? null : <>{statusLinkLead}{' '}</>}
          <Link to="/status">{statusLinkLabel}</Link>
        </p>
      )}
    </div>
  )
}
