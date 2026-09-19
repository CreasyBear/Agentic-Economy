import * as React from "react"
import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"
import { buttonVariants } from "./button-variants"

function Button({
  className,
  variant = "default",
  size = "default",
  render,
  nativeButton = true,
  ...props
}: ButtonPrimitive.Props &
  VariantProps<typeof buttonVariants> & {
    render?: ButtonPrimitive.Props["render"]
    nativeButton?: boolean
  }) {
  return (
    <ButtonPrimitive
      data-slot="button"
      data-variant={variant}
      data-size={size}
      render={render}
      nativeButton={nativeButton}
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}

export { Button }
