import { ArrowRightIcon, WrenchIcon } from 'lucide-react'
import { Link } from '@tanstack/react-router'

import { buttonVariants } from '@/components/ui/button-variants'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { cn } from '@/lib/utils'

import { TACTILE } from '../supplier-onboarding-wizard.contracts'

export function FirstToolStep() {
  return (
    <div className="grid gap-4">
      <Alert className="border-border bg-muted/40 py-2.5">
        <WrenchIcon className="size-4 text-primary" />
        <AlertTitle className="text-xs font-semibold">Step 2: Add Your First Tool</AlertTitle>
        <AlertDescription className="text-xs text-muted-foreground">
          Import an OpenAPI specification, MCP server definition, or x402 payment contract to publish your first callable tool.
        </AlertDescription>
      </Alert>

      <div className="rounded-lg border bg-muted/20 p-6 flex flex-col items-center justify-center text-center gap-3">
        <WrenchIcon className="size-8 text-primary/80" />
        <div>
          <h3 className="text-sm font-medium text-foreground">Ready to connect supply</h3>
          <p className="text-xs text-muted-foreground max-w-sm">
            Preview checks the source on the server before publication.
          </p>
        </div>
        <Link
          to="/owner/operations/new"
          className={cn(buttonVariants(), 'gap-2 min-h-touch mt-2', TACTILE)}
        >
          <span>Add Tool</span>
          <ArrowRightIcon className="size-4" />
        </Link>
      </div>
    </div>
  )
}
