import { AeSiteHeading } from '@/components/ae/website/AeSiteType'

import { PrivacyCorrectionCta } from './components/PrivacyCorrectionCta'
import { PrivacyDetailCards } from './components/PrivacyDetailCards'
import { PrivacyMomentTabs } from './components/PrivacyMomentTabs'
import { PrivacyNoticeOverview } from './components/PrivacyNoticeOverview'
import {
  detailCards,
  moments,
  privacyDisclosureTable,
  privacyDocumentMeta,
  privacySections,
} from './privacy.contracts'

export function AePrivacyPage() {
  const [handlingSection, disclosureSection, momentsSection] = privacySections

  return (
    <div className="ae-rail grid max-w-prose gap-page pb-page">
      <PrivacyNoticeOverview
        meta={privacyDocumentMeta}
        sections={privacySections}
        disclosureSection={disclosureSection}
        disclosureTable={privacyDisclosureTable}
      />
      <section aria-labelledby={handlingSection.id} className="grid gap-related border-t border-border pt-section">
        <AeSiteHeading as="h2" size="sm" id={handlingSection.id}>
          {handlingSection.label}
        </AeSiteHeading>
        <PrivacyDetailCards cards={detailCards} />
      </section>
      <section aria-labelledby={momentsSection.id} className="grid gap-related border-t border-border pt-section">
        <AeSiteHeading as="h2" size="sm" id={momentsSection.id}>
          {momentsSection.label}
        </AeSiteHeading>
        <PrivacyMomentTabs moments={moments} />
      </section>
      <PrivacyCorrectionCta />
    </div>
  )
}
