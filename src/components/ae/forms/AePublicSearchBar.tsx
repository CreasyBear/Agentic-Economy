import { useState } from 'react'
import { SearchIcon } from 'lucide-react'
import { TextInput } from '@astryxdesign/core/TextInput'

import { AeActionButton } from '@/components/ae/motion/AeActionButton'

export type AePublicSearchBarProps = {
  id: string
  name: string
  label: string
  defaultValue?: string
  placeholder?: string
  submitLabel?: string
  action: string
  method?: 'get' | 'post'
  hiddenFields?: readonly { name: string; value: string }[]
}

const EMPTY_HIDDEN_FIELDS: NonNullable<AePublicSearchBarProps['hiddenFields']> = []

export function AePublicSearchBar({
  name,
  label,
  defaultValue = '',
  placeholder,
  submitLabel = 'Search',
  action,
  method = 'get',
  hiddenFields = EMPTY_HIDDEN_FIELDS,
}: AePublicSearchBarProps) {
  const [query, setQuery] = useState(defaultValue)

  return (
    <form action={action} method={method} className="grid gap-2">
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <TextInput
          label={label}
          htmlName={name}
          type={'search' as 'text'}
          value={query}
          startIcon={<SearchIcon aria-hidden="true" />}
          {...(placeholder === undefined ? {} : { placeholder })}
          onChange={setQuery}
        />
        {hiddenFields.map((field) => (
          <input key={field.name} type="hidden" name={field.name} value={field.value} />
        ))}
        <AeActionButton type="submit" leadingIcon={<SearchIcon />}>
          {submitLabel}
        </AeActionButton>
      </div>
    </form>
  )
}
