import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";

import { signOutAction } from "@/app/actions/auth";
import {
  createChapterAction,
  createCharacterAction,
  createDialogueEntryAction,
  createSceneAction,
  createSceneAssetAction,
  deleteChapterAction,
  deleteCharacterAction,
  deleteDialogueEntryAction,
  deleteSceneAction,
  deleteSceneAssetAction,
  updateChapterAction,
  updateCharacterAction,
  updateDialogueEntryAction,
  updateSceneAction,
  updateSceneAssetAction
} from "@/app/(admin)/admin/actions";
import { Button } from "@/components/ui/button";
import {
  StoryEnums,
  getAdminPlayerResponses,
  getAdminStoryGraph
} from "@/lib/story/repository";

function SectionCard(props: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <h2 className="text-lg font-semibold text-slate-900">{props.title}</h2>
      <p className="mt-1 text-sm text-slate-600">{props.description}</p>
      <div className="mt-4 space-y-4">{props.children}</div>
    </section>
  );
}

function Label(props: { htmlFor: string; text: string }) {
  return (
    <label
      className="block text-xs font-medium uppercase tracking-wide text-slate-600"
      htmlFor={props.htmlFor}
    >
      {props.text}
    </label>
  );
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
    />
  );
}

function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
    />
  );
}

function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900"
    />
  );
}

function FormGrid(props: { children: ReactNode }) {
  return <div className="grid gap-3 md:grid-cols-2">{props.children}</div>;
}

export default async function AdminPage() {
  const [story, responses] = await Promise.all([
    getAdminStoryGraph(),
    getAdminPlayerResponses()
  ]);
  const scenes = story.chapters.flatMap((chapter) =>
    chapter.scenes.map((scene) => ({
      id: scene.id,
      label: `${chapter.title} / Scene ${scene.orderIndex}${scene.title ? ` - ${scene.title}` : ""}`
    }))
  );
  const dateFormatter = new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  });

  return (
    <main className="mx-auto w-full max-w-7xl space-y-6 px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-slate-900">
            Admin Authoring
          </h1>
          <p className="mt-2 text-slate-700">
            Manage chapters, scenes, dialogue, characters, and asset references
            for Milestone 3.
          </p>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </div>

      <SectionCard
        title="Create Chapter"
        description="Add a new chapter in story order."
      >
        <form action={createChapterAction} className="space-y-3">
          <FormGrid>
            <div>
              <Label htmlFor="chapter-title" text="Title" />
              <Input id="chapter-title" name="title" required />
            </div>
            <div>
              <Label htmlFor="chapter-slug" text="Slug" />
              <Input id="chapter-slug" name="slug" required />
            </div>
            <div>
              <Label htmlFor="chapter-order" text="Order Index" />
              <Input
                id="chapter-order"
                name="orderIndex"
                required
                type="number"
              />
            </div>
            <label className="mt-6 inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                className="rounded border-slate-300"
                name="isPublished"
                type="checkbox"
              />
              Published
            </label>
          </FormGrid>
          <Button type="submit">Create chapter</Button>
        </form>

        <div className="space-y-3">
          {story.chapters.map((chapter) => (
            <form
              action={updateChapterAction}
              className="rounded-lg border border-slate-200 p-3"
              key={chapter.id}
            >
              <input name="chapterId" type="hidden" value={chapter.id} />
              <FormGrid>
                <div>
                  <Label htmlFor={`chapter-${chapter.id}-title`} text="Title" />
                  <Input
                    id={`chapter-${chapter.id}-title`}
                    name="title"
                    required
                    defaultValue={chapter.title}
                  />
                </div>
                <div>
                  <Label htmlFor={`chapter-${chapter.id}-slug`} text="Slug" />
                  <Input
                    id={`chapter-${chapter.id}-slug`}
                    name="slug"
                    required
                    defaultValue={chapter.slug}
                  />
                </div>
                <div>
                  <Label
                    htmlFor={`chapter-${chapter.id}-order`}
                    text="Order Index"
                  />
                  <Input
                    id={`chapter-${chapter.id}-order`}
                    name="orderIndex"
                    required
                    type="number"
                    defaultValue={chapter.orderIndex}
                  />
                </div>
                <label className="mt-6 inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    className="rounded border-slate-300"
                    name="isPublished"
                    type="checkbox"
                    defaultChecked={chapter.isPublished}
                  />
                  Published
                </label>
              </FormGrid>
              <div className="mt-3 flex gap-2">
                <Button type="submit" variant="outline">
                  Save chapter
                </Button>
              </div>
            </form>
          ))}

          {story.chapters.map((chapter) => (
            <form
              action={deleteChapterAction}
              className="inline"
              key={`${chapter.id}-delete`}
            >
              <input name="chapterId" type="hidden" value={chapter.id} />
              <Button type="submit" variant="destructive">
                Delete {chapter.title}
              </Button>
            </form>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Characters"
        description="Manage character identity and default portrait references."
      >
        <form action={createCharacterAction} className="space-y-3">
          <FormGrid>
            <div>
              <Label htmlFor="character-name" text="Name" />
              <Input id="character-name" name="name" required />
            </div>
            <div>
              <Label htmlFor="character-slug" text="Slug" />
              <Input id="character-slug" name="slug" required />
            </div>
            <div>
              <Label
                htmlFor="character-portrait"
                text="Default portrait path"
              />
              <Input id="character-portrait" name="defaultPortraitPath" />
            </div>
            <div>
              <Label htmlFor="character-bio" text="Bio" />
              <TextArea id="character-bio" name="bio" rows={2} />
            </div>
          </FormGrid>
          <div>
            <Label htmlFor="character-notes" text="Notes" />
            <TextArea id="character-notes" name="notes" rows={2} />
          </div>
          <Button type="submit">Create character</Button>
        </form>

        {story.characters.map((character) => (
          <form
            action={updateCharacterAction}
            className="rounded-lg border border-slate-200 p-3"
            key={character.id}
          >
            <input name="characterId" type="hidden" value={character.id} />
            <FormGrid>
              <div>
                <Label htmlFor={`character-${character.id}-name`} text="Name" />
                <Input
                  id={`character-${character.id}-name`}
                  name="name"
                  required
                  defaultValue={character.name}
                />
              </div>
              <div>
                <Label htmlFor={`character-${character.id}-slug`} text="Slug" />
                <Input
                  id={`character-${character.id}-slug`}
                  name="slug"
                  required
                  defaultValue={character.slug}
                />
              </div>
              <div>
                <Label
                  htmlFor={`character-${character.id}-portrait`}
                  text="Default portrait path"
                />
                <Input
                  id={`character-${character.id}-portrait`}
                  name="defaultPortraitPath"
                  defaultValue={character.defaultPortraitPath ?? ""}
                />
              </div>
              <div>
                <Label htmlFor={`character-${character.id}-bio`} text="Bio" />
                <TextArea
                  id={`character-${character.id}-bio`}
                  name="bio"
                  rows={2}
                  defaultValue={character.bio ?? ""}
                />
              </div>
            </FormGrid>
            <div className="mt-3">
              <Label htmlFor={`character-${character.id}-notes`} text="Notes" />
              <TextArea
                id={`character-${character.id}-notes`}
                name="notes"
                rows={2}
                defaultValue={character.notes ?? ""}
              />
            </div>
            <div className="mt-3 flex gap-2">
              <Button type="submit" variant="outline">
                Save character
              </Button>
            </div>
          </form>
        ))}

        <div className="flex flex-wrap gap-2">
          {story.characters.map((character) => (
            <form action={deleteCharacterAction} key={`${character.id}-delete`}>
              <input name="characterId" type="hidden" value={character.id} />
              <Button type="submit" variant="destructive">
                Delete {character.name}
              </Button>
            </form>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Scenes"
        description="Create and update ordered scenes inside chapters."
      >
        <form action={createSceneAction} className="space-y-3">
          <FormGrid>
            <div>
              <Label htmlFor="scene-chapter" text="Chapter" />
              <Select
                id="scene-chapter"
                name="chapterId"
                required
                defaultValue=""
              >
                <option disabled value="">
                  Select chapter
                </option>
                {story.chapters.map((chapter) => (
                  <option key={chapter.id} value={chapter.id}>
                    {chapter.title}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="scene-title" text="Scene title" />
              <Input id="scene-title" name="title" />
            </div>
            <div>
              <Label htmlFor="scene-order" text="Order Index" />
              <Input
                id="scene-order"
                name="orderIndex"
                required
                type="number"
              />
            </div>
            <div>
              <Label htmlFor="scene-bg" text="Background image path" />
              <Input id="scene-bg" name="backgroundImagePath" />
            </div>
          </FormGrid>
          <div>
            <Label htmlFor="scene-music" text="Background music path" />
            <Input id="scene-music" name="backgroundMusicPath" />
          </div>
          <Button type="submit">Create scene</Button>
        </form>

        {story.chapters.map((chapter) => (
          <div className="space-y-3" key={chapter.id}>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              {chapter.title}
            </h3>
            {chapter.scenes.map((scene) => (
              <form
                action={updateSceneAction}
                className="rounded-lg border border-slate-200 p-3"
                key={scene.id}
              >
                <input name="sceneId" type="hidden" value={scene.id} />
                <FormGrid>
                  <div>
                    <Label
                      htmlFor={`scene-${scene.id}-chapter`}
                      text="Chapter"
                    />
                    <Select
                      id={`scene-${scene.id}-chapter`}
                      name="chapterId"
                      defaultValue={scene.chapterId}
                      required
                    >
                      {story.chapters.map((chapterOption) => (
                        <option key={chapterOption.id} value={chapterOption.id}>
                          {chapterOption.title}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label
                      htmlFor={`scene-${scene.id}-title`}
                      text="Scene title"
                    />
                    <Input
                      id={`scene-${scene.id}-title`}
                      name="title"
                      defaultValue={scene.title ?? ""}
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor={`scene-${scene.id}-order`}
                      text="Order Index"
                    />
                    <Input
                      id={`scene-${scene.id}-order`}
                      name="orderIndex"
                      type="number"
                      required
                      defaultValue={scene.orderIndex}
                    />
                  </div>
                  <div>
                    <Label
                      htmlFor={`scene-${scene.id}-bg`}
                      text="Background image path"
                    />
                    <Input
                      id={`scene-${scene.id}-bg`}
                      name="backgroundImagePath"
                      defaultValue={scene.backgroundImagePath ?? ""}
                    />
                  </div>
                </FormGrid>
                <div className="mt-3">
                  <Label
                    htmlFor={`scene-${scene.id}-music`}
                    text="Background music path"
                  />
                  <Input
                    id={`scene-${scene.id}-music`}
                    name="backgroundMusicPath"
                    defaultValue={scene.backgroundMusicPath ?? ""}
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  <Button type="submit" variant="outline">
                    Save scene
                  </Button>
                </div>
              </form>
            ))}
          </div>
        ))}

        <div className="flex flex-wrap gap-2">
          {scenes.map((scene) => (
            <form action={deleteSceneAction} key={`${scene.id}-delete`}>
              <input name="sceneId" type="hidden" value={scene.id} />
              <Button type="submit" variant="destructive">
                Delete {scene.label}
              </Button>
            </form>
          ))}
        </div>
      </SectionCard>

      <SectionCard
        title="Dialogue Entries"
        description="Author ordered narrator/character/prompt entries per scene."
      >
        <form action={createDialogueEntryAction} className="space-y-3">
          <FormGrid>
            <div>
              <Label htmlFor="dialogue-scene" text="Scene" />
              <Select
                id="dialogue-scene"
                name="sceneId"
                required
                defaultValue=""
              >
                <option disabled value="">
                  Select scene
                </option>
                {scenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    {scene.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="dialogue-kind" text="Kind" />
              <Select
                id="dialogue-kind"
                name="kind"
                required
                defaultValue={StoryEnums.dialogueKinds[0]}
              >
                {StoryEnums.dialogueKinds.map((kind) => (
                  <option key={kind} value={kind}>
                    {kind}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="dialogue-order" text="Order Index" />
              <Input
                id="dialogue-order"
                name="orderIndex"
                type="number"
                required
              />
            </div>
            <div>
              <Label htmlFor="dialogue-character" text="Character (optional)" />
              <Select
                id="dialogue-character"
                name="characterId"
                defaultValue=""
              >
                <option value="">None</option>
                {story.characters.map((character) => (
                  <option key={character.id} value={character.id}>
                    {character.name}
                  </option>
                ))}
              </Select>
            </div>
          </FormGrid>
          <div>
            <Label htmlFor="dialogue-text" text="Text" />
            <TextArea id="dialogue-text" name="text" rows={3} required />
          </div>
          <div>
            <Label
              htmlFor="dialogue-prompt-label"
              text="Prompt label (player prompt only)"
            />
            <Input id="dialogue-prompt-label" name="promptLabel" />
          </div>
          <Button type="submit">Create dialogue entry</Button>
        </form>

        {story.chapters.flatMap((chapter) =>
          chapter.scenes.map((scene) => (
            <div className="space-y-3" key={`${scene.id}-dialogues`}>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                {chapter.title} / Scene {scene.orderIndex}
              </h3>
              {scene.dialogueEntries.map((entry) => (
                <form
                  action={updateDialogueEntryAction}
                  className="rounded-lg border border-slate-200 p-3"
                  key={entry.id}
                >
                  <input
                    name="dialogueEntryId"
                    type="hidden"
                    value={entry.id}
                  />
                  <FormGrid>
                    <div>
                      <Label
                        htmlFor={`dialogue-${entry.id}-scene`}
                        text="Scene"
                      />
                      <Select
                        id={`dialogue-${entry.id}-scene`}
                        name="sceneId"
                        defaultValue={scene.id}
                        required
                      >
                        {scenes.map((sceneOption) => (
                          <option key={sceneOption.id} value={sceneOption.id}>
                            {sceneOption.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label
                        htmlFor={`dialogue-${entry.id}-kind`}
                        text="Kind"
                      />
                      <Select
                        id={`dialogue-${entry.id}-kind`}
                        name="kind"
                        defaultValue={entry.kind}
                        required
                      >
                        {StoryEnums.dialogueKinds.map((kind) => (
                          <option key={kind} value={kind}>
                            {kind}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label
                        htmlFor={`dialogue-${entry.id}-order`}
                        text="Order Index"
                      />
                      <Input
                        id={`dialogue-${entry.id}-order`}
                        name="orderIndex"
                        type="number"
                        required
                        defaultValue={entry.orderIndex}
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor={`dialogue-${entry.id}-character`}
                        text="Character (optional)"
                      />
                      <Select
                        id={`dialogue-${entry.id}-character`}
                        name="characterId"
                        defaultValue={entry.characterId ?? ""}
                      >
                        <option value="">None</option>
                        {story.characters.map((character) => (
                          <option key={character.id} value={character.id}>
                            {character.name}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </FormGrid>
                  <div className="mt-3">
                    <Label htmlFor={`dialogue-${entry.id}-text`} text="Text" />
                    <TextArea
                      id={`dialogue-${entry.id}-text`}
                      name="text"
                      rows={3}
                      required
                      defaultValue={entry.text}
                    />
                  </div>
                  <div className="mt-3">
                    <Label
                      htmlFor={`dialogue-${entry.id}-prompt`}
                      text="Prompt label"
                    />
                    <Input
                      id={`dialogue-${entry.id}-prompt`}
                      name="promptLabel"
                      defaultValue={entry.promptLabel ?? ""}
                    />
                  </div>
                  <div className="mt-3 flex gap-2">
                    <Button type="submit" variant="outline">
                      Save dialogue
                    </Button>
                  </div>
                </form>
              ))}
            </div>
          ))
        )}

        <div className="flex flex-wrap gap-2">
          {story.chapters.flatMap((chapter) =>
            chapter.scenes.flatMap((scene) =>
              scene.dialogueEntries.map((entry) => (
                <form
                  action={deleteDialogueEntryAction}
                  key={`${entry.id}-delete`}
                >
                  <input
                    name="dialogueEntryId"
                    type="hidden"
                    value={entry.id}
                  />
                  <Button type="submit" variant="destructive">
                    Delete entry {entry.orderIndex} (
                    {scene.title ?? `Scene ${scene.orderIndex}`})
                  </Button>
                </form>
              ))
            )
          )}
        </div>
      </SectionCard>

      <SectionCard
        title="Player Responses"
        description="Review free-text responses submitted during player prompt moments."
      >
        {responses.length === 0 ? (
          <p className="text-sm text-slate-600">No player responses submitted yet.</p>
        ) : (
          <div className="space-y-3">
            {responses.map((response) => (
              <article
                className="rounded-lg border border-slate-200 bg-slate-50 p-4"
                key={response.id}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-900">
                    {response.user.email}
                  </p>
                  <p className="text-xs text-slate-500">
                    {dateFormatter.format(response.createdAt)}
                  </p>
                </div>
                <p className="mt-2 text-xs uppercase tracking-wide text-slate-500">
                  Chapter {response.chapter.orderIndex}: {response.chapter.title} /
                  {" "}Scene {response.scene.orderIndex}
                  {response.scene.title ? ` - ${response.scene.title}` : ""}
                </p>
                <p className="mt-2 text-sm font-medium text-slate-700">
                  {response.dialogueEntry.promptLabel ?? "Player prompt"}
                </p>
                <p className="mt-1 text-sm text-slate-600">
                  {response.dialogueEntry.text}
                </p>
                <p className="mt-3 rounded-md border border-slate-200 bg-white p-3 text-sm text-slate-900">
                  {response.responseText}
                </p>
              </article>
            ))}
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Scene Assets"
        description="Attach metadata asset references to scenes."
      >
        <form action={createSceneAssetAction} className="space-y-3">
          <FormGrid>
            <div>
              <Label htmlFor="asset-scene" text="Scene" />
              <Select id="asset-scene" name="sceneId" required defaultValue="">
                <option disabled value="">
                  Select scene
                </option>
                {scenes.map((scene) => (
                  <option key={scene.id} value={scene.id}>
                    {scene.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="asset-type" text="Type" />
              <Select
                id="asset-type"
                name="type"
                required
                defaultValue={StoryEnums.assetTypes[0]}
              >
                {StoryEnums.assetTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <Label htmlFor="asset-storage" text="Storage path" />
              <Input id="asset-storage" name="storagePath" required />
            </div>
            <div>
              <Label htmlFor="asset-alt" text="Alt text" />
              <Input id="asset-alt" name="altText" />
            </div>
          </FormGrid>
          <div>
            <Label htmlFor="asset-label" text="Label" />
            <Input id="asset-label" name="label" />
          </div>
          <Button type="submit">Create scene asset</Button>
        </form>

        {story.chapters.flatMap((chapter) =>
          chapter.scenes.map((scene) =>
            scene.assets.map((asset) => (
              <form
                action={updateSceneAssetAction}
                className="rounded-lg border border-slate-200 p-3"
                key={asset.id}
              >
                <input name="sceneAssetId" type="hidden" value={asset.id} />
                <FormGrid>
                  <div>
                    <Label htmlFor={`asset-${asset.id}-scene`} text="Scene" />
                    <Select
                      id={`asset-${asset.id}-scene`}
                      name="sceneId"
                      defaultValue={scene.id}
                      required
                    >
                      {scenes.map((sceneOption) => (
                        <option key={sceneOption.id} value={sceneOption.id}>
                          {sceneOption.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor={`asset-${asset.id}-type`} text="Type" />
                    <Select
                      id={`asset-${asset.id}-type`}
                      name="type"
                      defaultValue={asset.type}
                      required
                    >
                      {StoryEnums.assetTypes.map((type) => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label
                      htmlFor={`asset-${asset.id}-path`}
                      text="Storage path"
                    />
                    <Input
                      id={`asset-${asset.id}-path`}
                      name="storagePath"
                      required
                      defaultValue={asset.storagePath}
                    />
                  </div>
                  <div>
                    <Label htmlFor={`asset-${asset.id}-alt`} text="Alt text" />
                    <Input
                      id={`asset-${asset.id}-alt`}
                      name="altText"
                      defaultValue={asset.altText ?? ""}
                    />
                  </div>
                </FormGrid>
                <div className="mt-3">
                  <Label htmlFor={`asset-${asset.id}-label`} text="Label" />
                  <Input
                    id={`asset-${asset.id}-label`}
                    name="label"
                    defaultValue={asset.label ?? ""}
                  />
                </div>
                <div className="mt-3 flex gap-2">
                  <Button type="submit" variant="outline">
                    Save scene asset
                  </Button>
                </div>
              </form>
            ))
          )
        )}

        <div className="flex flex-wrap gap-2">
          {story.chapters.flatMap((chapter) =>
            chapter.scenes.flatMap((scene) =>
              scene.assets.map((asset) => (
                <form
                  action={deleteSceneAssetAction}
                  key={`${asset.id}-delete`}
                >
                  <input name="sceneAssetId" type="hidden" value={asset.id} />
                  <Button type="submit" variant="destructive">
                    Delete asset {asset.type} (
                    {scene.title ?? `Scene ${scene.orderIndex}`})
                  </Button>
                </form>
              ))
            )
          )}
        </div>
      </SectionCard>
    </main>
  );
}
