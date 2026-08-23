import { AePublicShell } from "@/components/ae/layout/AePublicShell";
import { Skeleton } from "@/components/ui/skeleton";

export function AePublicRoutePending({ label }: { label: string }) {
  return (
    <AePublicShell>
      <section
        className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 md:px-6"
        aria-busy="true"
      >
        <p role="status" className="text-sm text-muted-foreground">
          {label}
        </p>
        <Skeleton className="h-12 w-full max-w-3xl" />
        <div className="grid gap-3" aria-hidden="true">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      </section>
    </AePublicShell>
  );
}
