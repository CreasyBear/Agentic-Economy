import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/ui/button'
import { FieldGroup } from '@/components/ui/field'
import { cn } from '@/lib/utils'
import { SourceTypeChooser } from './supply-source-type/components/SourceTypeChooser'
import { SupplySourceFields } from './supply-source-type/components/SupplySourceFields'
import { SUPPLY_SOURCE_TYPE_COPY, type SupplySourceTypeSectionProps } from './supply-source-type/supply-source-type.contracts'
import { useSupplySourceType } from './supply-source-type/useSupplySourceType'
import { TACTILE } from './supply-source-native-start-presentation'

export function SupplySourceTypeSection(props: SupplySourceTypeSectionProps) {
  const {
    discoverDiagnostic,
    handleDiscover,
    ...sourceFieldHandlers
  } = useSupplySourceType(props)

  return (
    <AeSection title="Source" description={SUPPLY_SOURCE_TYPE_COPY.sectionDescription}>
      <FieldGroup className="gap-5">
        <SourceTypeChooser
          sourceKind={props.sourceKind}
          disabled={props.disabled}
          onSourceKindChange={props.onSourceKindChange}
        />
        <Button
          type="button"
          className={cn('min-h-touch justify-self-start', TACTILE)}
          disabled={props.disabled}
          aria-busy={props.discovering || undefined}
          onClick={handleDiscover}
        >
          {props.discovering ? SUPPLY_SOURCE_TYPE_COPY.findingTools : SUPPLY_SOURCE_TYPE_COPY.findTools}
        </Button>
        <SupplySourceFields
          {...props}
          {...sourceFieldHandlers}
          discoverDiagnostic={discoverDiagnostic}
        />
      </FieldGroup>
    </AeSection>
  )
}
