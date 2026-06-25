import { describe, expect, it } from "vitest";
import { toExternalPosition, toExternalRange, toLspPosition } from "../../src/position.js";

describe("position conversion", () => {
  it("converts external 1-based positions to LSP 0-based", () => {
    expect(toLspPosition({ line: 10, character: 5 })).toEqual({
      line: 9,
      character: 4
    });
  });

  it("converts LSP positions to external 1-based positions", () => {
    expect(toExternalPosition({ line: 9, character: 4 })).toEqual({
      line: 10,
      character: 5
    });
  });

  it("converts ranges", () => {
    expect(
      toExternalRange({
        start: { line: 0, character: 0 },
        end: { line: 0, character: 6 }
      })
    ).toEqual({
      start: { line: 1, character: 1 },
      end: { line: 1, character: 7 }
    });
  });
});
