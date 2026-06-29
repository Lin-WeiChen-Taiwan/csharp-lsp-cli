import path from "node:path";
import { describe, expect, it } from "vitest";
import { CliError } from "../../src/errors.js";
import { resolveServerConfig } from "../../src/serverConfig.js";

describe("server config", () => {
  it("adds a workspace-relative solution to OmniSharp args", () => {
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

    expect(server.kind).toBe("omnisharp");
    expect(server.solution).toBe(path.join(workspace, "App.sln"));
    expect(server.args).toEqual(["--languageserver", "-s", path.join(workspace, "App.sln")]);
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
