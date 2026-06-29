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
