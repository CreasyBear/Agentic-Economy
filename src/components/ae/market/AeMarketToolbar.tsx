"use client";

import { Link, useNavigate } from "@tanstack/react-router";
import { SearchIcon, XIcon } from "lucide-react";
import { useId } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { MarketWindow } from "@/modules/market/contracts";
import type { MarketCategoryId } from "@/modules/market/listing-evidence";

type Availability = "routeable" | "setup_required" | "unavailable";
type AvailabilityChoice = Availability | "all";

export type AeMarketToolbarSearch = Readonly<{
  window: MarketWindow;
  query?: string;
  availability?: Availability;
  category?: MarketCategoryId;
  cursor?: string;
  capability?: string;
}>;

const AVAILABILITY_LABELS: Readonly<Record<AvailabilityChoice, string>> = {
  all: "All",
  routeable: "Ready now",
  setup_required: "Setup required",
  unavailable: "Unavailable",
};

export function AeMarketToolbar({
  search,
}: {
  search: AeMarketToolbarSearch;
}) {
  const searchInputId = useId();
  const availabilityId = useId();
  const navigate = useNavigate();
  const activeFilterCount = [
    search.query,
    search.availability,
  ].filter((value) => value !== undefined).length;

  const handleAvailabilityChange = (value: AvailabilityChoice) => {
    void navigate({
      to: "/market",
      search: {
        window: search.window,
        ...(search.query === undefined ? {} : { query: search.query }),
        ...(value === "all" ? {} : { availability: value }),
        ...(search.category === undefined ? {} : { category: search.category }),
        ...(search.capability === undefined
          ? {}
          : { capability: search.capability }),
      },
    });
  };

  return (
    <section
      aria-label="Catalog controls"
      className="grid gap-intra border-y border-border py-intra"
    >
      <div className="flex flex-col gap-intra sm:flex-row sm:items-center">
        <form
          action="/market"
          method="get"
          role="search"
          className="min-w-0 flex-1"
        >
          <input type="hidden" name="window" value={search.window} />
          {search.availability !== undefined ? (
            <input
              type="hidden"
              name="availability"
              value={search.availability}
            />
          ) : null}
          <Field className="gap-0">
            <FieldLabel htmlFor={searchInputId} className="sr-only">
              Search Tools
            </FieldLabel>
            <InputGroup className="min-h-touch sm:min-h-9">
              <InputGroupInput
                key={search.query ?? ""}
                id={searchInputId}
                name="query"
                type="search"
                defaultValue={search.query ?? ""}
                placeholder="Search Tools"
              />
              <InputGroupAddon>
                <SearchIcon aria-hidden="true" />
              </InputGroupAddon>
              <InputGroupAddon align="inline-end">
                <InputGroupButton
                  type="submit"
                  size="sm"
                  className="min-h-touch sm:min-h-8"
                >
                  Search
                </InputGroupButton>
              </InputGroupAddon>
            </InputGroup>
          </Field>
        </form>

        <Field className="w-full gap-0 sm:w-auto">
          <FieldLabel htmlFor={availabilityId} className="sr-only">
            Availability
          </FieldLabel>
          <Select
            value={search.availability ?? "all"}
            onValueChange={handleAvailabilityChange}
          >
            <SelectTrigger
              id={availabilityId}
              aria-label="Availability filter"
              className="min-h-touch w-full sm:min-h-9 sm:w-48"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              <SelectGroup>
                <SelectLabel>Availability</SelectLabel>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="routeable">Ready now</SelectItem>
                <SelectItem value="setup_required">Setup required</SelectItem>
                <SelectItem value="unavailable">Unavailable</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </Field>
      </div>

      {activeFilterCount > 0 ? (
        <div
          aria-label={`Applied filters, ${activeFilterCount} active`}
          className="flex flex-wrap items-center gap-intra"
        >
          {search.query !== undefined ? (
            <FilterChip
              label={`Search: ${search.query}`}
              accessibleLabel={`Remove search filter “${search.query}”`}
              search={withoutFilter(search, "query")}
            />
          ) : null}
          {search.availability !== undefined ? (
            <FilterChip
              label={AVAILABILITY_LABELS[search.availability]}
              accessibleLabel={`Remove availability filter “${AVAILABILITY_LABELS[search.availability]}”`}
              search={withoutFilter(search, "availability")}
            />
          ) : null}
          <Button
            asChild
            variant="ghost"
            size="sm"
            className="min-h-touch sm:min-h-8"
          >
            <Link
              to="/market"
              search={{ window: search.window }}
              aria-label="Clear all filters"
            >
              Clear all
            </Link>
          </Button>
        </div>
      ) : null}
    </section>
  );
}

function FilterChip({
  label,
  accessibleLabel,
  search,
}: {
  label: string;
  accessibleLabel: string;
  search: AeMarketToolbarSearch;
}) {
  return (
    <Badge
      asChild
      variant="outline"
      className="min-h-touch px-3 sm:min-h-8"
    >
      <Link to="/market" search={search} aria-label={accessibleLabel}>
        <span aria-hidden="true">{label}</span>
        <XIcon data-icon="inline-end" aria-hidden="true" />
      </Link>
    </Badge>
  );
}

function withoutFilter(
  search: AeMarketToolbarSearch,
  filter: "query" | "availability",
): AeMarketToolbarSearch {
  return {
    window: search.window,
    ...(filter === "query" || search.query === undefined
      ? {}
      : { query: search.query }),
    ...(filter === "availability" || search.availability === undefined
      ? {}
      : { availability: search.availability }),
    ...(search.category === undefined ? {} : { category: search.category }),
    ...(search.capability === undefined
      ? {}
      : { capability: search.capability }),
  };
}
