import { type ReactNode, type Ref, useId } from 'react'
import { ScrollArea } from '@base-ui/react/scroll-area'
import { Card, CardContent } from '@/components/ui/card'
import { Field, FieldContent, FieldDescription, FieldGroup } from '@/components/ui/field'

/**
 * Licensed REUI Profile 2: https://reui.io/preview/base/profile-2
 * profile.tsx SHA-256 f2def2414c95e98fa985269b5ffea5a2767b4673f7ef034b1094b988d64c2b6f
 * settings-section.tsx SHA-256 0e9a827d65d98badd560fa9a2de4b1e2aef9f9291c86f470c910959c5ac652c0
 * setting-row.tsx SHA-256 4ca5421f4e8e845fb272d9729fc940bab56b64a70d2bcc6e07eacf85d5f57ad6
 * Keeps its scroll view, headings, section cards and responsive field geometry.
 * Routed owners supply content and saves; native links replace local demo tabs.
 */
export function SettingsScrollView({ children }: { children: ReactNode }) {
  return <ScrollArea.Root className="min-w-0">
    <ScrollArea.Viewport className="w-full rounded-none outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <ScrollArea.Content>{children}</ScrollArea.Content>
    </ScrollArea.Viewport>
    <ScrollArea.Scrollbar orientation="horizontal" className="flex h-2.5 touch-none flex-col border-t border-t-transparent p-px transition-colors select-none">
      <ScrollArea.Thumb className="bg-border relative flex-1 rounded-full" />
    </ScrollArea.Scrollbar>
    <ScrollArea.Corner />
  </ScrollArea.Root>
}

export function ProfileSettingsPage({ title, description, action, children, headingRef }: {
  title: string; description: string; action?: ReactNode; children: ReactNode; headingRef?: Ref<HTMLHeadingElement>
}) {
  return <section className="min-w-0 flex flex-col gap-8">
    <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex flex-col gap-1">
        <h1 ref={headingRef} tabIndex={headingRef === undefined ? undefined : -1} className="text-2xl font-medium tracking-tight">{title}</h1>
        <p className="max-w-2xl text-sm leading-relaxed text-muted-foreground">{description}</p>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </header>
    <div className="min-w-0 flex flex-col gap-10">{children}</div>
  </section>
}

export function ProfileSettingsSection({ title, description, children }: {
  title: string; description?: string; children: ReactNode
}) {
  const id = useId()
  return <section aria-labelledby={id} className="flex min-w-0 flex-col gap-5">
    <header className="min-w-0 flex flex-col gap-1">
      <h2 id={id} className="text-lg font-medium tracking-tight">{title}</h2>
      {description ? <p className="text-sm leading-relaxed text-muted-foreground">{description}</p> : null}
    </header>
    <Card className="min-w-0 gap-0 p-0"><CardContent className="p-0">
      <FieldGroup className="gap-0 divide-y">{children}</FieldGroup>
    </CardContent></Card>
  </section>
}

export function ProfileSettingRow({ label, description, children }: {
  label: string; description?: string; children: ReactNode
}) {
  return <Field orientation="responsive" className="gap-4 px-5 py-4 @md/field-group:gap-12 @md/field-group:has-[>[data-slot=field-content]]:items-start">
    <div className="flex w-full min-w-0 flex-col gap-1 @md/field-group:w-1/2 @md/field-group:basis-1/2 @md/field-group:pr-6">
      <h3 className="text-sm font-medium">{label}</h3>
      {description ? <FieldDescription className="text-sm leading-6">{description}</FieldDescription> : null}
    </div>
    <FieldContent className="w-full min-w-0 @md/field-group:w-1/2 @md/field-group:basis-1/2 @md/field-group:pl-2">
      <div className="flex w-full min-w-0 justify-start">{children}</div>
    </FieldContent>
  </Field>
}
