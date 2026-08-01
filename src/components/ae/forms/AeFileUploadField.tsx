'use client'

import { useId, useState } from 'react'

import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

export function AeFileUploadField({
  label,
  description,
  accept,
  multiple = true,
  errorMessage,
}: {
  label: string
  description: string
  accept?: string
  multiple?: boolean
  errorMessage?: string
}) {
  const id = useId()
  const descriptionId = `${id}-description`
  const errorId = `${id}-error`
  const describedBy = errorMessage === undefined ? descriptionId : `${descriptionId} ${errorId}`
  const [files, setFiles] = useState<readonly File[]>([])

  return (
    <FieldGroup>
      <Field {...(errorMessage === undefined ? {} : { 'data-invalid': true })}>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Input
          id={id}
          type="file"
          multiple={multiple}
          {...(accept === undefined ? {} : { accept })}
          aria-describedby={describedBy}
          {...(errorMessage === undefined ? {} : { 'aria-invalid': true })}
          onChange={(event) => {
            const selected = event.currentTarget.files
            setFiles(selected === null ? [] : Array.from(selected))
          }}
        />
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
        {errorMessage === undefined ? null : <FieldError id={errorId}>{errorMessage}</FieldError>}
        {files.length === 0 ? null : (
          <p className="text-sm text-muted-foreground" role="status">
            {files.map((file) => file.name).join(', ')}
          </p>
        )}
      </Field>
    </FieldGroup>
  )
}
