import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import type { LspCliRequest, LspServerKind } from "./schema.js";

export interface ResolvedServerConfig {
  kind: LspServerKind;
  command: string;
  args: string[];
  resolvedCommand: string;
}

export interface SessionConfig {
  hash: string;
  workspace: string;
  server: ResolvedServerConfig;
}

export function resolveServerConfig(request: LspCliRequest): ResolvedServerConfig {
  const kind = request.lspServerKind ?? inferServerKind(request);
  const command = request.lspServerPath ?? defaultServerPath(kind);
  const args = request.lspServerArgs ?? defaultServerArgs(kind);

  return {
    kind,
    command,
    args,
    resolvedCommand: resolveExecutable(command)
  };
}

function inferServerKind(request: LspCliRequest): LspServerKind {
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

export function createSessionConfig(
  workspace: string,
  server: ResolvedServerConfig
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
    server
  };
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
