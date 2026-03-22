import { describe, expect, it } from "vitest";

import {
  applySceneDressCarrySelection,
  BASE_DRESS_OPTION_KEY,
  getDressBranchFlagKey
} from "@/lib/story/wardrobe";

const ocnoerId = "character_ocnoer";

describe("applySceneDressCarrySelection", () => {
  it("keeps branch flags unchanged when scene is not available", () => {
    const branchFlags = {
      [getDressBranchFlagKey(ocnoerId)]: "mourning"
    };

    const result = applySceneDressCarrySelection({
      scene: null,
      branchFlags
    });

    expect(result).toBe(branchFlags);
  });

  it("resets Ocnoer to the base dress when scene carry is disabled", () => {
    const branchFlags = {
      [getDressBranchFlagKey(ocnoerId)]: "mourning"
    };

    const result = applySceneDressCarrySelection({
      scene: {
        carryOcnoerDressSelection: false,
        characterPool: [
          {
            id: ocnoerId,
            slug: "ocnoer"
          }
        ]
      },
      branchFlags
    });

    expect(result).toEqual({
      [getDressBranchFlagKey(ocnoerId)]: BASE_DRESS_OPTION_KEY
    });
  });

  it("keeps branch flags unchanged when carry is enabled", () => {
    const branchFlags = {
      [getDressBranchFlagKey(ocnoerId)]: "mourning"
    };

    const result = applySceneDressCarrySelection({
      scene: {
        carryOcnoerDressSelection: true,
        characterPool: [
          {
            id: ocnoerId,
            slug: "ocnoer"
          }
        ]
      },
      branchFlags
    });

    expect(result).toBe(branchFlags);
  });

  it("keeps branch flags unchanged when Ocnoer is not in the scene", () => {
    const branchFlags = {
      [getDressBranchFlagKey(ocnoerId)]: "mourning"
    };

    const result = applySceneDressCarrySelection({
      scene: {
        carryOcnoerDressSelection: false,
        characterPool: [
          {
            id: "character_ren",
            slug: "ren"
          }
        ]
      },
      branchFlags
    });

    expect(result).toBe(branchFlags);
  });

  it("keeps branch flags unchanged when Ocnoer is already on base dress", () => {
    const branchFlags = {
      [getDressBranchFlagKey(ocnoerId)]: BASE_DRESS_OPTION_KEY
    };

    const result = applySceneDressCarrySelection({
      scene: {
        carryOcnoerDressSelection: false,
        characterPool: [
          {
            id: ocnoerId,
            slug: "ocnoer"
          }
        ]
      },
      branchFlags
    });

    expect(result).toBe(branchFlags);
  });
});
