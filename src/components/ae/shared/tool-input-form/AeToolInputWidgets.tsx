'use client'

import type { ChangeEvent, FocusEvent, MouseEvent } from 'react'
import { createElement, useCallback } from 'react'
import { SchemaExamples } from '@rjsf/core'
import {
  ariaDescribedByIds,
  descriptionId,
  examplesId,
  getInputProps,
  getTemplate,
  labelValue,
  schemaRequiresTrueValue,
} from '@rjsf/utils'
import type { BaseInputTemplateProps, WidgetProps } from '@rjsf/utils'

import { Checkbox } from '@/components/arc/checkbox/checkbox'
import { Input } from '@/components/arc/input/input'
import { Textarea } from '@/components/arc/textarea/textarea'

export function AeToolBaseInputTemplate({
  id,
  htmlName,
  placeholder,
  required,
  readonly,
  disabled,
  type,
  value,
  onChange,
  onChangeOverride,
  onBlur,
  onFocus,
  autofocus,
  options,
  schema,
  rawErrors = [],
  children,
  extraProps,
  className,
  registry,
  label,
}: BaseInputTemplateProps) {
  const { ClearButton } = registry.templates.ButtonTemplates
  const inputProps = {
    ...extraProps,
    ...getInputProps(schema, type, options),
  }
  const handleChange = ({ target: { value: newValue } }: ChangeEvent<HTMLInputElement>) =>
    onChange(newValue === '' ? options.emptyValue : newValue)
  const handleBlur = ({ target }: FocusEvent<HTMLInputElement>) => onBlur(id, target?.value)
  const handleFocus = ({ target }: FocusEvent<HTMLInputElement>) => onFocus(id, target?.value)
  const handleClear = useCallback(
    (event: MouseEvent) => {
      event.preventDefault()
      event.stopPropagation()
      onChange(options.emptyValue ?? '')
    },
    [onChange, options.emptyValue],
  )

  return (
    <div className="p-0.5">
      <Input
        id={id}
        name={htmlName || id}
        type={type}
        placeholder={placeholder}
        autoFocus={autofocus}
        required={required}
        disabled={disabled}
        readOnly={readonly}
        className={className}
        list={schema.examples ? examplesId(id) : undefined}
        {...inputProps}
        value={value || value === 0 ? value : ''}
        onChange={onChangeOverride || handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        aria-invalid={rawErrors.length > 0 ? true : undefined}
        aria-describedby={ariaDescribedByIds(id, !!schema.examples)}
        label={label}
        labelMode="external"
      />
      {options.allowClearTextInputs && !readonly && !disabled && value && (
        <ClearButton onClick={handleClear} registry={registry} />
      )}
      {children}
      <SchemaExamples id={id} schema={schema} />
    </div>
  )
}

export function AeToolTextareaWidget({
  id,
  htmlName,
  placeholder,
  value,
  required,
  disabled,
  autofocus,
  readonly,
  onBlur,
  onFocus,
  onChange,
  options,
  className,
  label,
}: WidgetProps) {
  const handleChange = ({ target: { value: newValue } }: ChangeEvent<HTMLTextAreaElement>) =>
    onChange(newValue === '' ? options.emptyValue : newValue)
  const handleBlur = ({ target }: FocusEvent<HTMLTextAreaElement>) => onBlur(id, target?.value)
  const handleFocus = ({ target }: FocusEvent<HTMLTextAreaElement>) => onFocus(id, target?.value)

  return (
    <div className="p-0.5">
      <Textarea
        id={id}
        name={htmlName || id}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readonly}
        value={value ?? ''}
        required={required}
        autoFocus={autofocus}
        rows={options.rows || 5}
        onChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        aria-describedby={ariaDescribedByIds(id)}
        className={className}
        label={label}
        labelMode="external"
      />
    </div>
  )
}

export function AeToolCheckboxWidget(props: WidgetProps) {
  const {
    id,
    htmlName,
    value,
    disabled,
    readonly,
    label,
    hideLabel,
    schema,
    autofocus,
    options,
    onChange,
    onBlur,
    onFocus,
    registry,
    uiSchema,
    className,
  } = props
  const required = schemaRequiresTrueValue(schema)
  const DescriptionFieldTemplate = getTemplate('DescriptionFieldTemplate', registry, options)
  const handleChange = (checked: boolean | 'indeterminate') => onChange(checked === true)
  const handleBlur = () => onBlur(id, value)
  const handleFocus = () => onFocus(id, value)
  const description = options.description || schema.description
  const visibleLabel = labelValue(label, hideLabel || !label)

  return (
    <>
      {/* RJSF resolves an existing registry/field template; it does not create a component. */}
      {!hideLabel && description && createElement(DescriptionFieldTemplate, {
        id: descriptionId(id), description, schema, registry,
        ...(uiSchema === undefined ? {} : { uiSchema }),
      })}
      <Checkbox
        id={id}
        name={htmlName || id}
        checked={typeof value === 'undefined' ? false : Boolean(value)}
        required={required}
        disabled={disabled || readonly}
        autoFocus={autofocus}
        onCheckedChange={handleChange}
        onBlur={handleBlur}
        onFocus={handleFocus}
        aria-describedby={ariaDescribedByIds(id)}
        className={className}
        {...(visibleLabel ? { label: visibleLabel } : {})}
      />
    </>
  )
}
