import { AeSiteHeading } from '@/components/ae/website/AeSiteType'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

import type { PrivacyNoticeOverviewProps } from '../privacy.contracts'

export function PrivacyNoticeOverview({
  meta,
  sections,
  disclosureSection,
  disclosureTable,
}: PrivacyNoticeOverviewProps) {
  return (
    <div className="grid gap-related">
      <div className="flex flex-wrap gap-x-related gap-y-intra text-sm text-muted-foreground">
        <p>{meta.versionLabel} {meta.version}</p>
        <p>{meta.lastUpdatedLabel} {meta.lastUpdated}</p>
      </div>

      <nav aria-label={meta.contentsLabel}>
        <ul className="flex flex-wrap gap-x-related gap-y-intra text-sm">
          {sections.map((section) => (
            <li key={section.id}>
              <a className="underline-offset-4 hover:underline" href={`#${section.id}`}>
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <section aria-labelledby={disclosureSection.id} className="grid gap-related border-t border-border pt-section">
        <AeSiteHeading as="h2" size="sm" id={disclosureSection.id}>
          {disclosureSection.label}
        </AeSiteHeading>
        <p className="text-sm text-muted-foreground">{disclosureTable.description}</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{disclosureTable.columns.category}</TableHead>
              <TableHead>{disclosureTable.columns.purpose}</TableHead>
              <TableHead>{disclosureTable.columns.recipient}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {disclosureTable.rows.map((row) => (
              <TableRow key={row.category}>
                <TableCell className="whitespace-normal">{row.category}</TableCell>
                <TableCell className="whitespace-normal">{row.purpose}</TableCell>
                <TableCell className="whitespace-normal">{row.recipient}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </div>
  )
}
