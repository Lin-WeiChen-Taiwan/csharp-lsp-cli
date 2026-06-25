import { CliError } from "./errors.js";

export interface ExternalPosition {
  line: number;
  character: number;
}

export interface LspPosition {
  line: number;
  character: number;
}

export function toLspPosition(position: ExternalPosition): LspPosition {
  if (position.line < 1 || position.character < 1) {
    throw new CliError(
      "INVALID_POSITION",
      "line and character must be 1-based positive integers."
    );
  }

  return {
    line: position.line - 1,
    character: position.character - 1
  };
}

export function toExternalPosition(position: LspPosition): ExternalPosition {
  return {
    line: position.line + 1,
    character: position.character + 1
  };
}

export interface LspRange {
  start: LspPosition;
  end: LspPosition;
}

export interface ExternalRange {
  start: ExternalPosition;
  end: ExternalPosition;
}

export function toExternalRange(range: LspRange): ExternalRange {
  return {
    start: toExternalPosition(range.start),
    end: toExternalPosition(range.end)
  };
}
