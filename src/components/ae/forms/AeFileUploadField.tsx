'use client'

import { useId, useState } from 'react'

import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

export function AeFileUploadField({
  label,
  description,
  accept,
  multiple = true,
}: {
  label: string
  description: string
  accept?: string
  multiple?: boolean
}) {
  const id = useId()
  const descriptionId = `${id}-description`
  const [files, setFiles] = useState<readonly File[]>([])

  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Input
          id={id}
          type="file"
          multiple={multiple}
          {...(accept === undefined ? {} : { accept })}
          aria-describedby={descriptionId}
          onChange={(event) => {
            const selected = event.currentTarget.files
            setFiles(selected === null ? [] : Array.from(selected))
          }}
        />
        <FieldDescription id={descriptionId}>{description}</FieldDescription>
        {files.length === 0 ? null : (
          <p className="text-sm text-muted-foreground" role="status">
            {files.map((file) => file.name).join(', ')}
          </p>
        )}
      </Field>
    </FieldGroup>
  )
}
