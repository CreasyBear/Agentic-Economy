import { Link } from '@tanstack/react-router'

import { AeSiteUtilityDocument } from '@/components/ae/website/AeSiteUtilityDocument'
import { TERMS_VERSION } from '@/components/ae/legal/legal-version'
import { trustLastUpdated, trustSections } from './trust.contracts'

const linkClassName = 'text-primary underline underline-offset-4'

export function AeTrustPage() {
  return (
    <AeSiteUtilityDocument
      title="Trust centre."
      description="How credit, Tool results and your data are handled."
      lastUpdated={trustLastUpdated}
      version={TERMS_VERSION}
      sections={trustSections}
      intro={(
        <p>
          This guide describes the invitation-only alpha. For a specific Call, use Get help on its receipt to keep the reference attached.{' '}
          <Link to="/support" className={linkClassName}>Support</Link> handles general questions and private reports.
        </p>
      )}
      footer={(
        <p>
          Read the <Link to="/terms" className={linkClassName}>Terms</Link>{' '}
          and <Link to="/privacy" className={linkClassName}>Privacy policy</Link>,{' '}
          or check <Link to="/status" className={linkClassName}>Status</Link>.
        </p>
      )}
    />
  )
}
