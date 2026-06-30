import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import type { LspCliRequest, LspServerKind } from "./schema.js";
import { CliError } from "./errors.js";

export interface ResolvedServerConfig {
  kind: LspServerKind;
  command: string;
  args: string[];
  resolvedCommand: string;
  solution?: string;
}

export interface SessionConfig {
  hash: string;
  workspace: string;
  server: ResolvedServerConfig;
  initializeTimeoutMs: number;
}

export interface CreateSessionConfigOptions {
  timeoutMs?: number;
}

export interface ResolveServerConfigOptions {
  solutionBase?: string;
}

export const defaultInitializeTimeoutMs = 60_000;
export const defaultOmniSharpInitializeTimeoutMs = 180_000;

export function resolveServerConfig(
  request: LspCliRequest,
  workspace = process.cwd(),
  options: ResolveServerConfigOptions = {}
): ResolvedServerConfig {
  const kind = request.lspServerKind ?? inferServerKind(request);
  const command = request.lspServerPath ?? defaultServerPath(kind);
  const solutionBase =
    request.workspace === undefined ? options.solutionBase ?? workspace : workspace;
  const solution = request.solution === undefined
    ? undefined
    : resolveSolutionPath(solutionBase, request.solution);
  const args = applySolutionArgs(
    kind,
    request.lspServerArgs ?? defaultServerArgs(kind),
    solution
  );

  return {
    kind,
    command,
    args,
    resolvedCommand: resolveExecutable(command),
    ...(solution === undefined ? {} : { solution })
  };
}

function inferServerKind(request: LspCliRequest): LspServerKind {
  if (request.solution !== undefined && request.lspServerPath === undefined) {
    return "omnisharp";
  }

  if (request.lspServerPath !== undefined) {
    return "custom";
  }
  return "csharp-ls";
}

function defaultServerPath(kind: LspServerKind): string {
  switch (kind) {
    case "csharp-ls":
      return "csharp-ls";
    case "roslyn":
      return "roslyn-language-server";
    case "omnisharp":
      return "omnisharp";
    case "custom":
      return "csharp-ls";
  }
}

function defaultServerArgs(kind: LspServerKind): string[] {
  switch (kind) {
    case "csharp-ls":
    case "custom":
      return [];
    case "roslyn":
      return ["--stdio", "--autoLoadProjects"];
    case "omnisharp":
      return ["--languageserver"];
  }
}

function resolveSolutionPath(workspace: string, solution: string): string {
  const resolved = path.isAbsolute(solution)
    ? path.normalize(solution)
    : path.resolve(workspace, solution);

  if (path.extname(resolved).toLowerCase() !== ".sln") {
    throw new CliError(
      "INVALID_REQUEST",
      "solution must point to a .sln file."
    );
  }

  return resolved;
}

function applySolutionArgs(
  kind: LspServerKind,
  args: string[],
  solution: string | undefined
): string[] {
  if (solution === undefined) {
    return args;
  }

  if (kind !== "omnisharp") {
    throw new CliError(
      "INVALID_REQUEST",
      "solution is supported only with the omnisharp server kind."
    );
  }

  if (hasOmniSharpSolutionArg(args)) {
    throw new CliError(
      "INVALID_REQUEST",
      "solution cannot be combined with lspServerArgs that already include -s or --source."
    );
  }

  return [...args, "-s", solution];
}

function hasOmniSharpSolutionArg(args: string[]): boolean {
  return args.some(
    (arg) => arg === "-s" || arg === "--source" || arg.startsWith("--source=")
  );
}

export function createSessionConfig(
  workspace: string,
  server: ResolvedServerConfig,
  options: CreateSessionConfigOptions = {}
): SessionConfig {
  const hashInput = JSON.stringify({
    workspace: path.resolve(workspace),
    lspServerPath: server.resolvedCommand,
    lspServerArgs: server.args
  });
  const hash = createHash("sha256").update(hashInput).digest("hex").slice(0, 32);
  return {
    hash,
    workspace: path.resolve(workspace),
    server,
    initializeTimeoutMs: initializeTimeoutMsFor(server, options.timeoutMs)
  };
}

function initializeTimeoutMsFor(
  server: ResolvedServerConfig,
  requestTimeoutMs: number | undefined
): number {
  const base =
    server.kind === "omnisharp"
      ? defaultOmniSharpInitializeTimeoutMs
      : defaultInitializeTimeoutMs;
  return requestTimeoutMs === undefined ? base : Math.max(base, requestTimeoutMs);
}

export function getStateDir(): string {
  return (
    process.env.CSHARP_LSP_CLI_STATE_DIR ??
    path.join(os.tmpdir(), "csharp-lsp-cli")
  );
}

export function getSocketPath(hash: string): string {
  if (process.platform === "win32") {
    return `\\\\.\\pipe\\csharp-lsp-cli-${hash}`;
  }

  const uid = os.userInfo().uid;
  return path.join(getStateDir(), `csharp-lsp-cli-${uid}-${hash}.sock`);
}

export function resolveExecutable(command: string): string {
  if (path.isAbsolute(command) || command.includes(path.sep)) {
    return path.resolve(command);
  }

  if (process.platform === "win32" && command.includes("/")) {
    return path.resolve(command);
  }

  const found = findOnPath(command);
  return found ?? command;
}

function findOnPath(command: string): string | undefined {
  const pathValue = process.env.PATH ?? "";
  const pathExt = process.platform === "win32"
    ? (process.env.PATHEXT ?? ".EXE;.CMD;.BAT;.COM")
        .split(";")
        .filter(Boolean)
    : [""];
  const names = process.platform === "win32" && path.extname(command) === ""
    ? pathExt.map((ext) => `${command}${ext.toLowerCase()}`)
    : [command];

  for (const dir of pathValue.split(path.delimiter)) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
  }

  return undefined;
}
