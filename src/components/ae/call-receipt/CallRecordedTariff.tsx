import type { OwnerCallContext } from '@/modules/capability-execution/call-recovery-contracts'
import { displayPriceFromPricingConfig,formatCurrencyAmount,pricingConfigDigest } from '@/modules/money/public'
import { AeFactList } from '@/components/ae/data/AeFactList'
import { AeSection } from '@/components/ae/layout/AeSection'
export function CallRecordedTariff({tariff}:{tariff:OwnerCallContext['recordedTariff']}){
  if(tariff===undefined)return null
  if(pricingConfigDigest(tariff.pricingConfig)!==tariff.priceDigest)return <p role="status">Recorded pricing could not be verified.</p>
  const displayed=displayPriceFromPricingConfig(tariff.pricingConfig)
  return <AeSection title="Recorded Tool tariff">
    <AeFactList facts={[{label:'Source',value:'Pricing stored with this Call'},{label:'Published customer price',value:displayed.kind==='fixed'?formatCurrencyAmount(displayed.amount):'Quoted for this request'},{label:'Pricing basis',value:tariff.pricingConfig.kind==='fixed_aud'?'Fixed AUD charge per admitted Call':'Provider payment requirement resolved by Quote'},{label:'Price version',value:tariff.priceDigest,mono:true}]} />
    <p className="text-sm text-muted-foreground">The receipt shows the admitted customer charge, fees and provider obligation. Measured service units are evidence of usage; they do not establish a per-unit rate or authorize another charge.</p>
  </AeSection>
}
