'use client'

import { useState } from 'react'
import { FileInput } from '@astryxdesign/core/FileInput'

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
  const [files, setFiles] = useState<File | File[] | null>(null)

  return (
    <FileInput
      label={label}
      description={description}
      {...(accept === undefined ? {} : { accept })}
      isMultiple={multiple}
      value={files}
      onChange={setFiles}
    />
  )
}
