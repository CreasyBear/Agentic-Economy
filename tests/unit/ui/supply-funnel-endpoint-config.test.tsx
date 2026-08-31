// @vitest-environment jsdom

import {
  openApiDocument,
  preparedPublication,
  sourceHash,
  sourceValue,
  x402SourceValue,
} from "./supply-funnel-harness";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import {
  Link,
  Outlet,
  RouterProvider,
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../setup/jsdom-platform";

import {
  AeSupplyEndpointConfigStep,
  AeSupplyEndpointConfigStepWithNavigationSafety,
  type SupplyAuthorityOption,
  type SupplyEndpointDraftSaveResult,
  type SupplyEndpointDocumentPreflightResult,
  type SupplyEndpointPreflightResult,
  type SupplyPublicationImport,
} from "@/components/ae/supply/AeSupplyEndpointConfigStep";

beforeEach(() => {
  window.history.replaceState(null, "", "/source");
});

afterEach(cleanup);

describe("current supply funnel", () => {
  it("ignores an obsolete OpenAPI inspection after the edited source changes", async () => {
    let resolveInspection: ((result: SupplyEndpointDocumentPreflightResult) => void) | undefined;
    const inspectDocument = vi.fn(() => new Promise<SupplyEndpointDocumentPreflightResult>((resolve) => {
      resolveInspection = resolve;
    }));
    const currentPreflight: SupplyEndpointDocumentPreflightResult = {
      kind: "preflighted",
      sourceDigest: sourceHash,
      truncated: false,
      outcomes: [{ selector: { path: "/quote", method: "post" }, kind: "executable" }],
    };
    const props = {
      onPreflightDocument: inspectDocument,
      onPreflight: async () => ({ kind: "prepared" as const, prepared: preparedPublication }),
      onSubmit: async () => undefined,
    };
    const view = render(
      <AeSupplyEndpointConfigStep initialValue={sourceValue} {...props} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Inspect operations" }));
    await waitFor(() => expect(inspectDocument).toHaveBeenCalledOnce());

    view.rerender(
      <AeSupplyEndpointConfigStep
        initialValue={{ ...sourceValue, sourceRevision: "source:two" }}
        initialDocumentPreflight={currentPreflight}
        {...props}
      />,
    );
    await waitFor(() => expect(screen.getByText("POST /quote")).toBeDefined());

    resolveInspection?.({ kind: "refused", reason: "obsolete document refusal" });

    await waitFor(() => {
      expect(screen.getByText("POST /quote")).toBeDefined();
      expect(screen.queryByText(/obsolete document refusal/i)).toBeNull();
    });
  });

  it("does not apply an obsolete submit result to a newly loaded source", async () => {
    let resolvePreflight: ((result: SupplyEndpointPreflightResult) => void) | undefined;
    const preflight = vi.fn(() => new Promise<SupplyEndpointPreflightResult>((resolve) => {
      resolvePreflight = resolve;
    }));
    const documentPreflight: SupplyEndpointDocumentPreflightResult = {
      kind: "preflighted",
      sourceDigest: sourceHash,
      truncated: false,
      outcomes: [{ selector: { path: "/quote", method: "post" }, kind: "executable" }],
    };
    const props = {
      initialDocumentPreflight: documentPreflight,
      onPreflight: preflight,
      onPreflightDocument: async () => documentPreflight,
      onSubmit: async () => undefined,
    };
    const view = render(
      <AeSupplyEndpointConfigStep initialValue={sourceValue} {...props} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Check and continue" }));
    await waitFor(() => expect(preflight).toHaveBeenCalledOnce());

    view.rerender(
      <AeSupplyEndpointConfigStep
        initialValue={{ ...sourceValue, sourceRevision: "source:replacement" }}
        {...props}
      />,
    );
    await waitFor(() => expect(screen.getByDisplayValue("source:replacement")).toBeDefined());

    resolvePreflight?.({ kind: "refused", reason: "obsolete submit refusal", fix: "obsolete fix" });

    await waitFor(() => {
      expect(screen.getByDisplayValue("source:replacement")).toBeDefined();
      expect(screen.queryByText(/obsolete submit refusal|obsolete fix/i)).toBeNull();
      expect(screen.getByRole("button", { name: "Check and continue" }).hasAttribute("disabled")).toBe(false);
    });
  });

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

  it("keeps entered source details and owns an unexpected preflight rejection", async () => {
    render(
      <AeSupplyEndpointConfigStep
        initialValue={sourceValue}
        onPreflight={async () => {
          throw new Error("private transport detail");
        }}
        onSubmit={async () => undefined}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Check and continue" }));

    await waitFor(() => expect(
      screen.getAllByRole("alert").some((alert) => alert.textContent?.includes("Your source details remain on this page")),
    ).toBe(true));
    expect(screen.getByDisplayValue(sourceValue.sourceRevision)).toBeTruthy();
    expect(document.body.textContent).not.toContain("private transport detail");
  });
});

describe("supply source navigation safety", () => {
  it("holds the requested destination until a confirmed draft save succeeds", async () => {
    let finishSave: ((result: SupplyEndpointDraftSaveResult) => void) | undefined;
    const saveDraft = vi.fn(() => new Promise<SupplyEndpointDraftSaveResult>((resolve) => {
      finishSave = resolve;
    }));
    const router = await renderSafetyEditor(saveDraft);

    fireEvent.change(screen.getByLabelText("Source revision"), {
      target: { value: "source:navigation-safe" },
    });
    expect(screen.getByText("Source changes are not yet saved.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Check and continue" }));
    fireEvent.click(screen.getByRole("link", { name: "Leave source setup" }));

    expect((await screen.findByRole("alertdialog")).textContent).toContain(
      "Stay on this page until the outcome is known.",
    );
    expect(router.state.location.pathname).toBe("/source");

    finishSave?.({ kind: "saved", revision: 2, sourceDigest: sourceHash });
    await waitFor(() => expect(router.state.location.pathname).toBe("/done"));
  });

  it("cancels navigation and retains source fields when draft saving is refused", async () => {
    let finishSave: ((result: SupplyEndpointDraftSaveResult) => void) | undefined;
    const saveDraft = vi.fn(() => new Promise<SupplyEndpointDraftSaveResult>((resolve) => {
      finishSave = resolve;
    }));
    const router = await renderSafetyEditor(saveDraft);

    fireEvent.change(screen.getByLabelText("Source revision"), {
      target: { value: "source:retained" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Check and continue" }));
    fireEvent.click(screen.getByRole("link", { name: "Leave source setup" }));
    await screen.findByRole("alertdialog");

    finishSave?.({ kind: "refused", reason: "Draft not stored", fix: "Try saving again." });

    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(router.state.location.pathname).toBe("/source");
    expect(screen.getByDisplayValue("source:retained")).toBeDefined();
    expect(screen.getByText("Try saving again.")).toBeDefined();
  });
});

async function renderSafetyEditor(
  onSaveDraft: (value: SupplyPublicationImport) => Promise<SupplyEndpointDraftSaveResult>,
) {
  const rootRoute = createRootRoute({ component: Outlet });
  const routeTree = rootRoute.addChildren([
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/source",
      component: () => (
        <>
          <AeSupplyEndpointConfigStepWithNavigationSafety
            initialValue={sourceValue}
            onSaveDraft={onSaveDraft}
            onPreflight={async () => ({ kind: "prepared", prepared: preparedPublication })}
            onSubmit={async () => undefined}
          />
          <Link to={'/done' as never}>Leave source setup</Link>
        </>
      ),
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/done",
      component: () => <h1>Done</h1>,
    }),
  ]);
  const router = createRouter({ routeTree, history: createBrowserHistory() });
  await router.load();
  render(<RouterProvider router={router} />);
  return router;
}
