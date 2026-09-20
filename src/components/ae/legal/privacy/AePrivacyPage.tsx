import { PrivacyCorrectionCta } from './components/PrivacyCorrectionCta'
import { PrivacyDetailCards } from './components/PrivacyDetailCards'
import { PrivacyMomentTabs } from './components/PrivacyMomentTabs'
import { detailCards, moments } from './privacy.contracts'

export function AePrivacyPage() {
  return (
    <div className="ae-rail grid max-w-prose gap-page pb-page">
      <PrivacyDetailCards cards={detailCards} />
      <PrivacyMomentTabs moments={moments} />
      <PrivacyCorrectionCta />
    </div>
  )
}
