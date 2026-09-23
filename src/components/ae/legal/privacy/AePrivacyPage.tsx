import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'

import { AeSiteUtilityDocument } from '@/components/ae/website/AeSiteUtilityDocument'
import type { AeSiteUtilityDocumentSection } from '@/components/ae/website/utility-document.contracts'

import {
  privacyCorrectionLink,
  privacyIntro,
  privacyLastUpdated,
  privacyOaicLead,
  privacyOaicLink,
  privacyOpening,
  privacySections,
  privacyTermsLead,
  privacyTermsLink,
  privacyTitle,
} from './privacy.contracts'

const documentLinkClassName = 'text-primary underline underline-offset-4'
const COMPLAINTS_EMAIL = 'hello@aecon.ai'

function withComplaintsMailto(
  sections: ReadonlyArray<AeSiteUtilityDocumentSection>,
): ReadonlyArray<AeSiteUtilityDocumentSection> {
  return sections.map((section) => {
    if (section.id !== 'complaints') return section
    return {
      ...section,
      body: section.body.map((paragraph): ReactNode => {
        if (typeof paragraph !== 'string' || !paragraph.includes(COMPLAINTS_EMAIL)) {
          return paragraph
        }
        const [before, after] = paragraph.split(COMPLAINTS_EMAIL)
        return (
          <>
            {before}
            <a href={`mailto:${COMPLAINTS_EMAIL}`} className={documentLinkClassName}>
              {COMPLAINTS_EMAIL}
            </a>
            {after}
          </>
        )
      }),
    }
  })
}

export function AePrivacyPage() {
  return (
    <AeSiteUtilityDocument
      title={privacyTitle}
      description={privacyIntro}
      lastUpdated={privacyLastUpdated}
      sections={withComplaintsMailto(privacySections)}
      intro={<p>{privacyOpening}</p>}
      footer={(
        <div className="grid gap-4">
          <p>
            <Link to="/privacy/remove-business" className={documentLinkClassName}>
              {privacyCorrectionLink}
            </Link>.
          </p>
          <p>
            {privacyTermsLead}{' '}
            <Link to="/terms" className={documentLinkClassName}>{privacyTermsLink}</Link>.{' '}
            {privacyOaicLead}{' '}
            <a
              href="https://www.oaic.gov.au/privacy/privacy-complaints"
              className={documentLinkClassName}
            >
              {privacyOaicLink}
            </a>.
          </p>
        </div>
      )}
    />
  )
}
