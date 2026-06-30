import { describe, expect, it } from "vitest";
import { parseRequest } from "../../src/schema.js";
import { CliError } from "../../src/errors.js";

describe("request schema", () => {
  it("accepts a minimal definition request", () => {
    const request = parseRequest(
      JSON.stringify({
        version: 1,
        operation: "definition",
        file: "src/main.cs",
        line: 10,
        character: 5
      })
    );

    expect(request.operation).toBe("definition");
    expect(request.line).toBe(10);
  });

  it("accepts an OmniSharp solution request", () => {
    const request = parseRequest(
      JSON.stringify({
        version: 1,
        operation: "status",
        lspServerKind: "omnisharp",
        solution: "App.sln"
      })
    );

    expect(request.lspServerKind).toBe("omnisharp");
    expect(request.solution).toBe("App.sln");
  });

  it("accepts OmniSharp MSBuild override options", () => {
    const request = parseRequest(
      JSON.stringify({
        version: 1,
        operation: "status",
        lspServerKind: "omnisharp",
        solution: "App.sln",
        omnisharpMsBuildPath: "C:/MSBuild/Bin",
        omnisharpMsBuildName: "Pinned MSBuild"
      })
    );

    expect(request.omnisharpMsBuildPath).toBe("C:/MSBuild/Bin");
    expect(request.omnisharpMsBuildName).toBe("Pinned MSBuild");
  });

  it("rejects OmniSharp MSBuild options for non-OmniSharp servers", () => {
    expect(() =>
      parseRequest(
        JSON.stringify({
          version: 1,
          operation: "status",
          lspServerKind: "csharp-ls",
          omnisharpMsBuildPath: "C:/MSBuild/Bin"
        })
      )
    ).toThrow(/require lspServerKind omnisharp/);
  });

  it("rejects unknown fields", () => {
    expect(() =>
      parseRequest(
        JSON.stringify({
          version: 1,
          operation: "status",
          extra: true
        })
      )
    ).toThrow(CliError);
  });

  it("requires position fields for hover", () => {
    expect(() =>
      parseRequest(
        JSON.stringify({
          version: 1,
          operation: "hover",
          file: "src/main.cs"
        })
      )
    ).toThrow(/requires line, character/);
  });

  it("requires lspServerPath for custom server kind", () => {
    expect(() =>
      parseRequest(
        JSON.stringify({
          version: 1,
          operation: "status",
          lspServerKind: "custom"
        })
      )
    ).toThrow(/requires lspServerPath/);
  });
});
