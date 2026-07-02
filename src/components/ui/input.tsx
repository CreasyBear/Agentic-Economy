import * as React from 'react'

import { cn } from '@/lib/utils'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      data-slot="input"
      type={type}
      className={cn(
        'ae-control-field flex h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base leading-6 text-foreground shadow-xs outline-none transition-[border-color,box-shadow,background-color] duration-[var(--ae-duration-state)] ease-[var(--ae-ease-state)] placeholder:text-muted-foreground hover:border-ring/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20',
        className
      )}
      {...props}
    />
  )
}

export { Input }
