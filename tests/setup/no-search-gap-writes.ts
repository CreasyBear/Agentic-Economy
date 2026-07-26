/**
 * Public search reads are instrumented: every registry/catalog/answer search
 * records a search-gap row. Under test that instrumentation would reach the
 * configured Convex deployment and fill the owner and operator surfaces with
 * fabricated eval-case traffic.
 *
 * Per-test overrides are not enough — an eval suite reaches the seam through
 * dozens of cases that never mention it. This installs a no-op recorder for
 * every test file, so writing to a real deployment from a test requires an
 * explicit, local `setSearchGapRecorderForTests` override.
 */
import { setSearchGapRecorderForTests } from '@/modules/demand/demand.functions'

setSearchGapRecorderForTests(async () => {})
