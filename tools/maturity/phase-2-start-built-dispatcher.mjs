#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const VC_CONFIG_PATH = ".vercel/output/functions/__server.func/.vc-config.json";
const SERVER_FUNCTION_ROOT = ".vercel/output/functions/__server.func";
const SERVER_FN_HEADER = "x-tsr-serverFn";
const CLERK_CONFIGURATION_ERROR = "Clerk: no secret key provided";
const EXPECTED_REQUEST_MIDDLEWARE_ORDER = [
  "requestCorrelationMiddleware",
  "apiRequestBoundaryMiddleware",
  "observabilityRequestMiddleware",
  "securityHeadersRequestMiddleware",
  "agentContentNegotiationMiddleware",
  "csrfMiddleware",
  "sourceWriteAdmissionMiddleware",
  "...clerkRequestMiddleware",
];
const CALLER_SHAPED_HEADERS = {
  Authorization: "Bearer caller-supplied-invalid-token",
  "x-ae-principal-id": "caller-supplied-principal",
  "x-ae-account-id": "caller-supplied-account",
  "x-ae-authority-context": "caller-supplied-authority",
};

function parseArgs(argv) {
  const options = {
    artifactRoot: undefined,
    serverFn: "readCanonicalBaseUrlServer",
    expectation: "inspect",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--artifact-root") {
      options.artifactRoot = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--server-fn") {
      options.serverFn = argv[index + 1];
      index += 1;
      continue;
    }
    if (argument === "--expect-source-fixed" || argument === "--expect-fixed") {
      options.expectation = "source-fixed";
      continue;
    }
    if (argument === "--expect-regression") {
      options.expectation = "regression";
      continue;
    }
    throw new Error(`unknown_argument:${argument}`);
  }

  if (options.artifactRoot === undefined) {
    throw new Error("artifact_root_required");
  }
  if (options.serverFn === undefined || options.serverFn.length === 0) {
    throw new Error("server_fn_required");
  }
  return options;
}

async function filesBelow(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await filesBelow(path)));
    } else if (entry.isFile()) {
      files.push(path);
    }
  }
  return files.sort();
}

function readCandidate(root) {
  return execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

async function inspectBundle(root, serverFn) {
  const functionRoot = resolve(root, SERVER_FUNCTION_ROOT);
  const files = (await filesBelow(functionRoot)).filter((file) =>
    file.endsWith(".mjs"),
  );
  const sources = await Promise.all(
    files.map(async (file) => ({ file, source: await readFile(file, "utf8") })),
  );

  const serverFnPattern = new RegExp(
    `${escapeRegExp(serverFn)}[\\s\\S]{0,600}?createSsrRpc\\("([a-f0-9]{64})"\\)`,
    "u",
  );
  const serverFnMatch = sources
    .map(({ file, source }) => ({ file, match: source.match(serverFnPattern) }))
    .find(({ match }) => match !== null);
  if (serverFnMatch?.match?.[1] === undefined) {
    throw new Error(`compiled_server_fn_id_not_found:${serverFn}`);
  }

  const callPattern = /\bsetErrorThrowerOptions\s*\(/u;
  const importPattern =
    /^\s*import\s+[^;\n]*\bsetErrorThrowerOptions\b[^;\n]*\s+from\s+["'][^"']+["']/mu;
  const definitionPattern = /\bfunction\s+setErrorThrowerOptions\s*\(/u;
  const callChunks = sources
    .filter(({ source }) => callPattern.test(source))
    .map(({ file, source }) => ({
      file: file.slice(resolve(root).length + 1),
      importsSymbol: importPattern.test(source),
      definesSymbol: definitionPattern.test(source),
    }));
  const definitionChunks = sources
    .filter(({ source }) => definitionPattern.test(source))
    .map(({ file }) => file.slice(resolve(root).length + 1));

  const compositionMatch = sources
    .map(({ file, source }) => ({
      file,
      source,
      match: source.match(
        /var clerkRequestMiddleware = isLocalE2EAuthBypassEnabled\(\) \? \[\] : \[clerkMiddleware\(\)\];[\s\S]{0,2000}?requestMiddleware: \[([\s\S]*?)\]\s*\}\)\);/u,
      ),
    }))
    .find(({ match }) => match !== null);
  const requestMiddlewareOrder =
    compositionMatch?.match?.[1]
      ?.split(",")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0) ?? [];
  const productionBypassFailsLoud = sources.some(
    ({ source }) =>
      source.includes(
        'if (process.env.VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E !== "true") return false;',
      ) &&
      source.includes(
        'throw new Error("VITE_AE_DISABLE_CLERK_FOR_LOCAL_E2E cannot be enabled in production.")',
      ),
  );
  const clerkLibraryPresent = sources.some(
    ({ source }) =>
      source.includes("var clerkMiddleware = (options) =>") &&
      source.includes(CLERK_CONFIGURATION_ERROR),
  );

  return {
    compiledServerFnId: serverFnMatch.match[1],
    compiledServerFnChunk: serverFnMatch.file.slice(resolve(root).length + 1),
    callChunks,
    definitionChunks,
    unboundCallChunks: callChunks.filter(
      ({ importsSymbol, definesSymbol }) => !importsSymbol && !definesSymbol,
    ),
    middleware: {
      compositionChunk:
        compositionMatch?.file.slice(resolve(root).length + 1) ?? null,
      requestMiddlewareOrder,
      expectedRequestMiddlewareOrder: EXPECTED_REQUEST_MIDDLEWARE_ORDER,
      productionClerkRegistrationPresent: compositionMatch !== undefined,
      productionBypassFailsLoud,
      clerkLibraryPresent,
    },
  };
}

function stringifyDiagnostic(value) {
  if (value instanceof Error) {
    return value.stack ?? `${value.name}: ${value.message}`;
  }
  return typeof value === "string" ? value : JSON.stringify(value);
}

async function driveBuiltDispatcher({ root, handlerPath, serverFnId }) {
  const diagnostics = [];
  const originalConsoleError = console.error;
  console.error = (...values) => {
    diagnostics.push(values.map(stringifyDiagnostic).join(" "));
  };

  let server;
  try {
    const module = await import(pathToFileURL(handlerPath).href);
    if (typeof module.default !== "function") {
      throw new Error("compiled_handler_default_export_missing");
    }
    server = createServer(module.default);
    await new Promise((resolveListen, rejectListen) => {
      server.once("error", rejectListen);
      server.listen(0, "127.0.0.1", resolveListen);
    });
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("compiled_handler_address_unavailable");
    }
    const origin = `http://127.0.0.1:${address.port}`;
    const driveRequest = async (extraHeaders = {}) => {
      const diagnosticOffset = diagnostics.length;
      const request = {
        method: "GET",
        url: `${origin}/_serverFn/${serverFnId}`,
        headers: {
          [SERVER_FN_HEADER]: "true",
          Origin: origin,
          Accept: "application/json",
          ...extraHeaders,
        },
      };
      const response = await fetch(request.url, {
        method: request.method,
        headers: request.headers,
      });
      return {
        request: {
          ...request,
          url: `/_serverFn/${serverFnId}`,
        },
        response: {
          status: response.status,
          headers: Object.fromEntries(response.headers.entries()),
          body: await response.text(),
        },
        diagnostics: diagnostics.slice(diagnosticOffset),
      };
    };

    const missingConfiguration = await driveRequest();
    const callerShapedInvalidToken = await driveRequest(CALLER_SHAPED_HEADERS);
    return {
      missingConfiguration,
      callerShapedInvalidToken,
      artifactRoot: root,
    };
  } finally {
    console.error = originalConsoleError;
    if (server !== undefined) {
      await new Promise((resolveClose, rejectClose) =>
        server.close((error) =>
          error === undefined ? resolveClose() : rejectClose(error),
        ),
      );
    }
  }
}

export async function inspectAndDriveBuiltStartDispatcher(options) {
  const root = resolve(options.artifactRoot);
  const vcConfigPath = resolve(root, VC_CONFIG_PATH);
  const vcConfig = JSON.parse(await readFile(vcConfigPath, "utf8"));
  if (typeof vcConfig.handler !== "string" || vcConfig.handler.length === 0) {
    throw new Error("vc_config_handler_missing");
  }
  const functionRoot = resolve(root, SERVER_FUNCTION_ROOT);
  const handlerPath = resolve(functionRoot, vcConfig.handler);
  const bundle = await inspectBundle(root, options.serverFn);
  const runtime = await driveBuiltDispatcher({
    root,
    handlerPath,
    serverFnId: bundle.compiledServerFnId,
  });
  return {
    format: "phase-2-start-built-dispatcher-evidence:v2",
    candidate: readCandidate(root),
    vcConfig: {
      path: VC_CONFIG_PATH,
      handler: vcConfig.handler,
      handlerBasename: basename(handlerPath),
      launcherType: vcConfig.launcherType,
      runtime: vcConfig.runtime,
    },
    serverFn: {
      exportName: options.serverFn,
      id: bundle.compiledServerFnId,
      chunk: bundle.compiledServerFnChunk,
    },
    bundle: {
      callChunks: bundle.callChunks,
      definitionChunks: bundle.definitionChunks,
      unboundCallChunks: bundle.unboundCallChunks,
      middleware: bundle.middleware,
    },
    runtime: {
      missingConfiguration: runtime.missingConfiguration,
      callerShapedInvalidToken: runtime.callerShapedInvalidToken,
    },
  };
}

function containsMissingSymbol(result) {
  return Object.values(result.runtime).some(({ diagnostics }) =>
    diagnostics.some((diagnostic) =>
      diagnostic.includes("setErrorThrowerOptions is not defined"),
    ),
  );
}

function requestFailsAtClerkConfiguration(runtimeResult) {
  return (
    runtimeResult.response.status >= 400 &&
    runtimeResult.diagnostics.some((diagnostic) =>
      diagnostic.includes(CLERK_CONFIGURATION_ERROR),
    )
  );
}

function callerContextWasNotAccepted(runtimeResult) {
  const observableOutput = [
    runtimeResult.response.body,
    ...runtimeResult.diagnostics,
  ].join("\n");
  return Object.values(CALLER_SHAPED_HEADERS).every(
    (value) => !observableOutput.includes(value),
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const result = await inspectAndDriveBuiltStartDispatcher(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);

  const sourceFixed =
    result.bundle.unboundCallChunks.length === 0 &&
    !containsMissingSymbol(result) &&
    result.bundle.middleware.productionClerkRegistrationPresent &&
    result.bundle.middleware.productionBypassFailsLoud &&
    result.bundle.middleware.clerkLibraryPresent &&
    JSON.stringify(result.bundle.middleware.requestMiddlewareOrder) ===
      JSON.stringify(EXPECTED_REQUEST_MIDDLEWARE_ORDER) &&
    requestFailsAtClerkConfiguration(result.runtime.missingConfiguration) &&
    requestFailsAtClerkConfiguration(result.runtime.callerShapedInvalidToken) &&
    callerContextWasNotAccepted(result.runtime.callerShapedInvalidToken);
  const regression =
    result.runtime.missingConfiguration.response.status === 500 &&
    result.bundle.unboundCallChunks.length > 0 &&
    containsMissingSymbol(result);

  if (options.expectation === "source-fixed") {
    if (!sourceFixed) {
      throw new Error("start_built_dispatcher_not_fixed");
    }
    process.stdout.write("START_BUILT_DISPATCHER_PASS\n");
  } else if (options.expectation === "regression") {
    if (!regression) {
      throw new Error("start_built_dispatcher_regression_not_reproduced");
    }
    process.stdout.write("START_BUILT_DISPATCHER_REGRESSION_REPRODUCED\n");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(`${stringifyDiagnostic(error)}\n`);
    process.exitCode = 1;
  });
}
