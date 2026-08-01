import { useState, type ReactNode } from 'react'
import { SearchIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

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
    <Card className="border border-border bg-card">
      <CardHeader className="gap-1.5 p-5">
        <CardTitle className="text-lg text-foreground">{title}</CardTitle>
        <CardDescription className="text-sm leading-6 text-muted-foreground">{description}</CardDescription>
      </CardHeader>
      <CardContent className="p-5 pt-0">
        <form action={action} method="get" className={gridClass}>
          <FieldGroup className="contents">
            {fields.map((field) => (
              <OperatorFilterTextField key={field.id} field={field} />
            ))}
          </FieldGroup>
          <div className="flex flex-wrap items-end gap-2">
            <Button type="submit" className="min-h-11">
              <SearchIcon aria-hidden="true" data-icon="inline-start" />
              <span>{submitLabel}</span>
            </Button>
            {trailing}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function OperatorFilterTextField({ field }: { field: AeOperatorFilterField }) {
  const [value, setValue] = useState(field.defaultValue ?? '')
  const descriptionId = `${field.id}-description`

  return (
    <Field>
      <FieldLabel htmlFor={field.id}>{field.label}</FieldLabel>
      <Input
        id={field.id}
        name={field.name}
        value={value}
        onChange={(event) => setValue(event.currentTarget.value)}
        {...(field.description === undefined ? {} : { 'aria-describedby': descriptionId })}
      />
      {field.description === undefined ? null : (
        <FieldDescription id={descriptionId}>{field.description}</FieldDescription>
      )}
    </Field>
  )
}
