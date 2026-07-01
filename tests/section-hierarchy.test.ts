import { describe, expect, it } from "vitest";

import {
  collapsedHiddenIds,
  normalizeSectionDepths,
  reconcileReorderedIds,
  shiftSubtreeDepth,
} from "@/lib/section-hierarchy";

type Section = { id: string; depth: number };

describe("normalizeSectionDepths", () => {
  it("forces the first section to depth 0", () => {
    const result = normalizeSectionDepths([{ id: "a", depth: 2 }]);
    expect(result[0].depth).toBe(0);
  });

  it("clamps a section to at most one level deeper than its predecessor", () => {
    const result = normalizeSectionDepths([
      { id: "a", depth: 0 },
      { id: "b", depth: 2 },
    ]);
    expect(result.map((s) => s.depth)).toEqual([0, 1]);
  });

  it("clamps to MAX_SECTION_DEPTH (2) and floors negatives to 0", () => {
    const result = normalizeSectionDepths([
      { id: "a", depth: -5 },
      { id: "b", depth: 1 },
      { id: "c", depth: 9 },
    ]);
    expect(result.map((s) => s.depth)).toEqual([0, 1, 2]);
  });

  it("returns the same reference when nothing changes (skips redundant writes)", () => {
    const input: Section[] = [
      { id: "a", depth: 0 },
      { id: "b", depth: 1 },
      { id: "c", depth: 1 },
    ];
    expect(normalizeSectionDepths(input)).toBe(input);
  });
});

describe("shiftSubtreeDepth", () => {
  it("shifts a section and its contiguous descendants together", () => {
    // a(0) > b(1) child of a; c(0). Indent c's neighbour subtree.
    const sections: Section[] = [
      { id: "a", depth: 0 },
      { id: "b", depth: 1 },
      { id: "c", depth: 1 },
      { id: "d", depth: 2 },
    ];
    // Shift the subtree rooted at index 2 (c + its child d) one level shallower.
    const result = shiftSubtreeDepth(sections, 2, -1);
    expect(result.map((s) => s.depth)).toEqual([0, 1, 0, 1]);
  });

  it("returns the same array for an out-of-range index", () => {
    const sections: Section[] = [{ id: "a", depth: 0 }];
    expect(shiftSubtreeDepth(sections, 5, 1)).toBe(sections);
    expect(shiftSubtreeDepth(sections, -1, 1)).toBe(sections);
  });

  it("never pushes depth above MAX or below 0", () => {
    const sections: Section[] = [
      { id: "a", depth: 0 },
      { id: "b", depth: 1 },
    ];
    const deeper = shiftSubtreeDepth(sections, 1, 5);
    expect(deeper[1].depth).toBe(1); // clamped: can't exceed predecessor + 1
    const shallower = shiftSubtreeDepth(sections, 1, -5);
    expect(shallower[1].depth).toBe(0);
  });
});

describe("collapsedHiddenIds", () => {
  it("hides all contiguous descendants of a collapsed section", () => {
    const sections: Section[] = [
      { id: "a", depth: 0 },
      { id: "b", depth: 1 },
      { id: "c", depth: 2 },
      { id: "d", depth: 0 },
    ];
    const hidden = collapsedHiddenIds(sections, new Set(["a"]));
    expect(hidden).toEqual(new Set(["b", "c"]));
  });

  it("returns an empty set when nothing is collapsed", () => {
    const sections: Section[] = [
      { id: "a", depth: 0 },
      { id: "b", depth: 1 },
    ];
    expect(collapsedHiddenIds(sections, new Set())).toEqual(new Set());
  });
});

describe("reconcileReorderedIds", () => {
  it("moves a collapsed subtree as one unit", () => {
    const sections: Section[] = [
      { id: "a", depth: 0 },
      { id: "b", depth: 1 }, // hidden child of collapsed a
      { id: "c", depth: 0 },
    ];
    // Only visible rows are reordered (a and c); a is collapsed so b travels with it.
    const result = reconcileReorderedIds(sections, ["c", "a"], new Set(["a"]));
    expect(result).toEqual(["c", "a", "b"]);
  });

  it("keeps unseen ids at the end as a safety net", () => {
    const sections: Section[] = [
      { id: "a", depth: 0 },
      { id: "b", depth: 0 },
      { id: "c", depth: 0 },
    ];
    const result = reconcileReorderedIds(sections, ["b"], new Set());
    expect(result).toEqual(["b", "a", "c"]);
  });
});
