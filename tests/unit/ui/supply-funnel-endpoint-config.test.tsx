// @vitest-environment jsdom

import {
  openApiDocument,
  preparedPublication,
  sourceHash,
  sourceValue,
  x402SourceValue,
} from "./supply-funnel-harness";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AeSupplyEndpointConfigStep,
  type SupplyAuthorityOption,
  type SupplyEndpointDocumentPreflightResult,
  type SupplyPublicationImport,
} from "@/components/ae/supply/AeSupplyEndpointConfigStep";

describe("current supply funnel", () => {
  it("selects an available non-secret x402 provider connection", async () => {
    const authority: SupplyAuthorityOption = {
      connectionRef: "connection:x402",
      businessId: "business:one",
      providerRef: "provider:x402",
      providerAccountRef: "account:x402",
      adapterId: "x402-fetch:v2",
      grantedScopes: [],
      grantedResources: [],
      authorityGeneration: 1,
      authorityDigest: `sha256:${"b".repeat(64)}`,
      lifecycle: "active",
      available: true,
      credentialConfigured: false,
      observedAt: 1,
      reasonCode: null,
      evidenceRefs: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const preflight = vi.fn(async (source: SupplyPublicationImport) => {
      expect(source).toMatchObject({
        kind: "x402",
        commercial: {
          authority: {
            kind: "provider_connection",
            connectionRef: authority.connectionRef,
            providerRef: authority.providerRef,
          },
        },
      });
      return { kind: "prepared" as const, prepared: preparedPublication };
    });

    render(
      <AeSupplyEndpointConfigStep
        initialValue={x402SourceValue}
        authorityOptions={[authority]}
        onPreflight={preflight}
        onSubmit={async () => undefined}
      />,
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Access authority" }));
    fireEvent.click(
      screen.getByRole("option", { name: /provider:x402 · available/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Check and continue" }));

    await waitFor(() => expect(preflight).toHaveBeenCalledOnce());
  });

  it("offers OpenAPI selection and renders document inspection outcomes", async () => {
    const inspectDocument = vi.fn(
      async (): Promise<SupplyEndpointDocumentPreflightResult> => ({
        kind: "preflighted",
        sourceDigest: sourceHash,
        truncated: false,
        outcomes: [
          { selector: { path: "/quote", method: "post" }, kind: "executable" },
          {
            selector: { path: "/admin", method: "get" },
            kind: "unsafe",
            reason: "transport_unsupported",
          },
          {
            selector: { path: "/secret", method: "get" },
            kind: "credential_required",
            credential: {
              kind: "api_key",
              location: "header",
              name: "X-API-Key",
            },
          },
        ],
      }),
    );
    render(
      <AeSupplyEndpointConfigStep
        initialValue={x402SourceValue}
        onPreflight={async () => ({
          kind: "prepared",
          prepared: preparedPublication,
        })}
        onPreflightDocument={inspectDocument}
        onSubmit={async () => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("combobox", { name: "Connection type" }));
    fireEvent.click(screen.getByRole("option", { name: "OpenAPI HTTP API" }));
    const documentField = screen.getByLabelText("OpenAPI document (JSON)");
    expect(documentField).toBeDefined();
    fireEvent.change(documentField, {
      target: { value: JSON.stringify(openApiDocument) },
    });
    fireEvent.click(screen.getByRole("button", { name: "Inspect operations" }));

    await waitFor(() => expect(inspectDocument).toHaveBeenCalledOnce());
    expect(
      screen.getByRole("group", { name: "OpenAPI operation outcomes" }),
    ).toBeDefined();
    expect(screen.getByText("POST /quote")).toBeDefined();
    expect(screen.getByText("transport_unsupported")).toBeDefined();
    expect(
      screen.getByText(/Credential: api_key · X-API-Key · header/),
    ).toBeDefined();
    expect(
      screen.queryByRole("radio", { name: "Select GET /admin" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Select POST /quote" }));
    expect(screen.getByDisplayValue("POST /quote")).toBeDefined();
  });

  it("allows credential-required OpenAPI selection only for an available compatible connection", async () => {
    const credentialDocument = {
      ...openApiDocument,
      paths: {
        "/private": {
          get: {
            responses: {
              "200": {
                content: { "application/json": { schema: { type: "object" } } },
              },
            },
          },
        },
      },
    };
    const credentialPreflight: SupplyEndpointDocumentPreflightResult = {
      kind: "preflighted",
      sourceDigest: sourceHash,
      truncated: false,
      outcomes: [
        {
          selector: { path: "/private", method: "get" },
          kind: "credential_required",
          credential: {
            kind: "api_key",
            location: "header",
            name: "X-API-Key",
          },
        },
      ],
    };
    const preflight = vi.fn(async () => ({
      kind: "prepared" as const,
      prepared: preparedPublication,
    }));
    const keyedAuthority: SupplyAuthorityOption = {
      connectionRef: "connection:api",
      businessId: "business:one",
      providerRef: "provider:api",
      providerAccountRef: "account:api",
      adapterId: "http-json:v1",
      grantedScopes: [],
      grantedResources: [],
      authorityGeneration: 1,
      authorityDigest: `sha256:${"c".repeat(64)}`,
      lifecycle: "active",
      available: true,
      credentialConfigured: true,
      observedAt: 1,
      reasonCode: null,
      evidenceRefs: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const credentialSource = {
      ...sourceValue,
      documentJson: JSON.stringify(credentialDocument),
      operation: { path: "/private", method: "get" as const },
    };
    const view = render(
      <AeSupplyEndpointConfigStep
        initialValue={credentialSource}
        initialDocumentPreflight={credentialPreflight}
        onPreflightDocument={async () => credentialPreflight}
        onPreflight={preflight}
        onSubmit={async () => undefined}
      />,
    );

    expect(
      screen.queryByRole("radio", { name: "Select GET /private" }),
    ).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Check and continue" }));
    expect(
      screen.getAllByText(/executable or credential-authorized GET or POST/i)
        .length,
    ).toBeGreaterThan(0);
    expect(preflight).not.toHaveBeenCalled();

    view.rerender(
      <AeSupplyEndpointConfigStep
        initialValue={{
          ...credentialSource,
          authority: {
            kind: "provider_connection",
            connectionRef: keyedAuthority.connectionRef,
            providerRef: keyedAuthority.providerRef,
          },
        }}
        initialDocumentPreflight={credentialPreflight}
        onPreflightDocument={async () => credentialPreflight}
        authorityOptions={[keyedAuthority]}
        onPreflight={preflight}
        onSubmit={async () => undefined}
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("radio", { name: "Select GET /private" }),
      ).toBeDefined(),
    );
    fireEvent.click(screen.getByRole("radio", { name: "Select GET /private" }));
    fireEvent.click(screen.getByRole("button", { name: "Check and continue" }));
    await waitFor(() => expect(preflight).toHaveBeenCalledOnce());
  });
});
