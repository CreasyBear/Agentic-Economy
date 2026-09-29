import { cn } from "@/lib/utils";

/**
 * The price figure that leads every buy decision. Same component on the
 * market row and the operation-detail first viewport so the price always
 * reads identically: mono, tabular, no digit jitter.
 */
export function AeToolPrice({
  price,
  label = "Total price",
  size = "md",
  className,
}: {
  price: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  validUntil?: number;
}) {
  return (
    <p className={cn("grid min-w-0 content-start gap-0.5", className)}>
      <span className="text-caption font-medium uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "font-mono font-semibold tabular-nums text-foreground",
          size === "sm" && "text-sm",
          size === "md" && "text-lg",
          size === "lg" && "text-2xl",
        )}
      >
        {price}
      </span>
    </p>
  );
}

export function ToolPriceText({ price }: { price: string; validUntil?: number }) {
  return <>{price}</>;
}

