export const PRIMARY_LEFT_STAGE_CHARACTER_SLUG = "ocnoer";

export function isPrimaryLeftStageCharacterSlug(slug: string) {
  return slug.trim().toLowerCase() === PRIMARY_LEFT_STAGE_CHARACTER_SLUG;
}

export function findPrimaryLeftStageCharacter<T extends { slug: string }>(
  characters: T[]
) {
  return (
    characters.find((character) =>
      isPrimaryLeftStageCharacterSlug(character.slug)
    ) ?? null
  );
}
