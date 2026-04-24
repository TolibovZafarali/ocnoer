import type { PlayerProgress } from "./reader";

export const CAT_NAME_BRANCH_FLAG_KEY = "cat_name";
export const CAT_NAME_LOCKED_BRANCH_FLAG_KEY = "cat_name_locked";
export const MIN_CAT_NAME_LENGTH = 1;
export const MAX_CAT_NAME_LENGTH = 80;
export const CAT_NAME_PATTERN = /^[a-zA-Z0-9 .,'_-]+$/;

const CAT_NAME_TEMPLATE_PATTERN = /\{\{\s*cat_name\s*\}\}/gi;

export function normalizeCatNameInput(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function validateCatNameInput(value: string) {
  const normalizedValue = normalizeCatNameInput(value);

  if (normalizedValue.length < MIN_CAT_NAME_LENGTH) {
    return "Enter a cat name.";
  }

  if (normalizedValue.length > MAX_CAT_NAME_LENGTH) {
    return `Cat name must be ${MAX_CAT_NAME_LENGTH} characters or fewer.`;
  }

  if (!CAT_NAME_PATTERN.test(normalizedValue)) {
    return "Use letters, numbers, spaces, and basic punctuation only.";
  }

  return null;
}

export function resolveDialogueTextTemplate(
  text: string,
  catName: string | null
) {
  if (!catName) {
    return text;
  }

  return text.replace(CAT_NAME_TEMPLATE_PATTERN, catName);
}

export function resolveInitialCatNameState(input: {
  catName: string | null;
  catNameLocked: boolean;
}) {
  const normalizedCatName = normalizeCatNameInput(input.catName ?? "");

  if (normalizedCatName.length === 0) {
    return {
      catName: null,
      catNameLocked: false
    };
  }

  return {
    catName: normalizedCatName,
    catNameLocked: input.catNameLocked
  };
}

export function readCatNameFromBranchFlags(
  branchFlags: PlayerProgress["branchFlags"]
) {
  const value = branchFlags[CAT_NAME_BRANCH_FLAG_KEY];

  if (typeof value !== "string") {
    return null;
  }

  const normalizedValue = normalizeCatNameInput(value);

  return normalizedValue.length > 0 ? normalizedValue : null;
}

export function reconcileCatNameBranchFlags(input: {
  branchFlags: PlayerProgress["branchFlags"];
  catName: string | null;
  catNameLocked: boolean;
}) {
  const nextBranchFlags = { ...input.branchFlags };

  if (!input.catName) {
    delete nextBranchFlags[CAT_NAME_BRANCH_FLAG_KEY];
    delete nextBranchFlags[CAT_NAME_LOCKED_BRANCH_FLAG_KEY];
    return nextBranchFlags;
  }

  nextBranchFlags[CAT_NAME_BRANCH_FLAG_KEY] = input.catName;

  if (input.catNameLocked) {
    nextBranchFlags[CAT_NAME_LOCKED_BRANCH_FLAG_KEY] = true;
    return nextBranchFlags;
  }

  delete nextBranchFlags[CAT_NAME_LOCKED_BRANCH_FLAG_KEY];
  return nextBranchFlags;
}
