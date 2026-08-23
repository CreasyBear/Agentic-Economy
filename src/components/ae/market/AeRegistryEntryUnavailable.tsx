import { Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export function AeRegistryEntryUnavailable({
  kind,
}: {
  kind: "not_found" | "unavailable";
}) {
  return (
    <section className="mx-auto grid min-h-[60vh] w-full max-w-3xl place-items-center px-4 py-12">
      <Card className="w-full">
        <CardHeader>
          <CardTitle role="heading" aria-level={1}>
            {kind === "not_found"
              ? "Registry entry not found"
              : "Registry temporarily unavailable"}
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 text-sm text-muted-foreground">
          <p>
            {kind === "not_found"
              ? "This entry is not in the current complete registry snapshot."
              : "The registry could not be read. Try again shortly."}
          </p>
          <Button asChild variant="outline" className="w-fit">
            <Link to="/market" search={{ window: "30d" }}>Return to registry</Link>
          </Button>
        </CardContent>
      </Card>
    </section>
  );
}
