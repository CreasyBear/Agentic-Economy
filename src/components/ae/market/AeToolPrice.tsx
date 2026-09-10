import { useEffect, useState } from "react";
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
  validUntil,
}: {
  price: string;
  label?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
  validUntil?: number;
}) {
  const currentPrice = useCurrentToolPrice(price, validUntil);
  return (
    <p className={cn("grid min-w-0 content-start gap-0.5", className)}>
      <span className="text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
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
        {currentPrice}
      </span>
    </p>
  );
}

export function useCurrentToolPrice(price: string, validUntil?: number): string {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    if (validUntil === undefined) return;
    const delay = Math.max(0, validUntil - Date.now());
    const timer = setTimeout(() => setNow(Date.now()), Math.min(delay + 1, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [validUntil]);
  return validUntil !== undefined && validUntil <= now
    ? "AUD estimate temporarily unavailable" : price;
}

export function ToolPriceText({ price, validUntil }: { price: string; validUntil?: number }) {
  return <>{useCurrentToolPrice(price, validUntil)}</>;
}
