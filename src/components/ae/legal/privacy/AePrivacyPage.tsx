import { TERMS_VERSION } from '@/components/ae/legal/legal-version'
import { Link } from '@tanstack/react-router'

import { AeSiteUtilityDocument } from '@/components/ae/website/AeSiteUtilityDocument'

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

export function AePrivacyPage() {
  return (
    <AeSiteUtilityDocument
      title={privacyTitle}
      description={privacyIntro}
      lastUpdated={privacyLastUpdated}
      version={TERMS_VERSION}
      sections={privacySections}
      intro={<p>{privacyOpening}</p>}
      footer={(
        <div className="grid gap-4">
          <p>
            <Link to="/support" className={documentLinkClassName}>Contact Support about your data</Link>{' '}
            or read the <Link to="/trust" className={documentLinkClassName}>Trust centre</Link>.
          </p>
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
