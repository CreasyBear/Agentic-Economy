// Invariant: Tool forms expose changes without submission, following Market's DirectoryToolPlayground.
import Form from '@rjsf/shadcn'
import type { RJSFSchema, UiSchema } from '@rjsf/utils'

import { toolInputValidator } from './tool-input-form'

export type AeToolInputFormProps = Readonly<{
  idPrefix: string
  schema: RJSFSchema
  value: unknown
  uiSchema?: UiSchema
  onChange: (value: unknown) => void
}>

export function AeToolInputForm({ idPrefix, schema, value, uiSchema, onChange }: AeToolInputFormProps) {
  return <Form idPrefix={idPrefix} schema={schema} validator={toolInputValidator} formData={value}
    onChange={event => onChange(event.formData)}
    uiSchema={{ 'ui:submitButtonOptions': { norender: true }, ...uiSchema }}
    experimental_defaultFormStateBehavior={{ emptyObjectFields: 'skipDefaults', arrayMinItems: { populate: 'never' }, constAsDefaults: 'never' }}
    omitExtraData={false} liveOmit={false} showErrorList={false} />
}
