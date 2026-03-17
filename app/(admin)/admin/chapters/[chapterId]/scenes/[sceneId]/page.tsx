import Link from "next/link";
import { notFound } from "next/navigation";

import {
  createDialogueEntryAction,
  deleteDialogueEntryAction,
  deleteSceneAction,
  updateSceneAction,
  updateDialogueEntryAction
} from "@/app/(admin)/admin/actions";
import { DialogueEntryForm } from "@/components/admin/dialogue-entry-form";
import {
  AdminPageShell,
  Field,
  FormGrid,
  Notice,
  PageHeader,
  Pill,
  SectionCard,
  SelectInput,
  TextInput
} from "@/components/admin/forms";
import { Button } from "@/components/ui/button";
import { getAdminStoryData } from "@/lib/story/repository";

type SceneDetailPageProps = {
  params: Promise<{
    chapterId: string;
    sceneId: string;
  }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function SceneDetailPage({
  params,
  searchParams
}: SceneDetailPageProps) {
  const [{ chapterId, sceneId }, story] = await Promise.all([
    params,
    getAdminStoryData()
  ]);
  const query: Record<string, string | string[] | undefined> = searchParams
    ? await searchParams
    : {};
  const chapter = story.chapters.find((item) => item.id === chapterId) ?? null;
  const scene = chapter?.scenes.find((item) => item.id === sceneId) ?? null;

  if (!chapter || !scene) {
    notFound();
  }

  const status = getParam(query.status);
  const message = getParam(query.message);
  const returnTo = `/admin/chapters/${chapter.id}/scenes/${scene.id}`;
  const sceneCharacters = scene.characterIds
    .map((characterId) => story.characters.find((character) => character.id === characterId))
    .filter((character): character is NonNullable<typeof character> => Boolean(character))
    .map((character) => ({
      id: character.id,
      name: character.name,
      slug: character.slug,
      emotions: character.emotions.map((emotion) => ({
        key: emotion.key,
        label: emotion.label
      }))
    }));

  return (
    <AdminPageShell>
      <div className="space-y-6">
        <PageHeader
          title={scene.title}
          description={`Scene ${scene.orderIndex} in ${chapter.title}`}
          actions={
            <Button asChild variant="outline">
              <Link href={`/admin/chapters/${chapter.id}`}>Back to Scenes</Link>
            </Button>
          }
        />

        {status === "success" && message ? <Notice kind="success">{message}</Notice> : null}
        {status === "error" && message ? <Notice kind="error">{message}</Notice> : null}

        <SectionCard
          title="Scene Settings"
          description="Scene characters define the allowed speaker pool for all dialogue rows in this scene."
        >
          <form action={updateSceneAction} className="space-y-4">
            <input type="hidden" name="chapterId" value={chapter.id} />
            <input type="hidden" name="sceneId" value={scene.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <FormGrid>
              <Field htmlFor="scene-title" label="Scene Title">
                <TextInput id="scene-title" name="title" defaultValue={scene.title} required />
              </Field>
              <Field htmlFor="scene-order" label="Order Index">
                <TextInput
                  id="scene-order"
                  name="orderIndex"
                  type="number"
                  defaultValue={scene.orderIndex}
                  required
                />
              </Field>
              <Field htmlFor="scene-bg" label="Background Image">
                <SelectInput
                  id="scene-bg"
                  name="backgroundImageAssetId"
                  defaultValue={scene.backgroundImageAssetId}
                  required
                >
                  <option value="">Select a background</option>
                  {story.backgroundImages.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.label}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field htmlFor="scene-music" label="Background Music">
                <SelectInput
                  id="scene-music"
                  name="backgroundMusicAssetId"
                  defaultValue={scene.backgroundMusicAssetId ?? ""}
                >
                  <option value="">No music</option>
                  {story.backgroundMusicTracks.map((asset) => (
                    <option key={asset.id} value={asset.id}>
                      {asset.label}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </FormGrid>

            <div className="space-y-3">
              <p className="text-sm font-medium text-slate-800">Scene Characters</p>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {story.characters.map((character) => (
                  <label
                    key={character.id}
                    className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      name="characterIds"
                      value={character.id}
                      defaultChecked={scene.characterIds.includes(character.id)}
                    />
                    <span>{character.name}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-3">
              <Button type="submit">Save Scene</Button>
            </div>
          </form>
          <form action={deleteSceneAction} className="flex justify-end">
            <input type="hidden" name="chapterId" value={chapter.id} />
            <input type="hidden" name="sceneId" value={scene.id} />
            <input type="hidden" name="returnTo" value={`/admin/chapters/${chapter.id}`} />
            <Button type="submit" variant="destructive">
              Delete Scene
            </Button>
          </form>
        </SectionCard>

        <SectionCard
          title="Create Dialogue Entry"
          description="Narrator rows skip emotion selection. Character rows are restricted to this scene's cast pool."
        >
          <DialogueEntryForm
            action={createDialogueEntryAction}
            chapterId={chapter.id}
            sceneId={scene.id}
            returnTo={returnTo}
            submitLabel="Add Dialogue"
            sceneCharacters={sceneCharacters}
          />
        </SectionCard>

        <SectionCard
          title="Dialogue"
          description="Stable dialogue IDs are generated automatically and used for player progress persistence."
        >
          {scene.dialogue.length === 0 ? (
            <p className="text-sm text-slate-600">
              No dialogue rows yet. Add the first row above.
            </p>
          ) : (
            <div className="space-y-4">
              {scene.dialogue.map((entry) => {
                let speakerLabel = "Narrator";

                const speaker = entry.speaker;

                if (speaker.type === "character") {
                  const speakerName =
                    story.characters.find(
                      (character) => character.id === speaker.characterId
                    )?.name ?? "Unknown";

                  speakerLabel = `${speakerName} / ${speaker.emotionKey}`;
                }

                return (
                  <div
                    key={entry.id}
                    className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <div className="mb-3 flex flex-wrap gap-2">
                      <Pill>Order {entry.orderIndex}</Pill>
                      <Pill>{speakerLabel}</Pill>
                    </div>
                    <DialogueEntryForm
                      action={updateDialogueEntryAction}
                      chapterId={chapter.id}
                      sceneId={scene.id}
                      returnTo={returnTo}
                      submitLabel="Save Dialogue"
                      sceneCharacters={sceneCharacters}
                      initial={{
                        dialogueEntryId: entry.id,
                        orderIndex: entry.orderIndex,
                        text: entry.text,
                        speakerType: entry.speaker.type,
                        characterId:
                          entry.speaker.type === "character"
                            ? entry.speaker.characterId
                            : "",
                        emotionKey:
                          entry.speaker.type === "character"
                            ? entry.speaker.emotionKey
                            : ""
                      }}
                    />
                    <form action={deleteDialogueEntryAction} className="mt-4 flex justify-end">
                      <input type="hidden" name="chapterId" value={chapter.id} />
                      <input type="hidden" name="sceneId" value={scene.id} />
                      <input type="hidden" name="dialogueEntryId" value={entry.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <Button type="submit" variant="destructive">
                        Delete Dialogue
                      </Button>
                    </form>
                  </div>
                );
              })}
            </div>
          )}
        </SectionCard>
      </div>
    </AdminPageShell>
  );
}
