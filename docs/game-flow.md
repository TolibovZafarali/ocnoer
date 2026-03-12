# Game Flow

## Purpose

This document defines how the Ocnoer story system should behave in MVP.

The product is a narrative-driven, visual novel style experience with minimal player interaction and a mostly linear flow.

## Core Hierarchy

The story structure is:

`Chapter -> Scene -> DialogueEntry`

### Chapter

A chapter is a major narrative segment.

A chapter contains:

- ordered scenes
- title and identity metadata
- optional publication state

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
- player input prompt

## Scene Rendering Rules

These rules should remain fixed unless the product direction changes.

- Ocnoer appears on the left when she speaks or thinks.
- Other characters appear on the right.
- Narrator text appears in the center.
- The background image fills the scene.
- Each scene may have its own background music.

These placement rules are product rules, not optional UI preferences.

## Reading Flow

The intended player experience is:

1. Enter the story reader.
2. Load the current chapter.
3. Load the current scene in chapter order.
4. Present dialogue entries in scene order.
5. Advance to the next scene when the current scene is complete.
6. Advance to the next chapter when the current chapter is complete.

The default assumption is linear progression.

## Interaction Rules

Interaction is intentionally limited.

The only interactive writing moment in MVP is when the player speaks with Alvyn Rivers.

During those moments:

1. the story reaches a dialogue entry configured as a player input prompt
2. the player types a response
3. the response is saved
4. the admin can review the response later in the admin panel

Important boundary:

- responses are stored for narrative and emotional context
- responses do not create branches or alternate story paths in MVP

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

## Scene Composition Expectations

Each scene should be authored as a coherent presentation unit.

Minimum authoring expectations:

- define the scene's place inside a chapter
- assign its dialogue sequence
- assign background media when needed
- link any required character portraits
- identify whether the scene includes a player prompt

## Example Flow

A typical progression should look like this:

1. Chapter 1 opens.
2. Scene 1 loads its background and music.
3. Narrator text sets the tone.
4. Ocnoer speaks from the left.
5. Another character replies from the right.
6. A later scene includes an Alvyn conversation prompt.
7. The player enters a response.
8. The story continues on the same linear path.

## Out Of Scope For MVP

The game flow should not assume:

- branching dialogue trees
- player stat systems
- affinity systems
- multiple endings driven by player input
- open exploration or map navigation

Ocnoer is a guided narrative experience first.
