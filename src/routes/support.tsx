import { createFileRoute, Link } from '@tanstack/react-router'
import { ArrowUpRightIcon } from 'lucide-react'

import { AeCopyCommand } from '@/components/ae/data/AeCopyCommand'
import { AePublicPage } from '@/components/ae/layout/AePublicPage'
import { AeSection } from '@/components/ae/layout/AeSection'
import { Button } from '@/components/ui/button'
import { buildPublicPageHead } from '@/modules/seo/public'

const ISSUE_URL = 'https://github.com/CreasyBear/Agentic-Economy/issues/new/choose'

export const Route = createFileRoute('/support')({
  head: () => buildPublicPageHead({
    path: '/support',
    title: 'Get help | Agentic Economy',
    description: 'Diagnose an Agentic Economy connection, continue supplier setup, or report a problem with a request reference.',
  }),
  component: SupportRoute,
})

function SupportRoute() {
  return (
    <AePublicPage
      kind="document"
      eyebrow="Support"
      title="Get unstuck."
      description="Start with the path that failed. Keep any request reference shown in the error—it lets us trace the exact attempt without sharing credentials or private inputs."
      actions={
        <Button asChild className="min-h-touch">
          <a href={ISSUE_URL} target="_blank" rel="noreferrer">
            Report a problem <ArrowUpRightIcon aria-hidden="true" />
          </a>
        </Button>
      }
    >
      <div className="ae-rail grid gap-section pb-page">
        <AeSection
          id="message-troubleshooting"
          title="Match the message you saw"
          description="Find the exact message, then take the one immediate action shown. Never copy or share secrets, inputs, or private references."
        >
          <ul className="grid gap-related md:grid-cols-2">
            <li className="grid min-w-0 content-start gap-related rounded-md border border-border p-gutter">
              <div className="grid gap-intra">
                <h3 className="font-medium text-foreground">No matching credential is selected</h3>
                <p className="text-sm text-muted-foreground">Connect the installed CLI to this origin.</p>
              </div>
              <AeCopyCommand compact label="connect command" code={'ae connect --base-url "$ORIGIN"'} />
            </li>

            <li className="grid min-w-0 content-start gap-related rounded-md border border-border p-gutter">
              <div className="grid gap-intra">
                <h3 className="font-medium text-foreground">Buyer balance is empty / Call declined for insufficient credit</h3>
                <p className="text-sm text-muted-foreground">Add credit to the buyer account.</p>
              </div>
              <Button asChild variant="outline" className="min-h-touch">
                <Link to="/owner/credit" hash="fund">Add credit</Link>
              </Button>
            </li>

            <li className="grid min-w-0 content-start gap-related rounded-md border border-border p-gutter">
              <div className="grid gap-intra">
                <h3 className="font-medium text-foreground">Operation is not currently callable</h3>
                <p className="text-sm text-muted-foreground">
                  Choose another current Operation. Retrying will not restore supplier readiness.
                </p>
              </div>
              <Button asChild variant="outline" className="min-h-touch">
                <Link to="/market" search={{ window: '30d' }} hash="operations">
                  Choose another Operation
                </Link>
              </Button>
            </li>

            <li className="grid min-w-0 content-start gap-related rounded-md border border-border p-gutter">
              <div className="grid gap-intra">
                <h3 className="font-medium text-foreground">Payment being verified / Reconciliation required</h3>
                <p className="text-sm text-muted-foreground">
                  Inspect the exact receipt in Activity. Do not retry the call.
                </p>
              </div>
              <Button asChild variant="outline" className="min-h-touch">
                <Link to="/activity">Open Activity</Link>
              </Button>
            </li>
          </ul>
        </AeSection>

        <div className="grid gap-section lg:grid-cols-3">
          <AeSection
            title="Agent connection"
            description="Check the configured origin, server readiness, account, balance, and recovery state in one read-only command."
          >
            <AeCopyCommand
              comfortable
              label="diagnostic command"
              code={'ae doctor --base-url "$ORIGIN"'}
            />
            <Button asChild variant="outline" className="mt-related min-h-touch">
              <Link to="/for-agents">Review agent setup</Link>
            </Button>
          </AeSection>

          <AeSection
            title="Supplier setup"
            description="Resume the existing Operation. Its status page shows the next unfinished setup or readiness action."
          >
            <Button asChild className="min-h-touch">
              <Link to="/owner/supply">Continue supplier setup</Link>
            </Button>
            <Button asChild variant="outline" className="mt-related min-h-touch">
              <Link to="/for-providers">Review supplier requirements</Link>
            </Button>
          </AeSection>

          <AeSection
            title="Report a problem"
            description="Include the page or command, what you expected, what happened, and the safe request reference from the error. Never include keys, wallet material, raw inputs, or private results."
          >
            <Button asChild className="min-h-touch">
              <a href={ISSUE_URL} target="_blank" rel="noreferrer">
                Open issue form <ArrowUpRightIcon aria-hidden="true" />
              </a>
            </Button>
            <p className="mt-related text-sm text-muted-foreground">
              Listing correction or removal has a separate privacy-safe path.
            </p>
            <Link
              to="/privacy/remove-business"
              className="mt-intra inline-flex min-h-touch items-center font-medium underline underline-offset-4"
            >
              Request a listing correction
            </Link>
          </AeSection>
        </div>
      </div>
    </AePublicPage>
  )
}
