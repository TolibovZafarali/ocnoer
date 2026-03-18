import { describe, expect, it } from "vitest";

import { parseIntegerField } from "@/lib/story/validation";

describe("parseIntegerField", () => {
  it("rejects integers below the configured minimum", () => {
    expect(parseIntegerField("0", "Chapter order", { min: 1 })).toEqual({
      ok: false,
      message: "Chapter order must be at least 1."
    });
  });

  it("accepts integers that meet the configured minimum", () => {
    expect(parseIntegerField("3", "Chapter order", { min: 1 })).toEqual({
      ok: true,
      value: 3
    });
  });
});
