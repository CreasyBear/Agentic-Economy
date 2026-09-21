import { Link } from '@tanstack/react-router'

import { AeSiteUtilityDocument } from '@/components/ae/website/AeSiteUtilityDocument'

import {
  termsAvailabilityLead,
  termsAvailabilityLink,
  termsClosingLead,
  termsClosingLink,
  termsDescription,
  termsIntro,
  termsLastUpdated,
  termsSections,
  termsTitle,
} from './terms.contracts'

export function AeTermsPage() {
  return (
    <AeSiteUtilityDocument
      title={termsTitle}
      description={termsDescription}
      lastUpdated={termsLastUpdated}
      sections={termsSections}
      intro={(
        <p>
          {termsIntro} {termsAvailabilityLead}{' '}
          <Link to="/status" className="text-primary underline underline-offset-4">
            {termsAvailabilityLink}
          </Link>.
        </p>
      )}
      footer={(
        <p>
          {termsClosingLead}{' '}
          <Link to="/privacy" className="text-primary underline underline-offset-4">
            {termsClosingLink}
          </Link>.
        </p>
      )}
    />
  )
}
