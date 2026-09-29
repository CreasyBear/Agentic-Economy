import * as React from "react"
import { Switch as SwitchPrimitive } from "@base-ui/react/switch"

import { cn } from "@/lib/utils"

function Switch({
  className,
  checked,
  nativeButton = true,
  render,
  ...props
}: SwitchPrimitive.Root.Props & {
  render?: SwitchPrimitive.Root.Props["render"]
}) {
  return (
    <SwitchPrimitive.Root
      data-slot="switch"
      nativeButton={nativeButton}
      render={render ?? <button type="button" />}
      className={cn(
        "peer inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-[background-color,box-shadow,transform] duration-fast ease-standard outline-none enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 data-[checked]:bg-primary data-[unchecked]:bg-muted dark:data-[unchecked]:bg-input/50 max-sm:min-h-touch max-sm:min-w-11",
        className
      )}
      {...(checked === undefined ? {} : { checked })}
      {...props}
    >
      <SwitchPrimitive.Thumb
        data-slot="switch-thumb"
        className={cn(
          "pointer-events-none block size-5 rounded-full border border-border bg-background shadow-xs ring-0 transition-[transform] duration-fast ease-standard motion-reduce:transition-none data-[checked]:translate-x-5 data-[unchecked]:translate-x-0"
        )}
      />
    </SwitchPrimitive.Root>
  )
}

export { Switch }
