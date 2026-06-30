import path from "node:path";
import { describe, expect, it } from "vitest";
import { CliError } from "../../src/errors.js";
import { createSessionConfig, resolveServerConfig } from "../../src/serverConfig.js";

describe("server config", () => {
  it("adds a workspace-relative solution to OmniSharp args", () => {
    const workspace = path.resolve("workspace");
    const server = resolveServerConfig(
      {
        version: 1,
        operation: "status",
        workspace,
        lspServerKind: "omnisharp",
        solution: "App.sln"
      },
      workspace
    );

    expect(server.kind).toBe("omnisharp");
    expect(server.solution).toBe(path.join(workspace, "App.sln"));
    expect(server.args).toEqual(["--languageserver", "-s", path.join(workspace, "App.sln")]);
  });

  it("resolves relative solution from cwd when workspace is omitted", () => {
    const workspace = path.resolve("repo-root");
    const cwd = path.join(workspace, "subdir");
    const server = resolveServerConfig(
      {
        version: 1,
        operation: "status",
        lspServerKind: "omnisharp",
        solution: "App.sln"
      },
      workspace,
      { solutionBase: cwd }
    );

    expect(server.solution).toBe(path.join(cwd, "App.sln"));
    expect(server.args).toEqual(["--languageserver", "-s", path.join(cwd, "App.sln")]);
  });

  it("infers OmniSharp when solution is provided without a server kind", () => {
    const workspace = path.resolve("workspace");
    const server = resolveServerConfig(
      {
        version: 1,
        operation: "status",
        solution: "App.sln"
      },
      workspace
    );

    expect(server.kind).toBe("omnisharp");
  });

  it("uses a longer initialize timeout for OmniSharp sessions", () => {
    const workspace = path.resolve("workspace");
    const server = resolveServerConfig(
      {
        version: 1,
        operation: "status",
        lspServerKind: "omnisharp",
        solution: "App.sln"
      },
      workspace
    );

    expect(resolveSessionTimeout(workspace, server)).toBe(180_000);
  });

  it("lets request timeout extend but not lower session initialize timeout", () => {
    const workspace = path.resolve("workspace");
    const server = resolveServerConfig(
      {
        version: 1,
        operation: "status",
        lspServerKind: "omnisharp",
        solution: "App.sln"
      },
      workspace
    );

    expect(resolveSessionTimeout(workspace, server, 25_000)).toBe(180_000);
    expect(resolveSessionTimeout(workspace, server, 240_000)).toBe(240_000);
  });

  it("preserves custom OmniSharp args and appends the solution", () => {
    const workspace = path.resolve("workspace");
    const server = resolveServerConfig(
      {
        version: 1,
        operation: "status",
        lspServerKind: "omnisharp",
        lspServerArgs: ["--languageserver", "--loglevel", "debug"],
        solution: "App.sln"
      },
      workspace
    );

    expect(server.args).toEqual([
      "--languageserver",
      "--loglevel",
      "debug",
      "-s",
      path.join(workspace, "App.sln")
    ]);
  });

  it("rejects solution for non-OmniSharp servers", () => {
    expect(() =>
      resolveServerConfig(
        {
          version: 1,
          operation: "status",
          lspServerKind: "csharp-ls",
          solution: "App.sln"
        },
        path.resolve("workspace")
      )
    ).toThrow(CliError);
  });

  it("rejects duplicate OmniSharp solution args", () => {
    expect(() =>
      resolveServerConfig(
        {
          version: 1,
          operation: "status",
          lspServerKind: "omnisharp",
          lspServerArgs: ["--languageserver", "-s", "Other.sln"],
          solution: "App.sln"
        },
        path.resolve("workspace")
      )
    ).toThrow(/already include -s or --source/);
  });
});

function resolveSessionTimeout(
  workspace: string,
  server: ReturnType<typeof resolveServerConfig>,
  timeoutMs?: number
): number {
  return createSessionConfig(workspace, server, { timeoutMs }).initializeTimeoutMs;
}
