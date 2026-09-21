import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import type { PrivacyMomentTabsProps } from '../privacy.contracts'

export function PrivacyMomentTabs({ moments }: PrivacyMomentTabsProps) {
  return (
    <section className="border-t border-border pt-section">
      <div className="grid gap-related">
        <Tabs defaultValue="call">
          <TabsList aria-label="Privacy moments" className="h-auto min-h-touch w-full flex-wrap justify-start gap-1 p-1 sm:flex-nowrap">
            {moments.map(({ value, label }) => (
              <TabsTrigger key={value} value={value} className="min-h-touch shrink-0 flex-none px-3 sm:flex-1">{label}</TabsTrigger>
            ))}
          </TabsList>
          {moments.map(({ value, icon: Icon, title, points }) => (
            <TabsContent key={value} value={value}>
              <div className="grid gap-related border-t border-border pt-related">
                <p className="flex items-center gap-intra text-lg font-medium text-foreground">
                  <Icon className="size-4 text-foreground" aria-hidden="true" /> {title}
                </p>
                <ul className="grid gap-related text-sm leading-6 text-muted-foreground">
                  {points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
              </div>
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  )
}
