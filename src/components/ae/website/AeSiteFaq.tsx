import { Link } from '@tanstack/react-router'

import { FaqSection } from '@/components/arc/blocks/faq-section/faq-section'

import type { AeSiteFaqProps } from './faq.contracts'
import './FaqComposition.css'

/** The Arc FAQ block receives the page's exact questions and native continuation. */
export function AeSiteFaq({
  labelledBy,
  questions,
  title,
  statusLinkLead,
  statusLinkLabel,
}: AeSiteFaqProps) {
  return (
    <FaqSection
      className="arc-market"
      variant="accordion"
      title={title ?? null}
      titleId={labelledBy}
      description=""
      items={questions.map(item => ({ ...item, id: item.question }))}
      defaultValue={[]}
      multiple={false}
      contact={null}
      footer={statusLinkLabel === undefined ? null : (
        <p className="arc-site-faq-status">
          {statusLinkLead === undefined ? null : <>{statusLinkLead}{' '}</>}
          <Link to="/status">{statusLinkLabel}</Link>
        </p>
      )}
    />
  )
}
