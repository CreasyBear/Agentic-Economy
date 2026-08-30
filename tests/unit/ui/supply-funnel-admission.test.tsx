// @vitest-environment jsdom

import {
  offeringAt,
  preparedPublication,
  sourceValue,
} from "./supply-funnel-harness";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import {
  AeSupplyFunnel,
  type SupplyFunnelCallbacks,
} from "@/components/ae/supply/AeSupplyFunnel";
import type { SupplyAuthorityOption } from "@/components/ae/supply/AeSupplyEndpointConfigStep";
import { emptyOwnerOfferingEditorValue } from "@/components/ae/offerings/AeOwnerOfferings.exports";
import type { SupplyFunnelStep } from "@/modules/capability-supply/supply-funnel.functions";

describe("current supply funnel", () => {
  it("moves through save, admission, readiness, and test effects", async () => {
    const savedValue = {
      ...emptyOwnerOfferingEditorValue,
      expectedRevision: 1,
      name: "Weather data",
      category: "Data",
      summary: "Returns a current weather report.",
    };
    const saveOfferingImplementation: SupplyFunnelCallbacks["saveOffering"] =
      async () => ({ kind: "saved", value: savedValue, message: "Saved." });
    const saveOffering = vi.fn(saveOfferingImplementation);
    const preflightImplementation: SupplyFunnelCallbacks["preflight"] = async (
      source,
    ) => {
      expect(source.sourceRevision).toBe("source:one");
      return { kind: "prepared", prepared: preparedPublication };
    };
    const preflight = vi.fn(preflightImplementation);
    const admitImplementation: SupplyFunnelCallbacks["admit"] = async () => {
      return {
        step: "admission",
        state: "completed",
        offeringRef: "offering:one",
        revision: 1,
        publicationRef: "publication:one",
        operationRef: "operation:one",
        message: "Admitted.",
      };
    };
    const admit = vi.fn(admitImplementation);
    const runReadinessImplementation: SupplyFunnelCallbacks["runReadiness"] =
      async () => ({ step: "readiness", state: "completed" });
    const runReadiness = vi.fn(runReadinessImplementation);
    const runTestImplementation: SupplyFunnelCallbacks["runTest"] =
      async () => ({ step: "test", state: "completed" });
    const runTest = vi.fn(runTestImplementation);
    let nextStep: SupplyFunnelStep = "admission";
    let updateOffering: (step: SupplyFunnelStep) => void = () => undefined;
    const callbacks: SupplyFunnelCallbacks = {
      saveOffering,
      preflight,
      admit,
      runReadiness,
      runTest,
      onReload: async () => updateOffering(nextStep),
    };
    const view = render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={offeringAt("describe")}
        initialOffering={emptyOwnerOfferingEditorValue}
        initialSource={sourceValue}
        callbacks={callbacks}
      />,
    );
    updateOffering = (step) =>
      view.rerender(
        <AeSupplyFunnel
          businessId="business:one"
          offering={offeringAt(step)}
          initialOffering={emptyOwnerOfferingEditorValue}
          initialSource={sourceValue}
          callbacks={callbacks}
        />,
      );

    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Weather data" },
    });
    fireEvent.change(screen.getByLabelText("Category"), {
      target: { value: "Data" },
    });
    fireEvent.change(screen.getByLabelText("Summary"), {
      target: { value: "Returns a current weather report." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "Connect the Operation",
        }),
      ).toBeDefined(),
    );
    expect(document.getElementById("provider")).not.toBeNull();
    expect(saveOffering).toHaveBeenCalledOnce();

    nextStep = "readiness";
    fireEvent.click(screen.getByRole("button", { name: "Check and continue" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", {
          name: "Check that the admitted operation works",
        }),
      ).toBeDefined(),
    );
    expect(document.getElementById("readiness")).not.toBeNull();
    expect(preflight).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "openapi_http",
        sourceRevision: "source:one",
      }),
    );
    expect(admit).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "openapi_http",
        sourceRevision: "source:one",
      }),
    );
    expect(admit.mock.calls[0]).toHaveLength(1);

    nextStep = "test";
    fireEvent.click(screen.getByRole("button", { name: "Check readiness" }));
    await waitFor(() =>
      expect(
        screen.getByRole("heading", { name: "Run a real test" }),
      ).toBeDefined(),
    );
    expect(runReadiness).toHaveBeenCalledWith(
      expect.objectContaining({
        offeringRef: "offering:one",
        publicationRef: "publication:one",
      }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Review and confirm the test" }),
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Send the test" }),
      ).toBeDefined(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Send the test" }));
    await waitFor(() =>
      expect(runTest).toHaveBeenCalledWith(
        expect.objectContaining({
          offeringRef: "offering:one",
          publicationRef: "publication:one",
        }),
      ),
    );
  });

  it("rejects malformed source material before admission", async () => {
    const preflightImplementation: SupplyFunnelCallbacks["preflight"] =
      async () => ({ kind: "prepared", prepared: preparedPublication });
    const preflight = vi.fn(preflightImplementation);
    const admitImplementation: SupplyFunnelCallbacks["admit"] = async () => ({
      step: "admission",
      state: "completed",
    });
    const admit = vi.fn(admitImplementation);
    const callbacks: SupplyFunnelCallbacks = {
      saveOffering: async (value) => ({
        kind: "saved",
        value,
        message: "Saved.",
      }),
      preflight,
      admit,
      runReadiness: async () => ({ step: "readiness", state: "completed" }),
      runTest: async () => ({ step: "test", state: "completed" }),
    };
    render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={offeringAt("admission")}
        initialOffering={emptyOwnerOfferingEditorValue}
        initialSource={{ ...sourceValue, contract: {} }}
        callbacks={callbacks}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Check and continue" }));
    expect(screen.getByRole("alert").textContent).toMatch(
      /contract must declare at least one output evidence pointer/i,
    );
    expect(preflight).not.toHaveBeenCalled();
    expect(admit).not.toHaveBeenCalled();
  });

  it("blocks an expired provider connection before source preflight", async () => {
    const preflight = vi.fn(async () => ({
      kind: "prepared" as const,
      prepared: preparedPublication,
    }));
    const admit = vi.fn(async () => ({
      step: "admission" as const,
      state: "completed" as const,
    }));
    const authority: SupplyAuthorityOption = {
      connectionRef: "connection:expired",
      businessId: "business:one",
      providerRef: "provider:weather",
      providerAccountRef: "account:weather",
      adapterId: "http-json:v1",
      grantedScopes: [],
      grantedResources: [],
      authorityGeneration: 1,
      authorityDigest: `sha256:${"a".repeat(64)}`,
      lifecycle: "active",
      available: false,
      credentialConfigured: true,
      observedAt: 1,
      expiresAt: 2,
      reasonCode: "credential_expired",
      evidenceRefs: [],
      createdAt: 1,
      updatedAt: 1,
    };
    render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={offeringAt("admission")}
        initialOffering={emptyOwnerOfferingEditorValue}
        initialSource={{
          ...sourceValue,
          authority: {
            kind: "provider_connection",
            connectionRef: authority.connectionRef,
            providerRef: authority.providerRef,
          },
        }}
        authorityOptions={[authority]}
        callbacks={{
          saveOffering: async (value) => ({
            kind: "saved",
            value,
            message: "Saved.",
          }),
          preflight,
          admit,
          runReadiness: async () => ({ step: "readiness", state: "completed" }),
          runTest: async () => ({ step: "test", state: "completed" }),
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Check and continue" }));
    expect(
      (await screen.findAllByText(/supplier connection is unavailable/i))
        .length,
    ).toBeGreaterThan(0);
    expect(preflight).not.toHaveBeenCalled();
    expect(admit).not.toHaveBeenCalled();
  });

  it("lands an incompatible Operation on a focused revision-guarded readmission action", async () => {
    const current = offeringAt("readiness");
    if (current.publication === undefined)
      throw new Error("incompatible_publication_missing");
    window.history.replaceState(null, "", "/#incompatibility");

    render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={{
          ...current,
          publication: {
            ...current.publication,
            state: "incompatible",
            lifecycle: {
              state: "incompatible",
              reasons: ["incompatible_revision"],
            },
          },
          lifecycle: {
            state: "incompatible",
            reasons: ["incompatible_revision"],
          },
          actionableReason: "incompatible_revision",
          live: { available: false, reason: "incompatible_revision" },
        }}
        initialOffering={emptyOwnerOfferingEditorValue}
        callbacks={{
          saveOffering: async (value) => ({ kind: "saved", value, message: "Saved." }),
          preflight: async () => ({ kind: "prepared", prepared: preparedPublication }),
          admit: async () => ({ step: "admission", state: "completed" }),
          runReadiness: async () => ({ step: "readiness", state: "completed" }),
          runTest: async () => ({ step: "test", state: "completed" }),
        }}
      />,
    );

    const repair = screen.getByRole("button", { name: "Check and continue" });
    expect(repair.hasAttribute("disabled")).toBe(false);
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("id")).toBe("incompatibility"),
    );
    expect(screen.queryByRole("button", { name: "Check readiness" })).toBeNull();
    window.history.replaceState(null, "", "/");
  });

  it("ignores a continuation hash when that recovery target is not present", () => {
    window.history.replaceState(null, "", "/#credential-recovery");

    render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={offeringAt("describe")}
        initialOffering={emptyOwnerOfferingEditorValue}
        callbacks={{
          saveOffering: async (value) => ({ kind: "saved", value, message: "Saved." }),
          preflight: async () => ({ kind: "prepared", prepared: preparedPublication }),
          admit: async () => ({ step: "admission", state: "completed" }),
          runReadiness: async () => ({ step: "readiness", state: "completed" }),
          runTest: async () => ({ step: "test", state: "completed" }),
        }}
      />,
    );

    expect(document.getElementById("credential-recovery")).toBeNull();
    expect(screen.getByRole("textbox", { name: "Name" })).toBeDefined();
    window.history.replaceState(null, "", "/");
  });

  it("re-admits a credential-rejected Operation with a different compatible connection", async () => {
    const current = offeringAt("readiness");
    if (current.publication === undefined)
      throw new Error("credential_recovery_publication_missing");
    window.history.replaceState(null, "", "/#credential-recovery");
    const rejected: SupplyAuthorityOption = {
      connectionRef: "connection:rejected",
      businessId: "business:one",
      providerRef: "provider:rejected",
      providerAccountRef: "account:rejected",
      adapterId: "http-json:v1",
      grantedScopes: [],
      grantedResources: [],
      authorityGeneration: 1,
      authorityDigest: `sha256:${"b".repeat(64)}`,
      lifecycle: "active",
      available: false,
      credentialConfigured: true,
      observedAt: 1,
      reasonCode: "credential_rejected",
      evidenceRefs: [],
      createdAt: 1,
      updatedAt: 1,
    };
    const replacement: SupplyAuthorityOption = {
      ...rejected,
      connectionRef: "connection:replacement",
      providerRef: "provider:replacement",
      providerAccountRef: "account:replacement",
      authorityGeneration: 4,
      authorityDigest: `sha256:${"c".repeat(64)}`,
      available: true,
      reasonCode: null,
    };
    const preflight = vi.fn(async () => ({
      kind: "prepared" as const,
      prepared: preparedPublication,
    }));
    const admit = vi.fn(async () => ({
      step: "admission" as const,
      state: "completed" as const,
    }));

    render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={{
          ...current,
          actionableReason: "credential_rejected",
          authority: {
            mode: "provider_owned",
            kind: "provider_connection",
            providerRef: rejected.providerRef,
            authorityGeneration: rejected.authorityGeneration,
            authorityDigest: rejected.authorityDigest,
          },
          publication: {
            ...current.publication,
            readiness: {
              outcome: "credential_rejected",
              evidenceRefs: ["probe:credential_rejected"],
            },
          },
          readiness: {
            outcome: "credential_rejected",
            evidenceRefs: ["probe:credential_rejected"],
          },
          live: { available: false, reason: "credential_rejected" },
        }}
        initialOffering={emptyOwnerOfferingEditorValue}
        initialSource={{
          ...sourceValue,
          authority: {
            kind: "provider_connection",
            connectionRef: rejected.connectionRef,
            providerRef: rejected.providerRef,
          },
        }}
        authorityOptions={[rejected, replacement]}
        callbacks={{
          saveOffering: async (value) => ({ kind: "saved", value, message: "Saved." }),
          preflight,
          admit,
          runReadiness: async () => ({ step: "readiness", state: "completed" }),
          runTest: async () => ({ step: "test", state: "completed" }),
        }}
      />,
    );

    expect(screen.getByText(/refreshing a rejected or unavailable connection reuses the same credential state/i)).toBeDefined();
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("id")).toBe("credential-recovery"),
    );
    fireEvent.click(screen.getByRole("combobox", { name: "Access authority" }));
    fireEvent.click(
      screen.getByRole("option", { name: /provider:replacement · available/i }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Check and continue" }));

    await waitFor(() => expect(admit).toHaveBeenCalledOnce());
    expect(preflight).toHaveBeenCalledWith(expect.objectContaining({
      commercial: expect.objectContaining({
        authority: {
          kind: "provider_connection",
          connectionRef: "connection:replacement",
          providerRef: "provider:replacement",
        },
      }),
    }));
    window.history.replaceState(null, "", "/");
  });

  it("rebinds an authority-stale Operation to the refreshed connection", async () => {
    const current = offeringAt("readiness");
    if (current.publication === undefined)
      throw new Error("authority_recovery_publication_missing");
    window.history.replaceState(null, "", "/#provider");
    const refreshed: SupplyAuthorityOption = {
      connectionRef: "connection:weather",
      businessId: "business:one",
      providerRef: "provider:weather",
      providerAccountRef: "account:weather",
      adapterId: "http-json:v1",
      grantedScopes: [],
      grantedResources: [],
      authorityGeneration: 2,
      authorityDigest: `sha256:${"d".repeat(64)}`,
      lifecycle: "active",
      available: true,
      credentialConfigured: true,
      observedAt: 2,
      reasonCode: null,
      evidenceRefs: [],
      createdAt: 1,
      updatedAt: 2,
    };
    const preflight = vi.fn(async () => ({
      kind: "prepared" as const,
      prepared: preparedPublication,
    }));
    const admit = vi.fn(async () => ({
      step: "admission" as const,
      state: "completed" as const,
    }));

    render(
      <AeSupplyFunnel
        businessId="business:one"
        offering={{
          ...current,
          actionableReason: "authority_stale",
          authority: {
            mode: "provider_owned",
            kind: "provider_connection",
            providerRef: refreshed.providerRef,
            authorityGeneration: 1,
            authorityDigest: `sha256:${"a".repeat(64)}`,
          },
          live: { available: false, reason: "authority_stale" },
        }}
        initialOffering={emptyOwnerOfferingEditorValue}
        initialSource={{
          ...sourceValue,
          authority: {
            kind: "provider_connection",
            connectionRef: refreshed.connectionRef,
            providerRef: refreshed.providerRef,
          },
        }}
        authorityOptions={[refreshed]}
        callbacks={{
          saveOffering: async (value) => ({ kind: "saved", value, message: "Saved." }),
          preflight,
          admit,
          runReadiness: async () => ({ step: "readiness", state: "completed" }),
          runTest: async () => ({ step: "test", state: "completed" }),
        }}
      />,
    );

    expect(screen.getByText(/still holds the previous provider authority snapshot/i)).toBeDefined();
    await waitFor(() =>
      expect(document.activeElement?.getAttribute("id")).toBe("provider"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Check and continue" }));

    await waitFor(() => expect(admit).toHaveBeenCalledOnce());
    expect(preflight).toHaveBeenCalledWith(expect.objectContaining({
      commercial: expect.objectContaining({
        authority: {
          kind: "provider_connection",
          connectionRef: "connection:weather",
          providerRef: "provider:weather",
        },
      }),
    }));
    window.history.replaceState(null, "", "/");
  });
});
