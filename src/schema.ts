import { z } from "zod";
import { CliError } from "./errors.js";

export const operations = [
  "definition",
  "references",
  "hover",
  "documentSymbols",
  "workspaceSymbols",
  "diagnostics",
  "status",
  "stop",
  "restart"
] as const;

export const lspServerKinds = [
  "csharp-ls",
  "roslyn",
  "omnisharp",
  "custom"
] as const;

export const requestSchema = z
  .object({
    version: z.literal(1),
    operation: z.enum(operations),
    workspace: z.string().min(1).optional(),
    file: z.string().min(1).optional(),
    line: z.number().int().positive().optional(),
    character: z.number().int().positive().optional(),
    query: z.string().optional(),
    includeDeclaration: z.boolean().optional(),
    solution: z.string().min(1).optional(),
    lspServerPath: z.string().min(1).optional(),
    lspServerArgs: z.array(z.string()).optional(),
    lspServerKind: z.enum(lspServerKinds).optional(),
    omnisharpMsBuildPath: z.string().min(1).optional(),
    omnisharpMsBuildName: z.string().min(1).optional(),
    omnisharpUseDefaultMsBuild: z.boolean().optional(),
    timeoutMs: z.number().int().positive().max(600_000).optional()
  })
  .strict();

export type LspOperation = (typeof operations)[number];
export type LspServerKind = (typeof lspServerKinds)[number];
export type LspCliRequest = z.infer<typeof requestSchema>;

export interface LspCliResponse {
  version: 1;
  ok: boolean;
  operation?: LspOperation;
  session?: string;
  result?: unknown;
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  meta: {
    durationMs: number;
    retried: boolean;
  };
}

const fileOperations = new Set<LspOperation>([
  "definition",
  "references",
  "hover",
  "documentSymbols",
  "diagnostics"
]);

const positionOperations = new Set<LspOperation>([
  "definition",
  "references",
  "hover"
]);

export function parseRequest(input: string): LspCliRequest {
  let parsed: unknown;
  try {
    parsed = JSON.parse(input);
  } catch (error) {
    throw new CliError("INVALID_JSON", "stdin must contain one JSON request.", {
      cause: error instanceof Error ? error.message : String(error)
    });
  }

  const result = requestSchema.safeParse(parsed);
  if (!result.success) {
    throw new CliError("INVALID_REQUEST", "request schema validation failed.", {
      issues: result.error.issues
    });
  }

  validateOperationRequirements(result.data);
  return result.data;
}

export function validateOperationRequirements(request: LspCliRequest): void {
  if (fileOperations.has(request.operation) && request.file === undefined) {
    throw new CliError(
      "INVALID_REQUEST",
      `${request.operation} requires file.`
    );
  }

  if (positionOperations.has(request.operation)) {
    const missing: string[] = [];
    if (request.line === undefined) {
      missing.push("line");
    }
    if (request.character === undefined) {
      missing.push("character");
    }
    if (missing.length > 0) {
      throw new CliError(
        "INVALID_REQUEST",
        `${request.operation} requires ${missing.join(", ")}.`
      );
    }
  }

  if (
    request.lspServerKind === "custom" &&
    request.lspServerPath === undefined
  ) {
    throw new CliError(
      "INVALID_REQUEST",
      "custom lspServerKind requires lspServerPath."
    );
  }

  const usesOmniSharpOptions =
    request.omnisharpMsBuildPath !== undefined ||
    request.omnisharpMsBuildName !== undefined ||
    request.omnisharpUseDefaultMsBuild !== undefined;
  const effectiveServerKind =
    request.lspServerKind ??
    (request.solution !== undefined && request.lspServerPath === undefined
      ? "omnisharp"
      : request.lspServerPath !== undefined
        ? "custom"
        : "csharp-ls");
  if (usesOmniSharpOptions && effectiveServerKind !== "omnisharp") {
    throw new CliError(
      "INVALID_REQUEST",
      "omnisharp MSBuild options require lspServerKind omnisharp."
    );
  }
}
