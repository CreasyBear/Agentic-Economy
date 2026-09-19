import * as React from "react"
import { ChevronRight, MoreHorizontal } from "lucide-react"
import { useRender } from "@base-ui/react/use-render"

import { cn } from "@/lib/utils"

function Breadcrumb({ ...props }: React.ComponentProps<"nav">) {
  return <nav aria-label="breadcrumb" data-slot="breadcrumb" {...props} />
}

function BreadcrumbList({ className, ...props }: React.ComponentProps<"ol">) {
  return (
    <ol
      data-slot="breadcrumb-list"
      className={cn(
        "flex flex-wrap items-center gap-1.5 text-sm break-words text-muted-foreground sm:gap-2.5",
        className
      )}
      {...props}
    />
  )
}

function BreadcrumbItem({ className, ...props }: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-item"
      className={cn("inline-flex items-center gap-1.5", className)}
      {...props}
    />
  )
}

function BreadcrumbLink({
  className,
  render,
  ...props
}: React.ComponentProps<"a"> & {
  render?: useRender.RenderProp
}) {
  return useRender({
    render,
    props: {
      "data-slot": "breadcrumb-link",
      className: cn(
        "inline-flex items-center transition-[color,transform] duration-100 ease-out hover:text-foreground active:scale-[0.98] motion-reduce:transition-none motion-reduce:active:scale-100 max-sm:min-h-touch",
        className
      ),
      ...props,
    },
    defaultTagName: "a",
  })
}

function BreadcrumbPage({
  href,
  className,
  ...props
}: React.ComponentProps<"span"> & { href?: string }) {
  if (href !== undefined) {
    return (
      <a
        data-slot="breadcrumb-page"
        href={href}
        aria-current="page"
        className={cn("font-normal text-foreground", className)}
        {...(props as React.ComponentProps<"a">)}
      />
    )
  }
  return (
    <span
      data-slot="breadcrumb-page"
      aria-current="page"
      className={cn("font-normal text-foreground", className)}
      {...props}
    />
  )
}

function BreadcrumbSeparator({
  children,
  className,
  ...props
}: React.ComponentProps<"li">) {
  return (
    <li
      data-slot="breadcrumb-separator"
      role="presentation"
      aria-hidden="true"
      className={cn("[&>svg]:size-3.5", className)}
      {...props}
    >
      {children ?? <ChevronRight />}
    </li>
  )
}

function BreadcrumbEllipsis({
  className,
  ...props
}: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="breadcrumb-ellipsis"
      role="presentation"
      aria-hidden="true"
      className={cn("flex size-8 items-center justify-center", className)}
      {...props}
    >
      <MoreHorizontal className="size-4" />
      <span className="sr-only">More</span>
    </span>
  )
}

export {
  Breadcrumb,
  BreadcrumbList,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbPage,
  BreadcrumbSeparator,
  BreadcrumbEllipsis,
}
