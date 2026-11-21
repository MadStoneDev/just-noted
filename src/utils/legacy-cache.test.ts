// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from "vitest";
import { legacyCopyId, legacyCacheSourcesPending, markLegacyCacheChecked, LEGACY_COPY_BASE_VERSION } from "./legacy-cache";
import { isValidConflictCopy, decideBackgroundWrite } from "./background-conflict";

describe("legacy cache marker", () => {
  beforeEach(() => localStorage.clear());

  it("every source is pending until checked, then stays checked", () => {
    expect([...legacyCacheSourcesPending()].sort()).toEqual(["redis", "supabase"]);
    markLegacyCacheChecked("redis");
    expect([...legacyCacheSourcesPending()]).toEqual(["supabase"]);
    markLegacyCacheChecked("supabase");
    expect(legacyCacheSourcesPending().size).toBe(0);
  });

  it("copy id is a valid UUID, fixed per record (one copy across tabs / retries)", () => {
    const a = legacyCopyId({ id: "n1", updatedAt: 5 });
    expect(isValidConflictCopy({ id: a, stamp: "x" })).toBe(true);
    expect(legacyCopyId({ id: "n1", updatedAt: 5 })).toBe(a);
    expect(legacyCopyId({ id: "n1", updatedAt: 6 })).not.toBe(a);
  });

  it("the copy base is never 'still at base': the server always copies or no-ops", () => {
    for (const serverVersion of [1, 2, 50]) {
      const d = (content: string) =>
        decideBackgroundWrite({ baseVersion: LEGACY_COPY_BASE_VERSION, serverVersion, serverContent: "s", content });
      expect(d("different")).toBe("copy");
      expect(d("s")).toBe("noop");
    }
  });
});
