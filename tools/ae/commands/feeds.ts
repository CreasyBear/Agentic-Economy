import type { CliOptions } from '../lib/args'
import { heading, line, printJson, table } from '../lib/output'
import { listFeeds } from '../lib/feeds'

/** `ae feeds [--json]` — enumerate the keyless data feeds the agentic economy can serve. */
export async function runFeedsCommand(_args: readonly string[], options: CliOptions): Promise<void> {
  const feeds = await listFeeds()
  if (options.json) {
    printJson(feeds)
    return
  }
  const executable = feeds.filter((feed) => feed.executable)
  heading(`Agentic-economy feeds (${feeds.length}; ${executable.length} keyless-executable)`)
  for (const feed of feeds) {
    line('')
    table([
      ['id', feed.id],
      ['capability', feed.capabilityId],
      ['name', feed.name],
      ['kind', feed.kind],
      ['host', feed.endpointHost],
      ['executable', feed.executable ? 'yes' : 'no'],
      ['provenance', feed.provenance],
    ])
  }
  line('')
  line(`Run one live operation: ae run ${executable[0]?.id ?? '<operation-ref>'} key=value ...`)
}
