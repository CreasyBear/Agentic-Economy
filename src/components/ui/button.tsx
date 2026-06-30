import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "ae-button group/button inline-flex min-h-11 shrink-0 touch-manipulation items-center justify-center rounded-[var(--ae-radius-md)] border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,opacity,transform] outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:opacity-90 disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_[data-icon=inline-end]]:ml-0.5 [&_[data-icon=inline-start]]:-ml-0.5 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg]:transition-opacity [&_svg]:duration-150 [&_svg]:ease-out [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "ae-button-default bg-primary text-primary-foreground hover:bg-primary/80",
        publicPrimary:
          "ae-button-public-primary bg-primary text-primary-foreground hover:bg-primary/80 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/85",
        landingPrimary:
          "ae-button-landing-primary bg-[var(--ae-public-amber)] text-[var(--ae-public-amber-fg)] hover:bg-[var(--ae-public-amber-deep)] dark:bg-[var(--ae-public-amber)] dark:text-[var(--ae-public-amber-fg)] dark:hover:bg-[var(--ae-public-amber-deep)]",
        outline:
          "ae-button-outline border-border bg-background hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "ae-button-secondary bg-secondary text-secondary-foreground hover:bg-muted hover:text-foreground aria-expanded:bg-secondary aria-expanded:text-secondary-foreground",
        ghost:
          "ae-button-ghost hover:bg-muted hover:text-foreground aria-expanded:bg-muted aria-expanded:text-foreground dark:hover:bg-muted/50",
        destructive:
          "ae-button-destructive bg-destructive/10 text-destructive hover:bg-destructive/20 focus-visible:border-destructive/40 focus-visible:ring-destructive/20 dark:bg-destructive/20 dark:hover:bg-destructive/30 dark:focus-visible:ring-destructive/40",
        link: "ae-button-link text-primary underline-offset-4 hover:underline",
      },
      size: {
        default:
          "ae-button-size-default h-11 gap-2 px-5 has-data-[icon=inline-end]:pr-4 has-data-[icon=inline-start]:pl-4",
        xs: "ae-button-size-xs h-11 gap-1 px-3 text-xs in-data-[slot=button-group]:rounded-[var(--ae-radius-md)] has-data-[icon=inline-end]:pr-2.5 has-data-[icon=inline-start]:pl-2.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "ae-button-size-sm h-11 gap-1.5 px-4 text-sm in-data-[slot=button-group]:rounded-[var(--ae-radius-md)] has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3 [&_svg:not([class*='size-'])]:size-3.5",
        lg: "ae-button-size-lg h-12 gap-2 px-6 has-data-[icon=inline-end]:pr-5 has-data-[icon=inline-start]:pl-5",
        icon: "ae-button-size-icon size-11",
        "icon-xs":
          "ae-button-size-icon-xs size-11 in-data-[slot=button-group]:rounded-[var(--ae-radius-md)] [&_svg:not([class*='size-'])]:size-3",
        "icon-sm":
          "ae-button-size-icon-sm size-11 in-data-[slot=button-group]:rounded-[var(--ae-radius-md)]",
        "icon-lg": "ae-button-size-icon-lg size-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
