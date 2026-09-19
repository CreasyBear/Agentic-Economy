import * as React from "react"
import { CheckIcon, MinusIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "@base-ui/react/checkbox"

import { cn } from "@/lib/utils"

type CheckboxProps = Omit<
  React.ComponentProps<typeof CheckboxPrimitive.Root>,
  "checked" | "defaultChecked" | "onCheckedChange" | "indeterminate"
> & {
  checked?: boolean | "indeterminate"
  defaultChecked?: boolean | "indeterminate"
  onCheckedChange?: (checked: boolean | "indeterminate") => void
}

function Checkbox({
  className,
  checked,
  defaultChecked,
  onCheckedChange,
  render,
  nativeButton = true,
  ...props
}: CheckboxProps) {
  const indeterminate =
    checked === "indeterminate" ||
    (checked === undefined && defaultChecked === "indeterminate")

  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      nativeButton={nativeButton}
      render={render ?? <button type="button" />}
      className={cn(
        "peer size-4 shrink-0 rounded-[4px] border border-input shadow-xs transition-[box-shadow,transform] outline-none enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground data-indeterminate:border-primary data-indeterminate:bg-primary data-indeterminate:text-primary-foreground dark:bg-input/30 dark:aria-invalid:ring-destructive/40 dark:data-checked:bg-primary dark:data-indeterminate:bg-primary",
        className
      )}
      {...(checked === undefined
        ? {}
        : { checked: checked === "indeterminate" ? false : checked })}
      {...(defaultChecked === undefined
        ? {}
        : {
            defaultChecked:
              defaultChecked === "indeterminate" ? false : defaultChecked,
          })}
      indeterminate={indeterminate}
      onCheckedChange={(nextChecked) => {
        onCheckedChange?.(nextChecked)
      }}
      {...props}
    >
      <CheckboxPrimitive.Indicator
        data-slot="checkbox-indicator"
        className="grid place-content-center text-current transition-none"
      >
        {indeterminate ? (
          <MinusIcon className="size-3.5" />
        ) : (
          <CheckIcon className="size-3.5" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}

export { Checkbox }
