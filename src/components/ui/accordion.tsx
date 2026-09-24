import * as React from "react"
import { ChevronDownIcon } from "lucide-react"
import { Accordion as AccordionPrimitive } from "@base-ui/react/accordion"

import { cn } from "@/lib/utils"

type AccordionProps = Omit<
  React.ComponentProps<typeof AccordionPrimitive.Root>,
  "value" | "defaultValue" | "onValueChange" | "multiple"
> & {
  type?: "single" | "multiple"
  collapsible?: boolean
  value?: string | string[]
  defaultValue?: string | string[]
  onValueChange?: (value: string | string[]) => void
}

function toAccordionValue(
  value: string | string[] | undefined
): string[] | undefined {
  if (value === undefined) {
    return undefined
  }
  if (Array.isArray(value)) {
    return value
  }
  if (value === "") {
    return []
  }
  return [value]
}

function Accordion({
  type = "single",
  collapsible = false,
  value,
  defaultValue,
  onValueChange,
  ...props
}: AccordionProps) {
  const multiple = type === "multiple"

  return (
    <AccordionPrimitive.Root
      data-slot="accordion"
      multiple={multiple}
      {...(toAccordionValue(value) === undefined
        ? {}
        : { value: toAccordionValue(value) })}
      {...(toAccordionValue(defaultValue) === undefined
        ? {}
        : { defaultValue: toAccordionValue(defaultValue) })}
      onValueChange={(nextValue) => {
        if (multiple) {
          onValueChange?.(nextValue)
          return
        }
        if (!collapsible && nextValue.length === 0) {
          return
        }
        onValueChange?.(nextValue[0] ?? "")
      }}
      {...props}
    />
  )
}

function AccordionItem({
  className,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Item>) {
  return (
    <AccordionPrimitive.Item
      data-slot="accordion-item"
      className={cn("border-b last:border-b-0", className)}
      {...props}
    />
  )
}

function AccordionTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Trigger>) {
  return (
    <AccordionPrimitive.Header className="flex">
      <AccordionPrimitive.Trigger
        data-slot="accordion-trigger"
        className={cn(
          "flex flex-1 items-start justify-between gap-4 rounded-md py-4 text-left text-sm font-medium transition-[color,background-color,border-color,box-shadow] duration-fast ease-standard outline-none enabled:active:scale-100 motion-reduce:transition-none hover:underline focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 max-sm:min-h-touch [&[data-panel-open]>svg]:rotate-180",
          className
        )}
        {...props}
      >
        {children}
        <ChevronDownIcon className="pointer-events-none size-4 shrink-0 translate-y-0.5 text-muted-foreground transition-transform duration-fast ease-standard" />
      </AccordionPrimitive.Trigger>
    </AccordionPrimitive.Header>
  )
}

function AccordionContent({
  className,
  children,
  ...props
}: React.ComponentProps<typeof AccordionPrimitive.Panel>) {
  return (
    <AccordionPrimitive.Panel
      data-slot="accordion-content"
      className="h-(--accordion-panel-height) overflow-hidden text-sm transition-[height] duration-base ease-emphasized data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none"
      {...props}
    >
      <div className={cn("pt-0 pb-4", className)}>{children}</div>
    </AccordionPrimitive.Panel>
  )
}

export { Accordion, AccordionItem, AccordionTrigger, AccordionContent }
