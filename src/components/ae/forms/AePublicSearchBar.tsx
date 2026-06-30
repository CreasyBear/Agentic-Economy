import { SearchIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { InputGroup, InputGroupAddon, InputGroupInput } from '@/components/ui/input-group'

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

export function AePublicSearchBar({
  id,
  name,
  label,
  defaultValue = '',
  placeholder,
  submitLabel = 'Search',
  action,
  method = 'get',
  hiddenFields = [],
}: AePublicSearchBarProps) {
  return (
    <form action={action} method={method} className="ae-public-search-bar grid gap-2">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
      </label>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <InputGroup className="ae-public-search-bar__group min-h-11">
          <InputGroupAddon align="inline-start">
            <SearchIcon aria-hidden="true" className="size-4 text-muted-foreground" />
          </InputGroupAddon>
          <InputGroupInput
            id={id}
            name={name}
            type="search"
            defaultValue={defaultValue}
            placeholder={placeholder}
            autoComplete="off"
          />
        </InputGroup>
        {hiddenFields.map((field) => (
          <input key={field.name} type="hidden" name={field.name} value={field.value} />
        ))}
        <Button type="submit">
          <SearchIcon data-icon="inline-start" aria-hidden="true" />
          {submitLabel}
        </Button>
      </div>
    </form>
  )
}
