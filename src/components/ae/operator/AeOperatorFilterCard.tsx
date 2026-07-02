import type { ReactNode } from 'react'
import { SearchIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Field, FieldDescription, FieldGroup, FieldLabel, getFieldAccessibility } from '@/components/ui/field'
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
    <Card className="ae-operator-filter">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        <form action={action} method="get" className={gridClass}>
          <FieldGroup className={fields.length >= 3 ? 'contents' : undefined}>
            {fields.map((field) => {
              const fieldA11y = getFieldAccessibility({
                id: field.id,
                hasDescription: field.description !== undefined,
              })

              return (
                <Field key={field.id} {...fieldA11y.fieldProps}>
                  <FieldLabel htmlFor={fieldA11y.controlProps.id}>{field.label}</FieldLabel>
                  <Input
                    {...fieldA11y.controlProps}
                    name={field.name}
                    defaultValue={field.defaultValue ?? ''}
                    autoComplete="off"
                  />
                  {field.description === undefined ? null : (
                    <FieldDescription {...fieldA11y.descriptionProps}>{field.description}</FieldDescription>
                  )}
                </Field>
              )
            })}
          </FieldGroup>
          <div className="flex flex-wrap items-end gap-2">
            <Button type="submit">
              <SearchIcon data-icon="inline-start" aria-hidden="true" />
              {submitLabel}
            </Button>
            {trailing}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
