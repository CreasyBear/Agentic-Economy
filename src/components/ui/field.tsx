import * as React from 'react'

import { cn } from '@/lib/utils'

type FieldAccessibilityOptions = {
  id: string
  invalid?: boolean
  hasDescription?: boolean
  hasError?: boolean
  describedBy?: string | readonly string[]
}

function normalizeDescribedBy(describedBy: FieldAccessibilityOptions['describedBy']) {
  if (describedBy === undefined) {
    return []
  }

  if (typeof describedBy === 'string') {
    return describedBy.split(' ').filter(Boolean)
  }

  return describedBy.filter(Boolean)
}

function getFieldAccessibility({
  id,
  invalid = false,
  hasDescription = false,
  hasError = false,
  describedBy,
}: FieldAccessibilityOptions) {
  const descriptionId = `${id}-description`
  const errorId = `${id}-error`
  const describedByIds = normalizeDescribedBy(describedBy)

  if (hasDescription) {
    describedByIds.push(descriptionId)
  }

  if (hasError) {
    describedByIds.push(errorId)
  }

  return {
    fieldProps: {
      'data-invalid': invalid ? true : undefined,
    },
    controlProps: {
      id,
      'aria-describedby': describedByIds.join(' ') || undefined,
      'aria-invalid': invalid || undefined,
    },
    descriptionProps: {
      id: descriptionId,
    },
    errorProps: {
      id: errorId,
    },
  }
}

function FieldGroup({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="field-group" className={cn('grid gap-4', className)} {...props} />
}

function Field({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="field" className={cn('grid gap-2', className)} {...props} />
}

function FieldLabel({ className, ...props }: React.ComponentProps<'label'>) {
  return <label data-slot="field-label" className={cn('text-sm font-medium text-foreground', className)} {...props} />
}

function FieldDescription({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="field-description" className={cn('text-sm text-muted-foreground', className)} {...props} />
}

function FieldError({ className, ...props }: React.ComponentProps<'p'>) {
  return <p data-slot="field-error" aria-live="polite" className={cn('text-sm text-destructive', className)} {...props} />
}

function FieldSet({ className, ...props }: React.ComponentProps<'fieldset'>) {
  return <fieldset data-slot="field-set" className={cn('grid gap-3', className)} {...props} />
}

function FieldLegend({ className, ...props }: React.ComponentProps<'legend'>) {
  return <legend data-slot="field-legend" className={cn('text-sm font-medium text-foreground', className)} {...props} />
}

export { Field, FieldDescription, FieldError, FieldGroup, FieldLabel, FieldLegend, FieldSet, getFieldAccessibility }
export type { FieldAccessibilityOptions }
