import Link from "next/link";
import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes
} from "react";

import { signOutAction } from "@/app/actions/auth";
import {
  publishStoryAction,
  rollbackPublishedStoryVersionAction,
  createChapterAction,
  createCharacterAction,
  createCharacterPortraitAction,
  createDialogueEntryAction,
  createHouseAction,
  createMediaAssetAction,
  createSceneAction,
  deleteChapterAction,
  deleteCharacterAction,
  deleteCharacterPortraitAction,
  deleteDialogueEntryAction,
  deleteHouseAction,
  deleteMediaAssetAction,
  deleteSceneAction,
  deleteSceneCharacterAppearanceAction,
  updateChapterAction,
  updateCharacterAction,
  updateCharacterPortraitAction,
  updateDialogueEntryAction,
  updateHouseAction,
  updateMediaAssetAction,
  updateSceneAction,
  upsertSceneCharacterAppearanceAction
} from "@/app/(admin)/admin/actions";
import { Button } from "@/components/ui/button";
import {
  PUBLISHED_RUNTIME_SCHEMA_UNAVAILABLE_MESSAGE,
  StoryRepositoryError,
  StoryEnums,
  getAdminPlayerResponses,
  getAdminStoryGraph,
  hasPublishedRuntimeSchema,
  getPublishedStoryVersions
} from "@/lib/story/repository";
import { validateStoryForPublish } from "@/lib/story/published";

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

function TabLink(props: {
  tab: "chapters" | "characters" | "scene-assets";
  activeTab: string;
  children: ReactNode;
}) {
  const active = props.activeTab === props.tab;

  return (
    <Link
      className={[
        "rounded-md px-3 py-2 text-sm font-medium",
        active
          ? "bg-slate-900 text-white"
          : "border border-slate-300 bg-white text-slate-700"
      ].join(" ")}
      href={`/admin?tab=${props.tab}`}
    >
      {props.children}
    </Link>
  );
}

type AdminPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(
  value: string | string[] | undefined,
  fallback = ""
): string {
  if (Array.isArray(value)) {
    return value[0] ?? fallback;
  }

  return value ?? fallback;
}

export default async function AdminPage({ searchParams }: AdminPageProps) {
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const story = await getAdminStoryGraph();
  const [responsesResult, publishedVersionsResult, publishedRuntimeSchemaReady] =
    await Promise.all([
      getAdminPlayerResponses().then(
        (responses) => ({ responses, error: null as StoryRepositoryError | null })
      ).catch((error: unknown) => {
        if (
          error instanceof StoryRepositoryError &&
          error.message === PUBLISHED_RUNTIME_SCHEMA_UNAVAILABLE_MESSAGE
        ) {
          return {
            responses: [],
            error
          };
        }

        throw error;
      }),
      getPublishedStoryVersions().then(
        (publishedVersions) =>
          ({
            publishedVersions,
            error: null as StoryRepositoryError | null
          })
      ).catch((error: unknown) => {
        if (
          error instanceof StoryRepositoryError &&
          error.message === PUBLISHED_RUNTIME_SCHEMA_UNAVAILABLE_MESSAGE
        ) {
          return {
            publishedVersions: [],
            error
          };
        }

        throw error;
      }),
      hasPublishedRuntimeSchema()
    ]);
  const responses = responsesResult.responses;
  const publishedVersions = publishedVersionsResult.publishedVersions;
  const publishedRuntimeSchemaWarning =
    !publishedRuntimeSchemaReady ||
    responsesResult.error?.message ===
      PUBLISHED_RUNTIME_SCHEMA_UNAVAILABLE_MESSAGE ||
    publishedVersionsResult.error?.message ===
      PUBLISHED_RUNTIME_SCHEMA_UNAVAILABLE_MESSAGE
      ? PUBLISHED_RUNTIME_SCHEMA_UNAVAILABLE_MESSAGE
      : null;

  const activeTab = getParam(resolvedSearchParams.tab, "chapters");
  const publishStatus = getParam(resolvedSearchParams.publishStatus);
  const publishMessage = getParam(resolvedSearchParams.publishMessage);
  const selectedChapterId = getParam(
    resolvedSearchParams.chapterId,
    story.chapters[0]?.id ?? ""
  );
  const selectedChapter =
    story.chapters.find((chapter) => chapter.id === selectedChapterId) ??
    story.chapters[0] ??
    null;
  const selectedSceneId = getParam(
    resolvedSearchParams.sceneId,
    selectedChapter?.scenes[0]?.id ?? ""
  );
  const selectedScene =
    selectedChapter?.scenes.find((scene) => scene.id === selectedSceneId) ??
    selectedChapter?.scenes[0] ??
    null;

  const sceneLabelMap = new Map(
    story.chapters.flatMap((chapter) =>
      chapter.scenes.map((scene) => [
        scene.id,
        `${chapter.title} / Scene ${scene.orderIndex}${scene.title ? ` - ${scene.title}` : ""}`
      ])
    )
  );

  const chapterImageAssets = story.mediaAssets.filter(
    (asset) => asset.type === "background_image"
  );
  const musicAssets = story.mediaAssets.filter(
    (asset) => asset.type === "background_music"
  );
  const publishValidation = validateStoryForPublish(story);
  const activePublishedVersion =
    publishedVersions.find((version) => version.isActive) ?? null;

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
            Manage chapters, scenes, dialogue, houses, characters, portraits,
            and reusable scene assets.
          </p>
        </div>
        <form action={signOutAction}>
          <Button type="submit" variant="outline">
            Sign out
          </Button>
        </form>
      </div>

      <div className="flex flex-wrap gap-2">
        <TabLink activeTab={activeTab} tab="chapters">
          Chapters
        </TabLink>
        <TabLink activeTab={activeTab} tab="characters">
          Characters
        </TabLink>
        <TabLink activeTab={activeTab} tab="scene-assets">
          Scene Assets
        </TabLink>
      </div>

      {activeTab === "chapters" ? (
        <>
          <SectionCard
            title="Create Chapter"
            description="Chapters are ordered automatically by creation time."
          >
            <form action={createChapterAction} className="space-y-3">
              <FormGrid>
                <div>
                  <Label htmlFor="chapter-title" text="Title" />
                  <Input id="chapter-title" name="title" required />
                </div>
                <div>
                  <Label htmlFor="chapter-image" text="Chapter image asset" />
                  <Select
                    id="chapter-image"
                    name="imageAssetId"
                    required
                    defaultValue=""
                  >
                    <option disabled value="">
                      Select image asset
                    </option>
                    {chapterImageAssets.map((asset) => (
                      <option key={asset.id} value={asset.id}>
                        {asset.label ?? asset.storagePath}
                      </option>
                    ))}
                  </Select>
                </div>
              </FormGrid>
              <Button type="submit">Create chapter</Button>
            </form>
          </SectionCard>

          <SectionCard
            title="Published Runtime"
            description="Compile authored story data into immutable runtime bundles for the player."
          >
            {publishedRuntimeSchemaWarning ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                {publishedRuntimeSchemaWarning}
              </p>
            ) : null}
            {publishStatus === "success" ? (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Published a new runtime version successfully.
              </p>
            ) : null}
            {publishStatus === "rollback-success" ? (
              <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Rolled back to the selected published version.
              </p>
            ) : null}
            {publishStatus === "error" ? (
              <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                {publishMessage || "Unable to complete the publish action."}
              </p>
            ) : null}

            <div className="grid gap-4 md:grid-cols-2">
              <div className="rounded-lg border border-slate-200 p-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Publish validation
                </h3>
                {publishValidation.ok ? (
                  <p className="mt-2 text-sm text-emerald-700">
                    Ready to publish. Runtime bundles will be generated from the current authoring data.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    <p className="text-sm text-rose-700">
                      Resolve these issues before publishing:
                    </p>
                    <ul className="list-disc space-y-1 pl-5 text-sm text-slate-700">
                      {publishValidation.errors.map((error) => (
                        <li key={error}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <form action={publishStoryAction} className="mt-4">
                  <Button
                    disabled={
                      !publishValidation.ok || Boolean(publishedRuntimeSchemaWarning)
                    }
                    type="submit"
                  >
                    Publish runtime version
                  </Button>
                </form>
              </div>

              <div className="rounded-lg border border-slate-200 p-3">
                <h3 className="text-sm font-semibold text-slate-900">
                  Active published version
                </h3>
                {activePublishedVersion ? (
                  <div className="mt-2 space-y-1 text-sm text-slate-700">
                    <p>Version {activePublishedVersion.version}</p>
                    <p>
                      Activated{" "}
                      {dateFormatter.format(
                        activePublishedVersion.activatedAt ??
                          activePublishedVersion.createdAt
                      )}
                    </p>
                    <p className="truncate">
                      Manifest: {activePublishedVersion.manifestStoragePath}
                    </p>
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-600">
                    No published runtime version is active yet.
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-slate-900">
                Publish history
              </h3>
              {publishedVersions.length === 0 ? (
                <p className="text-sm text-slate-600">
                  No published versions available.
                </p>
              ) : (
                publishedVersions.map((version) => (
                  <article
                    className="rounded-lg border border-slate-200 p-3"
                    key={version.id}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="space-y-1 text-sm text-slate-700">
                        <p className="font-medium text-slate-900">
                          Version {version.version}
                          {version.isActive ? " (active)" : ""}
                        </p>
                        <p>
                          Created {dateFormatter.format(version.createdAt)}
                        </p>
                        <p className="truncate">
                          Manifest: {version.manifestStoragePath}
                        </p>
                      </div>
                      {!version.isActive ? (
                        <form action={rollbackPublishedStoryVersionAction}>
                          <input
                            name="publishedVersionId"
                            type="hidden"
                            value={version.id}
                          />
                          <Button type="submit" variant="outline">
                            Roll back
                          </Button>
                        </form>
                      ) : null}
                    </div>
                  </article>
                ))
              )}
            </div>
          </SectionCard>

          <SectionCard
            title="Chapter Cards"
            description="Oldest chapters are on the left."
          >
            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-max gap-3">
                {story.chapters.map((chapter) => (
                  <Link
                    className={[
                      "w-64 rounded-lg border p-3",
                      selectedChapter?.id === chapter.id
                        ? "border-slate-900 bg-slate-100"
                        : "border-slate-300 bg-white"
                    ].join(" ")}
                    href={`/admin?tab=chapters&chapterId=${chapter.id}`}
                    key={chapter.id}
                  >
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Chapter {chapter.orderIndex}
                    </p>
                    <p className="mt-1 font-semibold text-slate-900">{chapter.title}</p>
                    <p className="mt-2 truncate text-xs text-slate-600">
                      {chapter.imageAsset.label ?? chapter.imageAsset.storagePath}
                    </p>
                  </Link>
                ))}
              </div>
            </div>

            {selectedChapter ? (
              <div className="space-y-3">
                <form
                  action={updateChapterAction}
                  className="rounded-lg border border-slate-200 p-3"
                >
                  <input name="chapterId" type="hidden" value={selectedChapter.id} />
                  <FormGrid>
                    <div>
                      <Label
                        htmlFor={`chapter-${selectedChapter.id}-title`}
                        text="Title"
                      />
                      <Input
                        defaultValue={selectedChapter.title}
                        id={`chapter-${selectedChapter.id}-title`}
                        name="title"
                        required
                      />
                    </div>
                    <div>
                      <Label
                        htmlFor={`chapter-${selectedChapter.id}-image`}
                        text="Chapter image asset"
                      />
                      <Select
                        defaultValue={selectedChapter.imageAssetId}
                        id={`chapter-${selectedChapter.id}-image`}
                        name="imageAssetId"
                        required
                      >
                        {chapterImageAssets.map((asset) => (
                          <option key={asset.id} value={asset.id}>
                            {asset.label ?? asset.storagePath}
                          </option>
                        ))}
                      </Select>
                    </div>
                  </FormGrid>
                  <div className="mt-3 flex gap-2">
                    <Button type="submit" variant="outline">
                      Save chapter
                    </Button>
                  </div>
                </form>

                <form action={deleteChapterAction}>
                  <input name="chapterId" type="hidden" value={selectedChapter.id} />
                  <Button type="submit" variant="destructive">
                    Delete chapter
                  </Button>
                </form>
              </div>
            ) : null}
          </SectionCard>

          {selectedChapter ? (
            <SectionCard
              title="Scenes"
              description="Create and maintain ordered scene cards for the selected chapter."
            >
              <form action={createSceneAction} className="space-y-3">
                <input name="chapterId" type="hidden" value={selectedChapter.id} />
                <FormGrid>
                  <div>
                    <Label htmlFor="scene-title" text="Scene title" />
                    <Input id="scene-title" name="title" />
                  </div>
                  <div>
                    <Label htmlFor="scene-order" text="Order index" />
                    <Input id="scene-order" name="orderIndex" required type="number" />
                  </div>
                  <div>
                    <Label
                      htmlFor="scene-background-image"
                      text="Background image asset"
                    />
                    <Select
                      defaultValue=""
                      id="scene-background-image"
                      name="backgroundImageAssetId"
                      required
                    >
                      <option disabled value="">
                        Select image asset
                      </option>
                      {chapterImageAssets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.label ?? asset.storagePath}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div>
                    <Label
                      htmlFor="scene-background-music"
                      text="Background music asset (optional)"
                    />
                    <Select
                      defaultValue=""
                      id="scene-background-music"
                      name="backgroundMusicAssetId"
                    >
                      <option value="">None</option>
                      {musicAssets.map((asset) => (
                        <option key={asset.id} value={asset.id}>
                          {asset.label ?? asset.storagePath}
                        </option>
                      ))}
                    </Select>
                  </div>
                </FormGrid>
                <Button type="submit">Create scene</Button>
              </form>

              <div className="grid gap-3 md:grid-cols-2">
                {selectedChapter.scenes.map((scene) => (
                  <Link
                    className={[
                      "rounded-lg border p-3",
                      selectedScene?.id === scene.id
                        ? "border-slate-900 bg-slate-100"
                        : "border-slate-300 bg-white"
                    ].join(" ")}
                    href={`/admin?tab=chapters&chapterId=${selectedChapter.id}&sceneId=${scene.id}`}
                    key={scene.id}
                  >
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      Scene {scene.orderIndex}
                    </p>
                    <p className="mt-1 font-semibold text-slate-900">
                      {scene.title ?? "Untitled scene"}
                    </p>
                    <p className="mt-2 truncate text-xs text-slate-600">
                      BG: {scene.backgroundImageAsset.label ?? scene.backgroundImageAsset.storagePath}
                    </p>
                  </Link>
                ))}
              </div>

              {selectedScene ? (
                <div className="space-y-3 rounded-lg border border-slate-200 p-3">
                  <form action={updateSceneAction} className="space-y-3">
                    <input name="sceneId" type="hidden" value={selectedScene.id} />
                    <input
                      name="chapterId"
                      type="hidden"
                      value={selectedChapter.id}
                    />
                    <FormGrid>
                      <div>
                        <Label
                          htmlFor={`scene-${selectedScene.id}-title`}
                          text="Scene title"
                        />
                        <Input
                          defaultValue={selectedScene.title ?? ""}
                          id={`scene-${selectedScene.id}-title`}
                          name="title"
                        />
                      </div>
                      <div>
                        <Label
                          htmlFor={`scene-${selectedScene.id}-order`}
                          text="Order index"
                        />
                        <Input
                          defaultValue={selectedScene.orderIndex}
                          id={`scene-${selectedScene.id}-order`}
                          name="orderIndex"
                          required
                          type="number"
                        />
                      </div>
                      <div>
                        <Label
                          htmlFor={`scene-${selectedScene.id}-bg-image`}
                          text="Background image asset"
                        />
                        <Select
                          defaultValue={selectedScene.backgroundImageAssetId}
                          id={`scene-${selectedScene.id}-bg-image`}
                          name="backgroundImageAssetId"
                          required
                        >
                          {chapterImageAssets.map((asset) => (
                            <option key={asset.id} value={asset.id}>
                              {asset.label ?? asset.storagePath}
                            </option>
                          ))}
                        </Select>
                      </div>
                      <div>
                        <Label
                          htmlFor={`scene-${selectedScene.id}-bg-music`}
                          text="Background music asset"
                        />
                        <Select
                          defaultValue={selectedScene.backgroundMusicAssetId ?? ""}
                          id={`scene-${selectedScene.id}-bg-music`}
                          name="backgroundMusicAssetId"
                        >
                          <option value="">None</option>
                          {musicAssets.map((asset) => (
                            <option key={asset.id} value={asset.id}>
                              {asset.label ?? asset.storagePath}
                            </option>
                          ))}
                        </Select>
                      </div>
                    </FormGrid>
                    <div className="flex gap-2">
                      <Button type="submit" variant="outline">
                        Save scene
                      </Button>
                    </div>
                  </form>

                  <form action={deleteSceneAction}>
                    <input name="sceneId" type="hidden" value={selectedScene.id} />
                    <Button type="submit" variant="destructive">
                      Delete scene
                    </Button>
                  </form>
                </div>
              ) : null}
            </SectionCard>
          ) : null}

          {selectedScene ? (
            <SectionCard
              title="Dialogue Timeline"
              description="Author linear dialogue entries for the selected scene."
            >
              <form action={createDialogueEntryAction} className="space-y-3">
                <input name="sceneId" type="hidden" value={selectedScene.id} />
                <FormGrid>
                  <div>
                    <Label htmlFor="dialogue-kind" text="Kind" />
                    <Select
                      defaultValue={StoryEnums.dialogueKinds[0]}
                      id="dialogue-kind"
                      name="kind"
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
                    <Label htmlFor="dialogue-order" text="Order index" />
                    <Input
                      id="dialogue-order"
                      name="orderIndex"
                      required
                      type="number"
                    />
                  </div>
                  <div>
                    <Label htmlFor="dialogue-character" text="Character (optional)" />
                    <Select defaultValue="" id="dialogue-character" name="characterId">
                      <option value="">None</option>
                      {story.houses.flatMap((house) =>
                        house.characters.map((character) => (
                          <option key={character.id} value={character.id}>
                            {house.name} / {character.name}
                          </option>
                        ))
                      )}
                    </Select>
                  </div>
                  <div>
                    <Label
                      htmlFor="dialogue-prompt-label"
                      text="Prompt label (prompt kind only)"
                    />
                    <Input id="dialogue-prompt-label" name="promptLabel" />
                  </div>
                </FormGrid>
                <div>
                  <Label htmlFor="dialogue-text" text="Text" />
                  <TextArea id="dialogue-text" name="text" required rows={3} />
                </div>
                <Button type="submit">Create dialogue entry</Button>
              </form>

              <div className="space-y-3">
                {selectedScene.dialogueEntries.map((entry) => (
                  <form
                    action={updateDialogueEntryAction}
                    className="rounded-lg border border-slate-200 p-3"
                    key={entry.id}
                  >
                    <input name="dialogueEntryId" type="hidden" value={entry.id} />
                    <input name="sceneId" type="hidden" value={selectedScene.id} />
                    <FormGrid>
                      <div>
                        <Label htmlFor={`dialogue-${entry.id}-kind`} text="Kind" />
                        <Select
                          defaultValue={entry.kind}
                          id={`dialogue-${entry.id}-kind`}
                          name="kind"
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
                          text="Order index"
                        />
                        <Input
                          defaultValue={entry.orderIndex}
                          id={`dialogue-${entry.id}-order`}
                          name="orderIndex"
                          required
                          type="number"
                        />
                      </div>
                      <div>
                        <Label
                          htmlFor={`dialogue-${entry.id}-character`}
                          text="Character (optional)"
                        />
                        <Select
                          defaultValue={entry.characterId ?? ""}
                          id={`dialogue-${entry.id}-character`}
                          name="characterId"
                        >
                          <option value="">None</option>
                          {story.houses.flatMap((house) =>
                            house.characters.map((character) => (
                              <option key={character.id} value={character.id}>
                                {house.name} / {character.name}
                              </option>
                            ))
                          )}
                        </Select>
                      </div>
                      <div>
                        <Label
                          htmlFor={`dialogue-${entry.id}-prompt-label`}
                          text="Prompt label"
                        />
                        <Input
                          defaultValue={entry.promptLabel ?? ""}
                          id={`dialogue-${entry.id}-prompt-label`}
                          name="promptLabel"
                        />
                      </div>
                    </FormGrid>
                    <div className="mt-3">
                      <Label htmlFor={`dialogue-${entry.id}-text`} text="Text" />
                      <TextArea
                        defaultValue={entry.text}
                        id={`dialogue-${entry.id}-text`}
                        name="text"
                        required
                        rows={3}
                      />
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button type="submit" variant="outline">
                        Save entry
                      </Button>
                    </div>
                  </form>
                ))}
              </div>

              <div className="flex flex-wrap gap-2">
                {selectedScene.dialogueEntries.map((entry) => (
                  <form action={deleteDialogueEntryAction} key={`${entry.id}-delete`}>
                    <input name="dialogueEntryId" type="hidden" value={entry.id} />
                    <Button type="submit" variant="destructive">
                      Delete entry #{entry.orderIndex}
                    </Button>
                  </form>
                ))}
              </div>
            </SectionCard>
          ) : null}

          {selectedScene ? (
            <SectionCard
              title="Scene Character Appearances"
              description="Choose portrait variant per character for this scene."
            >
              <form action={upsertSceneCharacterAppearanceAction} className="space-y-3">
                <input name="sceneId" type="hidden" value={selectedScene.id} />
                <FormGrid>
                  <div>
                    <Label htmlFor="appearance-character" text="Character" />
                    <Select
                      defaultValue=""
                      id="appearance-character"
                      name="characterId"
                      required
                    >
                      <option disabled value="">
                        Select character
                      </option>
                      {story.houses.flatMap((house) =>
                        house.characters.map((character) => (
                          <option key={character.id} value={character.id}>
                            {house.name} / {character.name}
                          </option>
                        ))
                      )}
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="appearance-portrait" text="Portrait (optional)" />
                    <Select defaultValue="" id="appearance-portrait" name="portraitId">
                      <option value="">Use character default portrait</option>
                      {story.houses.flatMap((house) =>
                        house.characters.flatMap((character) =>
                          character.portraits.map((portrait) => (
                            <option key={portrait.id} value={portrait.id}>
                              {character.name} / {portrait.label ?? portrait.storagePath}
                            </option>
                          ))
                        )
                      )}
                    </Select>
                  </div>
                </FormGrid>
                <Button type="submit">Save appearance</Button>
              </form>

              <div className="space-y-2">
                {selectedScene.characterAppearances.map((appearance) => (
                  <div
                    className="flex items-center justify-between rounded-md border border-slate-200 p-3"
                    key={`${appearance.sceneId}-${appearance.characterId}`}
                  >
                    <p className="text-sm text-slate-700">
                      {appearance.character.name}: {appearance.portrait?.label ?? appearance.portrait?.storagePath ?? "Default portrait"}
                    </p>
                    <form action={deleteSceneCharacterAppearanceAction}>
                      <input name="sceneId" type="hidden" value={selectedScene.id} />
                      <input
                        name="characterId"
                        type="hidden"
                        value={appearance.characterId}
                      />
                      <Button size="sm" type="submit" variant="destructive">
                        Delete
                      </Button>
                    </form>
                  </div>
                ))}
              </div>
            </SectionCard>
          ) : null}

          <SectionCard
            title="Player Responses"
            description="Recent prompt responses from the player."
          >
            {responses.length === 0 ? (
              <p className="text-sm text-slate-600">No responses captured yet.</p>
            ) : (
              <div className="space-y-3">
                {responses.map((response) => (
                  <article
                    className="rounded-lg border border-slate-200 p-3"
                    key={response.id}
                  >
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      {dateFormatter.format(response.createdAt)}
                    </p>
                    <p className="mt-1 text-sm text-slate-700">{response.user.email}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      Published version {response.publishedVersion.version}
                      {response.publishedVersion.isActive ? " (active)" : ""}
                    </p>
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      Chapter {response.chapter.orderIndex}: {response.chapter.title} /
                      {" "}Scene {response.scene.orderIndex}
                      {response.scene.title ? ` - ${response.scene.title}` : ""}
                    </p>
                    <p className="mt-2 text-sm text-slate-900">{response.responseText}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Prompt: {response.dialogueEntry.promptLabel ?? "(untitled)"}
                    </p>
                  </article>
                ))}
              </div>
            )}
          </SectionCard>
        </>
      ) : null}

      {activeTab === "characters" ? (
        <>
          <SectionCard
            title="Houses"
            description="Manage houses that own reusable character rosters."
          >
            <form action={createHouseAction} className="space-y-3">
              <FormGrid>
                <div>
                  <Label htmlFor="house-name" text="House name" />
                  <Input id="house-name" name="name" required />
                </div>
                <div>
                  <Label htmlFor="house-notes" text="Notes" />
                  <TextArea id="house-notes" name="notes" rows={2} />
                </div>
              </FormGrid>
              <Button type="submit">Create house</Button>
            </form>

            {story.houses.map((house) => (
              <div className="rounded-lg border border-slate-200 p-3" key={house.id}>
                <form action={updateHouseAction} className="space-y-3">
                  <input name="houseId" type="hidden" value={house.id} />
                  <FormGrid>
                    <div>
                      <Label htmlFor={`house-${house.id}-name`} text="House name" />
                      <Input
                        defaultValue={house.name}
                        id={`house-${house.id}-name`}
                        name="name"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor={`house-${house.id}-notes`} text="Notes" />
                      <TextArea
                        defaultValue={house.notes ?? ""}
                        id={`house-${house.id}-notes`}
                        name="notes"
                        rows={2}
                      />
                    </div>
                  </FormGrid>
                  <div className="flex gap-2">
                    <Button type="submit" variant="outline">
                      Save house
                    </Button>
                  </div>
                </form>
                <form action={deleteHouseAction} className="mt-2">
                  <input name="houseId" type="hidden" value={house.id} />
                  <Button type="submit" variant="destructive">
                    Delete house
                  </Button>
                </form>
              </div>
            ))}
          </SectionCard>

          <SectionCard
            title="Characters"
            description="Characters are grouped by house and can have multiple portraits."
          >
            <form action={createCharacterAction} className="space-y-3">
              <FormGrid>
                <div>
                  <Label htmlFor="character-name" text="Name" />
                  <Input id="character-name" name="name" required />
                </div>
                <div>
                  <Label htmlFor="character-house" text="House" />
                  <Select id="character-house" name="houseId" required defaultValue="">
                    <option disabled value="">
                      Select house
                    </option>
                    {story.houses.map((house) => (
                      <option key={house.id} value={house.id}>
                        {house.name}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label htmlFor="character-bio" text="Bio" />
                  <TextArea id="character-bio" name="bio" rows={2} />
                </div>
                <div>
                  <Label htmlFor="character-notes" text="Notes" />
                  <TextArea id="character-notes" name="notes" rows={2} />
                </div>
              </FormGrid>
              <Button type="submit">Create character</Button>
            </form>

            {story.houses.map((house) => (
              <div className="space-y-3" key={house.id}>
                <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                  {house.name}
                </h3>
                {house.characters.map((character) => (
                  <div className="rounded-lg border border-slate-200 p-3" key={character.id}>
                    <form action={updateCharacterAction} className="space-y-3">
                      <input name="characterId" type="hidden" value={character.id} />
                      <FormGrid>
                        <div>
                          <Label
                            htmlFor={`character-${character.id}-name`}
                            text="Name"
                          />
                          <Input
                            defaultValue={character.name}
                            id={`character-${character.id}-name`}
                            name="name"
                            required
                          />
                        </div>
                        <div>
                          <Label
                            htmlFor={`character-${character.id}-house`}
                            text="House"
                          />
                          <Select
                            defaultValue={character.houseId}
                            id={`character-${character.id}-house`}
                            name="houseId"
                            required
                          >
                            {story.houses.map((houseOption) => (
                              <option key={houseOption.id} value={houseOption.id}>
                                {houseOption.name}
                              </option>
                            ))}
                          </Select>
                        </div>
                        <div>
                          <Label
                            htmlFor={`character-${character.id}-bio`}
                            text="Bio"
                          />
                          <TextArea
                            defaultValue={character.bio ?? ""}
                            id={`character-${character.id}-bio`}
                            name="bio"
                            rows={2}
                          />
                        </div>
                        <div>
                          <Label
                            htmlFor={`character-${character.id}-notes`}
                            text="Notes"
                          />
                          <TextArea
                            defaultValue={character.notes ?? ""}
                            id={`character-${character.id}-notes`}
                            name="notes"
                            rows={2}
                          />
                        </div>
                      </FormGrid>
                      <div className="flex gap-2">
                        <Button type="submit" variant="outline">
                          Save character
                        </Button>
                      </div>
                    </form>

                    <form action={deleteCharacterAction} className="mt-2">
                      <input name="characterId" type="hidden" value={character.id} />
                      <Button type="submit" variant="destructive">
                        Delete character
                      </Button>
                    </form>

                    <div className="mt-4 space-y-3 border-t border-slate-200 pt-3">
                      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Portraits
                      </h4>
                      <form action={createCharacterPortraitAction} className="space-y-3">
                        <input name="characterId" type="hidden" value={character.id} />
                        <FormGrid>
                          <div>
                            <Label
                              htmlFor={`portrait-${character.id}-path`}
                              text="Storage path"
                            />
                            <Input
                              id={`portrait-${character.id}-path`}
                              name="storagePath"
                              required
                            />
                          </div>
                          <div>
                            <Label
                              htmlFor={`portrait-${character.id}-label`}
                              text="Label"
                            />
                            <Input id={`portrait-${character.id}-label`} name="label" />
                          </div>
                          <div>
                            <Label
                              htmlFor={`portrait-${character.id}-sort`}
                              text="Sort order"
                            />
                            <Input
                              defaultValue={0}
                              id={`portrait-${character.id}-sort`}
                              name="sortOrder"
                              required
                              type="number"
                            />
                          </div>
                        </FormGrid>
                        <Button type="submit" variant="outline">
                          Add portrait
                        </Button>
                      </form>

                      {character.portraits.map((portrait) => (
                        <div
                          className="rounded-md border border-slate-200 p-3"
                          key={portrait.id}
                        >
                          <form action={updateCharacterPortraitAction} className="space-y-3">
                            <input name="portraitId" type="hidden" value={portrait.id} />
                            <input name="characterId" type="hidden" value={character.id} />
                            <FormGrid>
                              <div>
                                <Label
                                  htmlFor={`portrait-${portrait.id}-path`}
                                  text="Storage path"
                                />
                                <Input
                                  defaultValue={portrait.storagePath}
                                  id={`portrait-${portrait.id}-path`}
                                  name="storagePath"
                                  required
                                />
                              </div>
                              <div>
                                <Label
                                  htmlFor={`portrait-${portrait.id}-label`}
                                  text="Label"
                                />
                                <Input
                                  defaultValue={portrait.label ?? ""}
                                  id={`portrait-${portrait.id}-label`}
                                  name="label"
                                />
                              </div>
                              <div>
                                <Label
                                  htmlFor={`portrait-${portrait.id}-sort`}
                                  text="Sort order"
                                />
                                <Input
                                  defaultValue={portrait.sortOrder}
                                  id={`portrait-${portrait.id}-sort`}
                                  name="sortOrder"
                                  required
                                  type="number"
                                />
                              </div>
                            </FormGrid>
                            <div className="flex gap-2">
                              <Button type="submit" variant="outline">
                                Save portrait
                              </Button>
                            </div>
                          </form>
                          <form action={deleteCharacterPortraitAction} className="mt-2">
                            <input name="portraitId" type="hidden" value={portrait.id} />
                            <Button size="sm" type="submit" variant="destructive">
                              Delete portrait
                            </Button>
                          </form>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </SectionCard>
        </>
      ) : null}

      {activeTab === "scene-assets" ? (
        <SectionCard
          title="Scene Assets"
          description="Global reusable background image and music assets."
        >
          <form action={createMediaAssetAction} className="space-y-3">
            <FormGrid>
              <div>
                <Label htmlFor="media-type" text="Type" />
                <Select
                  defaultValue={StoryEnums.mediaAssetTypes[0]}
                  id="media-type"
                  name="type"
                  required
                >
                  {StoryEnums.mediaAssetTypes.map((type) => (
                    <option key={type} value={type}>
                      {type}
                    </option>
                  ))}
                </Select>
              </div>
              <div>
                <Label htmlFor="media-storage-path" text="Storage path" />
                <Input id="media-storage-path" name="storagePath" required />
              </div>
              <div>
                <Label htmlFor="media-label" text="Label" />
                <Input id="media-label" name="label" />
              </div>
              <div>
                <Label htmlFor="media-alt" text="Alt text" />
                <Input id="media-alt" name="altText" />
              </div>
            </FormGrid>
            <Button type="submit">Create media asset</Button>
          </form>

          <div className="space-y-3">
            {story.mediaAssets.map((asset) => (
              <div className="rounded-lg border border-slate-200 p-3" key={asset.id}>
                <form action={updateMediaAssetAction} className="space-y-3">
                  <input name="mediaAssetId" type="hidden" value={asset.id} />
                  <FormGrid>
                    <div>
                      <Label htmlFor={`media-${asset.id}-type`} text="Type" />
                      <Select
                        defaultValue={asset.type}
                        id={`media-${asset.id}-type`}
                        name="type"
                        required
                      >
                        {StoryEnums.mediaAssetTypes.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div>
                      <Label
                        htmlFor={`media-${asset.id}-storage-path`}
                        text="Storage path"
                      />
                      <Input
                        defaultValue={asset.storagePath}
                        id={`media-${asset.id}-storage-path`}
                        name="storagePath"
                        required
                      />
                    </div>
                    <div>
                      <Label htmlFor={`media-${asset.id}-label`} text="Label" />
                      <Input
                        defaultValue={asset.label ?? ""}
                        id={`media-${asset.id}-label`}
                        name="label"
                      />
                    </div>
                    <div>
                      <Label htmlFor={`media-${asset.id}-alt`} text="Alt text" />
                      <Input
                        defaultValue={asset.altText ?? ""}
                        id={`media-${asset.id}-alt`}
                        name="altText"
                      />
                    </div>
                  </FormGrid>
                  <div className="flex gap-2">
                    <Button type="submit" variant="outline">
                      Save media asset
                    </Button>
                  </div>
                </form>
                <form action={deleteMediaAssetAction} className="mt-2">
                  <input name="mediaAssetId" type="hidden" value={asset.id} />
                  <Button type="submit" variant="destructive">
                    Delete media asset
                  </Button>
                </form>
              </div>
            ))}
          </div>

          <div className="rounded-lg border border-slate-200 p-3">
            <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Usage snapshot
            </h3>
            <div className="mt-2 space-y-1 text-sm text-slate-700">
              {story.chapters.flatMap((chapter) =>
                chapter.scenes.map((scene) => (
                  <p key={scene.id}>
                    {sceneLabelMap.get(scene.id)}
                    {": "}
                    {scene.backgroundImageAsset.storagePath}
                    {scene.backgroundMusicAsset
                      ? ` / ${scene.backgroundMusicAsset.storagePath}`
                      : " / no music"}
                  </p>
                ))
              )}
            </div>
          </div>
        </SectionCard>
      ) : null}
    </main>
  );
}
