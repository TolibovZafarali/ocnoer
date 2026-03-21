# Game Flow

## Purpose

This document defines how the Ocnoer story system behaves after the published-runtime refactor.

The product remains a narrative-driven, visual-novel-style experience with limited player interaction and a mostly linear flow.

## Core Hierarchy

The authored story structure is:

`Chapter -> Scene -> DialogueEntry`

The published runtime preserves that same linear progression but delivers it through compiled chapter bundles.

### Chapter

A chapter is a major narrative segment.

A chapter contains:

- ordered scenes
- title and identity metadata
- one published runtime bundle per published version

### Scene

A scene is the main unit the player experiences on screen.

A scene contains:

- background image
- background music
- ordered dialogue entries
- narrator text where needed
- character portrait references

### DialogueEntry

A dialogue entry is one ordered item within a scene.

For MVP, a dialogue entry can be:

- narrator text
- character speech
- character thought
- dress prompt
- player input prompt

## Scene Rendering Rules

These rules remain fixed unless the product direction changes.

- Ocnoer appears on the left when she speaks or thinks.
- Other characters appear on the right.
- Narrator text appears in the center.
- The background image fills the scene.
- Each scene may have its own background music.

These placement rules are product rules, not optional UI preferences.

## Reading Flow

The intended player experience is:

1. Enter the story reader.
2. Resolve the player's pinned published story version.
3. Load the published manifest and current chapter bundle.
4. Load the current scene in chapter order.
5. Present dialogue entries in scene order.
6. Advance to the next scene when the current scene is complete.
7. Advance to the next chapter when the current chapter is complete.

The default assumption is linear progression.

Important runtime boundary:

- the reader consumes published bundles
- the reader does not fetch raw `Chapter`, `Scene`, or `DialogueEntry` authoring records during normal progression
- chapter-to-chapter movement should not require per-entry backend round-trips

## Interaction Rules

Interaction is intentionally limited.

The player can make visual-only wardrobe selections for Ocnoer and can later submit free-text responses to Alvyn Rivers.

During wardrobe moments:

1. the story reaches a dialogue entry configured as a dress prompt
2. the player chooses one of the authored dress options
3. the choice is stored in local reader progress under `branchFlags`
4. later Ocnoer portraits use that dress until another authored dress prompt changes it again

During those moments:

1. the story reaches a dialogue entry configured as a player input prompt
2. the player types a response
3. the response is validated against the pinned published runtime bundle
4. the response is saved with published version + runtime public ids
5. the admin can review the response later in the admin panel

Important boundary:

- responses are stored for narrative and emotional context
- responses do not create branches or alternate story paths in MVP

## Progress And Resume

Reader progress is local-first in phase one.

Checkpoint data includes:

- published version id
- chapter public id
- scene public id
- dialogue entry public id
- local `branchFlags` for visual-only reader state such as Ocnoer’s active dress
- last-read timestamp

Resume behavior:

1. local progress is updated immediately as the reader advances
2. backend checkpoint sync happens on a debounce and on major transitions
3. if a player has in-progress data, they stay pinned to that published version
4. new reading sessions without progress start on the current active published version

This preserves stable in-progress sessions even when the admin publishes a newer version.

## Dialogue Entry Types

### Narrator Text

- displayed in the center
- not associated with a speaking portrait
- used for description, transitions, or internal scene context

### Character Speech

- displayed with a speaking character
- uses portrait placement rules
- advances the scene narrative directly

### Character Thought

- treated as character-linked text
- still follows placement rules
- may use distinct visual styling from spoken dialogue

### Player Input Prompt

- appears only in designated Alvyn conversation moments
- collects free-text input from the player
- saves the response for admin review

### Dress Prompt

- appears only in authored Ocnoer wardrobe moments
- displays one or more dress choices, including the reserved default option
- updates portrait art only and does not branch the story

## Scene Composition Expectations

Each scene should be authored as a coherent presentation unit.

Minimum authoring expectations:

- define the scene's place inside a chapter
- assign its dialogue sequence
- assign background media when needed
- link any required character portraits
- link any required Ocnoer dress options when a wardrobe prompt is present
- identify whether the scene includes a player prompt

## Example Flow

A typical progression should look like this:

1. Chapter 1 opens from a published chapter bundle.
2. Scene 1 loads its background and music.
3. Narrator text sets the tone.
4. Ocnoer speaks from the left.
5. Another character replies from the right.
6. A later scene includes an Ocnoer dress prompt.
7. The player selects a dress and the next scenes use that portrait art.
8. A later scene includes an Alvyn conversation prompt.
9. The player enters a response.
10. The story continues on the same linear path.

## Out Of Scope For MVP

The game flow should not assume:

- branching dialogue trees
- player stat systems
- affinity systems
- multiple endings driven by player input
- open exploration or map navigation

Ocnoer is a guided narrative experience first.
