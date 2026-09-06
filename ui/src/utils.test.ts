import { describe, expect, test } from "vitest";
import { parseDuration } from "./utils";

describe("parseDuration", () => {
  test.each([
    ["1s", 1],
    ["1.5m", 90],
    [".5h", 1800],
    ["30d", 2592000],
    [" 2h ", 7200],
  ])("parses %s as whole seconds", (input, expected) => {
    expect(parseDuration(input)).toBe(expected);
  });

  test.each(["", "0s", ".5s", "1.1s", "1w", "1hour", "1h trailing"])(
    "rejects %s",
    (input) => {
      expect(() => parseDuration(input)).toThrow();
    },
  );
});
