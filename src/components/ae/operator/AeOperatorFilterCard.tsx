import { useState, type ReactNode } from 'react'
import { SearchIcon } from 'lucide-react'

import { Button } from '@astryxdesign/core/Button'
import { Card } from '@astryxdesign/core/Card'
import { TextInput } from '@astryxdesign/core/TextInput'

export type AeOperatorFilterField = {
  id: string
  name: string
  label: string
  description?: string
  defaultValue?: string
}

export type AeOperatorFilterCardProps = {
  action: string
  title: string
  description: string
  fields: readonly AeOperatorFilterField[]
  submitLabel?: string
  trailing?: ReactNode
}

export function AeOperatorFilterCard({
  action,
  title,
  description,
  fields,
  submitLabel = 'Filter',
  trailing,
}: AeOperatorFilterCardProps) {
  const gridClass =
    fields.length >= 3
      ? 'grid gap-4 md:grid-cols-[repeat(3,minmax(0,1fr))_auto] md:items-end'
      : fields.length === 2
        ? 'grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end'
        : 'grid gap-4 md:grid-cols-[1fr_auto] md:items-end'

  return (
    <Card padding={5}>
      <div className="grid gap-1.5">
        <div className="text-lg font-semibold text-primary">{title}</div>
        <div className="text-sm leading-6 text-secondary">{description}</div>
      </div>
      <div className="mt-4 grid gap-4">
        <form action={action} method="get" className={gridClass}>
          <div className={fields.length >= 3 ? 'contents' : undefined}>
            {fields.map((field) => (
              <OperatorFilterTextField key={field.id} field={field} />
            ))}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <Button type="submit" label={submitLabel} icon={<SearchIcon data-icon="inline-start" aria-hidden="true" />} />
            {trailing}
          </div>
        </form>
      </div>
    </Card>
  )
}

function OperatorFilterTextField({ field }: { field: AeOperatorFilterField }) {
  const [value, setValue] = useState(field.defaultValue ?? '')

  return (
    <TextInput
      label={field.label}
      htmlName={field.name}
      value={value}
      onChange={setValue}
      {...(field.description === undefined ? {} : { description: field.description })}
    />
  )
}
