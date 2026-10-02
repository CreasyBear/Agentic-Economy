import { Field, FieldDescription, FieldLabel } from '@/components/ui/field'
import { Label } from '@/components/ui/label'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group'
import '../../SupplyPublicationComposition.css'
import { SUPPLY_SOURCE_TYPE_COPY, type SupplySourceFieldsProps } from '../supply-source-type.contracts'
import { UrlFieldWithPreflight } from './SourceValidationResults'

export function SupplySourceFields({
  resourceUrl,
  x402Method,
  askMethod = false,
  disabled,
  discoverDiagnostic,
  onResourceUrlChange,
  onX402MethodChange,
}: SupplySourceFieldsProps) {
  return (
    <>
      <UrlFieldWithPreflight
        id="supply-native-x402-url"
        label="x402 resource URL"
        value={resourceUrl}
        description={SUPPLY_SOURCE_TYPE_COPY.x402ResourceUrl.description}
        placeholder={SUPPLY_SOURCE_TYPE_COPY.x402ResourceUrl.placeholder}
        example={SUPPLY_SOURCE_TYPE_COPY.httpsExample.x402}
        disabled={disabled}
        discoverDiagnostic={discoverDiagnostic}
        onChange={onResourceUrlChange}
      />
      {askMethod ? (
        <Field className="arc-market arc-publication-field">
          <FieldLabel id="supply-native-x402-method-label">Method</FieldLabel>
          <RadioGroup aria-labelledby="supply-native-x402-method-label" value={x402Method} disabled={disabled} className="arc-publication-options arc-publication-price-options" onValueChange={(next) => onX402MethodChange(next as 'GET' | 'POST')}>
            <Label className="arc-publication-choice"><RadioGroupItem value="GET" />GET</Label>
            <Label className="arc-publication-choice"><RadioGroupItem value="POST" />POST</Label>
          </RadioGroup>
          <FieldDescription>Both methods returned a payment challenge. Choose the one to list.</FieldDescription>
        </Field>
      ) : null}
    </>
  )
}
