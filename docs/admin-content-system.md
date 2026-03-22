# Admin Content System

## Media Storage

All uploaded media is stored in `SUPABASE_RUNTIME_BUCKET`:

- character emotions: `media/characters/<characterId>/<emotionId>`
- character dress overrides: `media/characters/<characterId>/dresses/<dressId>/<assetId>`
- background images: `media/background-images/<assetId>`
- music tracks: `media/background-music/<assetId>`

JSON stores metadata and storage paths only. Media binaries are never stored in a database.

## Authoring JSON

Admin source-of-truth is stored as JSON files:

- `authoring/characters.json`
- `authoring/assets.json`
- `authoring/chapters.json`

These files contain character definitions, assets, chapter records, scenes, and dialogue.

## Generated Runtime JSON

Runtime output is regenerated after every admin mutation:

- `runtime/manifest.json`
- `runtime/characters.json`
- `runtime/assets.json`
- `runtime/chapters/<chapterId>.json`

Each chapter bundle contains ordered scenes, dialogue, dress prompts, selected emotion image paths, scene media, scene cast pool, dress metadata, and compiled left/right stage data for the player.

## Authoring Workflow

### Characters

- Create character with name, slug, optional bio, and first image
- First uploaded image becomes the default emotion automatically
- Add more emotions later
- Rename emotion keys and labels
- Choose default emotion
- Prevent deleting the last remaining emotion
- Create dress variants for Ocnoer
- Upload per-emotion dress overrides only where the dress art differs from the base character
- Prevent deleting a dress while a dress prompt still references it

### Assets

- Background images and music are authored in separate admin tabs
- Each asset stores metadata plus a storage path
- Scenes reference assets by id during authoring

### Chapters And Scenes

- Create chapter with title, slug, and order index
- After creation, admin is redirected into that chapter
- Create scenes inside the chapter
- Scene authoring includes:
  - title
  - order index
  - background image
  - optional music
  - whether Ocnoer should carry the previously selected dress into this scene
  - selected scene character pool

### Dialogue

- Narrator or selected scene character
- Character rows must choose one of that character’s emotions
- Dress prompt rows are available only when Ocnoer is part of the scene cast
- Dress prompt rows choose one or more dress options, including the reserved `__base__` option for reverting to the default dress
- Dialogue entries get stable ids for progress persistence

## Runtime Loading

`/play` fetches:

1. `runtime/manifest.json`
2. the active chapter bundle from `runtime/chapters/<chapterId>.json`

The player does not call a dynamic chapter/scene/dialogue API.

Local reader progress also stores visual-only `branchFlags`, including the active Ocnoer dress selection under `dress:<characterId>`.
If a scene disables dress carry, the player resets to `__base__` at scene start and that default persists until a later dress prompt selection.

## Admin Protection

- Password from `ADMIN_PASSWORD`
- Server validates submitted password
- Success sets an HttpOnly cookie
- `/admin` pages and server actions require that cookie
