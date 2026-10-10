import { withUtm } from '@/lib/attribution/with-utm'

/** Every app link in an email. Tags follow docs/designs/attribution-spec.md rule 6 (source aecon, medium email). */
export function emailUrl(siteUrl: string, path: string, tag: { campaign: string; content?: string }): string {
  return withUtm(new URL(path, siteUrl).toString(), { source: 'aecon', medium: 'email', ...tag })
}
