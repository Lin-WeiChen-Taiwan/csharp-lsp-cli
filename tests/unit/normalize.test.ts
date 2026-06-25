import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeDiagnostics, normalizeHover, normalizeLocationResult } from "../../src/normalize.js";
import { pathToUri } from "../../src/pathUtils.js";

describe("response normalization", () => {
  it("normalizes locations to workspace-relative paths and 1-based ranges", () => {
    const workspace = path.resolve("workspace");
    const uri = pathToUri(path.join(workspace, "src", "Program.cs"));
    const normalized = normalizeLocationResult(workspace, {
      uri,
      range: {
        start: { line: 1, character: 2 },
        end: { line: 1, character: 9 }
      }
    });

    expect(normalized).toEqual({
      uri,
      path: "src/Program.cs",
      range: {
        start: { line: 2, character: 3 },
        end: { line: 2, character: 10 }
      }
    });
  });

  it("normalizes hover content arrays", () => {
    expect(
      normalizeHover("workspace", {
        contents: ["plain", { language: "csharp", value: "code" }]
      })
    ).toEqual({
      contents: ["plain", "code"],
      workspace: "workspace"
    });
  });

  it("normalizes diagnostics", () => {
    const workspace = path.resolve("workspace");
    const uri = pathToUri(path.join(workspace, "src", "Program.cs"));
    const diagnostics = new Map([
      [
        uri,
        [
          {
            range: {
              start: { line: 0, character: 1 },
              end: { line: 0, character: 2 }
            },
            severity: 1,
            source: "fake",
            message: "broken"
          }
        ]
      ]
    ]);

    expect(normalizeDiagnostics(workspace, diagnostics)).toEqual([
      {
        uri,
        path: "src/Program.cs",
        diagnostics: [
          {
            range: {
              start: { line: 1, character: 2 },
              end: { line: 1, character: 3 }
            },
            severity: 1,
            source: "fake",
            message: "broken"
          }
        ]
      }
    ]);
  });
});
