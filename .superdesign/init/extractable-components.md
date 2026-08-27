# Extractable components (operator)

## OperatorShell
- Source: `src/components/ae/layout/AeOperatorShell.tsx`
- Category: layout
- Description: Inset sidebar provider, skip link, top bar, record header, optional secondary bar, main well
- Extractable props: operatorRole, title, description, currentPath, secondaryBar
- Hardcoded: skip link copy, SidebarInset `bg-card`, min-h-touch header

## OperatorSidebar
- Source: `src/components/ae/layout/AeOperatorSidebar.tsx`
- Category: layout
- Description: Workspace nav with Search, Records, Work, Account, Resources
- Extractable props: operatorRole, currentPath, navBadges
- Hardcoded: labels from `navigation.ts`, favicon 32px, kbd `/`

## RecordHeader
- Source: `src/components/ae/layout/AeRecordHeader.tsx`
- Category: layout
- Description: Compact title, description, optional 32px icon box, trailing actions
- Extractable props: title, description
- Hardcoded: text-base semibold title, text-sm muted description, border-b

## SettingsNav
- Source: `src/components/ae/settings/OwnerSettingsNav.tsx`
- Category: layout
- Description: Grouped underline tabs (User / Workspace / Developers)
- Extractable props: current (profile|workspace|members|connections|credit|payouts|developers)
- Hardcoded: group labels and item labels from settings-navigation.ts, min-h-touch, border-b-2 current

## SettingsSection
- Source: `src/components/ae/layout/AeSection.tsx` (`AeSection`, `AeSettingsStack`, `AeSettingsRow`)
- Category: basic
- Description: Section heading + description; stacked settings rows with chevron
- Extractable props: title, description, href
- Hardcoded: max-w-3xl stack, min-h-touch rows, rounded-md border

Do not extract Button, Input, Alert, Card as Superdesign components — inline them.
