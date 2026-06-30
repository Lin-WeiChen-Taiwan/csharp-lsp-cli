#!/usr/bin/env node
import { performance } from "node:perf_hooks";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseRequest, type LspCliResponse } from "./schema.js";
import { discoverWorkspace } from "./workspace.js";
import { createSessionConfig, resolveServerConfig } from "./serverConfig.js";
import { sendRequestToDaemon } from "./daemonClient.js";
import { CliError, toErrorObject } from "./errors.js";

async function main(): Promise<void> {
  const start = performance.now();
  let retried = false;

  try {
    const argv = process.argv.slice(2);
    if (argv.length === 1 && argv[0] === "--help") {
      writeResponse({
        version: 1,
        ok: true,
        result: helpResult(),
        meta: { durationMs: elapsed(start), retried }
      });
      return;
    }

    if (argv.length === 1 && argv[0] === "--version") {
      writeResponse({
        version: 1,
        ok: true,
        result: { version: packageVersion() },
        meta: { durationMs: elapsed(start), retried }
      });
      return;
    }

    if (argv.length !== 0) {
      throw new CliError(
        "INVALID_ARGS",
        "accepted arguments are --help, --version, or no args with stdin JSON."
      );
    }

    const input = await readStdin();
    const request = parseRequest(input);
    const workspace = discoverWorkspace(process.cwd(), {
      workspace: request.workspace,
      file: request.file,
      solution: request.solution
    });
    const server = resolveServerConfig(request, workspace);
    const session = createSessionConfig(workspace, server);
    const daemonResponse = await sendRequestToDaemon(session, request);
    retried = daemonResponse.retried;

    if (daemonResponse.ok) {
      writeResponse({
        version: 1,
        ok: true,
        operation: request.operation,
        session: daemonResponse.session,
        result: daemonResponse.result,
        meta: { durationMs: elapsed(start), retried }
      });
      return;
    }

    writeResponse({
      version: 1,
      ok: false,
      operation: request.operation,
      session: daemonResponse.session,
      error: daemonResponse.error,
      meta: { durationMs: elapsed(start), retried }
    });
  } catch (error) {
    const errorObject = toErrorObject(error);
    process.stderr.write(`[csharp-lsp-cli] ${errorObject.code}: ${errorObject.message}\n`);
    writeResponse({
      version: 1,
      ok: false,
      error: errorObject,
      meta: { durationMs: elapsed(start), retried }
    });
  }
}

function helpResult(): unknown {
  return {
    usage: "csharp-lsp-cli --help | --version | < stdin-json-request",
    stdout: "single JSON response",
    stderr: "human-readable errors and logs",
    operations: [
      "definition",
      "references",
      "hover",
      "documentSymbols",
      "workspaceSymbols",
      "diagnostics",
      "status",
      "stop",
      "restart"
    ]
  };
}

function packageVersion(): string {
  const currentFile = fileURLToPath(import.meta.url);
  const packageJsonPath = path.resolve(path.dirname(currentFile), "../package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8")) as {
    version?: string;
  };
  return packageJson.version ?? "0.0.0";
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
}

function writeResponse(response: LspCliResponse): void {
  process.stdout.write(`${JSON.stringify(response)}\n`);
}

function elapsed(start: number): number {
  return Math.round(performance.now() - start);
}

main().catch((error) => {
  const start = performance.now();
  const errorObject = toErrorObject(error);
  process.stderr.write(`[csharp-lsp-cli] FATAL: ${errorObject.message}\n`);
  writeResponse({
    version: 1,
    ok: false,
    error: errorObject,
    meta: { durationMs: elapsed(start), retried: false }
  });
});
