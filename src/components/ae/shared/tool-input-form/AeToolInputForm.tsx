// Invariant: Tool forms expose changes without submission, following Market's DirectoryToolPlayground.
import Form from '@rjsf/shadcn'
import ShadcnFieldTemplate from '@rjsf/shadcn/lib/FieldTemplate/index.js'
import { createElement } from 'react'
import {
  descriptionId,
  getSchemaType,
  getTemplate,
  getUiOptions,
} from '@rjsf/utils'
import type { FieldTemplateProps, RJSFSchema, UiSchema } from '@rjsf/utils'

import {
  AeToolBaseInputTemplate,
  AeToolCheckboxWidget,
  AeToolTextareaWidget,
} from './AeToolInputWidgets'
import { toolInputValidator } from './tool-input-form'

function AeToolInputFieldTemplate(props: FieldTemplateProps) {
  const uiOptions = getUiOptions(props.uiSchema)
  const widget = uiOptions.widget
  const type = getSchemaType(props.schema)
  const arcOwnsLabel = props.displayLabel && !uiOptions.field && (
    widget === 'textarea' ||
    ((widget === undefined || widget === 'text') &&
      (type === 'string' || type === 'number' || type === 'integer') &&
      props.schema.enum === undefined &&
      props.schema.oneOf === undefined &&
      props.schema.anyOf === undefined)
  )
  if (!arcOwnsLabel) return <ShadcnFieldTemplate {...props} />

  const DescriptionFieldTemplate = getTemplate('DescriptionFieldTemplate', props.registry, uiOptions)
  const description = props.rawDescription
    ? createElement(DescriptionFieldTemplate, {
        id: descriptionId(props.id),
        description: props.description ?? "",
        schema: props.schema,
        registry: props.registry,
        ...(props.uiSchema === undefined ? {} : { uiSchema: props.uiSchema }),
      })
    : null
  return (
    <ShadcnFieldTemplate {...props} displayLabel={false}>
      <>
        {props.children}
        {description}
      </>
    </ShadcnFieldTemplate>
  )
}

export type AeToolInputFormProps = Readonly<{
  idPrefix: string
  schema: RJSFSchema
  value: unknown
  uiSchema?: UiSchema
  onChange: (value: unknown) => void
}>

export function AeToolInputForm({ idPrefix, schema, value, uiSchema, onChange }: AeToolInputFormProps) {
  return <Form idPrefix={idPrefix} schema={schema} validator={toolInputValidator} formData={value}
    templates={{ BaseInputTemplate: AeToolBaseInputTemplate, FieldTemplate: AeToolInputFieldTemplate }}
    widgets={{ TextareaWidget: AeToolTextareaWidget, CheckboxWidget: AeToolCheckboxWidget }}
    onChange={event => onChange(event.formData)}
    uiSchema={{ 'ui:submitButtonOptions': { norender: true }, ...uiSchema }}
    experimental_defaultFormStateBehavior={{ emptyObjectFields: 'skipDefaults', arrayMinItems: { populate: 'never' }, constAsDefaults: 'never' }}
    omitExtraData={false} liveOmit={false} showErrorList={false} />
}
