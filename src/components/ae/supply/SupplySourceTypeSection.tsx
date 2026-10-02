import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { SupplySourceFields } from './supply-source-type/components/SupplySourceFields'
import { SUPPLY_SOURCE_TYPE_COPY, type SupplySourceTypeSectionProps } from './supply-source-type/supply-source-type.contracts'
import { useSupplySourceType } from './supply-source-type/useSupplySourceType'
import { TACTILE } from './supply-source-native-start-presentation'

export function SupplySourceTypeSection(props: SupplySourceTypeSectionProps & Readonly<{ askMethod?: boolean }>) {
  const { discoverDiagnostic, handleDiscover } = useSupplySourceType(props)
  return (
    <AeSection title="Add Tool" description="Paste the public HTTPS URL. Agentic Economy reads the payment challenge.">
      <FieldGroup className="gap-5">
        <SupplySourceFields
          {...props}
          discoverDiagnostic={discoverDiagnostic}
          askMethod={props.askMethod === true}
        />
        <Button
          type="button"
          className={cn('min-h-touch justify-self-start', TACTILE)}
          disabled={props.disabled}
          aria-busy={props.discovering || undefined}
          onClick={handleDiscover}
        >
          {props.discovering ? SUPPLY_SOURCE_TYPE_COPY.findingTools : 'Read endpoint'}
        </Button>
      </FieldGroup>
    </AeSection>
  )
}
