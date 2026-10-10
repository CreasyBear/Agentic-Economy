/** UTM fields per docs/designs/attribution-spec.md rule 6 and 7: lowercase words joined by underscores. */
export type UtmInput = Readonly<{
  source: string
  medium: string
  campaign: string
  content?: string
}>

const UTM_TOKEN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/u

/** Tags an absolute URL with UTM fields. Throws on a relative URL or a field outside the naming rule. */
export function withUtm(url: string, utm: UtmInput): string {
  const target = new URL(url)
  const fields: Array<[string, string | undefined]> = [
    ['utm_source', utm.source],
    ['utm_medium', utm.medium],
    ['utm_campaign', utm.campaign],
    ['utm_content', utm.content],
  ]
  for (const [key, value] of fields) {
    if (value === undefined) continue
    if (!UTM_TOKEN.test(value)) throw new Error(`utm_invalid_token:${key}`)
    target.searchParams.set(key, value)
  }
  return target.toString()
}
