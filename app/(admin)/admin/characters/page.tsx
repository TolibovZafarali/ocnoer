/* eslint-disable @next/next/no-img-element */

import {
  addCharacterEmotionAction,
  createCharacterAction,
  deleteCharacterAction,
  deleteCharacterEmotionAction,
  setDefaultCharacterEmotionAction,
  updateCharacterAction,
  updateCharacterEmotionAction
} from "@/app/(admin)/admin/actions";
import {
  AdminPageShell,
  Field,
  FormGrid,
  Notice,
  PageHeader,
  Pill,
  SectionCard,
  TextArea,
  TextInput
} from "@/components/admin/forms";
import { Button } from "@/components/ui/button";
import { getAdminStoryData } from "@/lib/story/repository";
import { toPublicStorageUrl } from "@/lib/story/runtime";
import { getSupabaseEnv } from "@/lib/supabase/env";

type CharactersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

export default async function CharactersPage({
  searchParams
}: CharactersPageProps) {
  const story = await getAdminStoryData();
  const params: Record<string, string | string[] | undefined> = searchParams
    ? await searchParams
    : {};
  const { url: supabaseUrl } = getSupabaseEnv();
  const status = getParam(params.status);
  const message = getParam(params.message);

  return (
    <AdminPageShell>
      <div className="space-y-6">
        <PageHeader
          title="Characters"
          description="Create characters, upload the first default emotion immediately, then manage reusable emotion variants."
        />

        {status === "success" && message ? <Notice kind="success">{message}</Notice> : null}
        {status === "error" && message ? <Notice kind="error">{message}</Notice> : null}

        <SectionCard
          title="Create Character"
          description="The first uploaded image becomes the character's default emotion automatically."
        >
          <form action={createCharacterAction} className="space-y-4">
            <input type="hidden" name="returnTo" value="/admin/characters" />
            <FormGrid>
              <Field htmlFor="create-name" label="Name">
                <TextInput id="create-name" name="name" required />
              </Field>
              <Field htmlFor="create-slug" label="Slug">
                <TextInput id="create-slug" name="slug" required />
              </Field>
              <Field htmlFor="create-initial-key" label="First Emotion Key">
                <TextInput id="create-initial-key" name="initialEmotionKey" defaultValue="default" />
              </Field>
              <Field htmlFor="create-initial-label" label="First Emotion Label">
                <TextInput id="create-initial-label" name="initialEmotionLabel" defaultValue="Default" />
              </Field>
            </FormGrid>
            <Field htmlFor="create-bio" label="Bio">
              <TextArea id="create-bio" name="bio" />
            </Field>
            <Field
              htmlFor="create-image"
              label="First Emotion Image"
              hint="PNG, JPG, WEBP, or any other browser-safe image format."
            >
              <TextInput id="create-image" name="imageFile" type="file" accept="image/*" required />
            </Field>
            <div className="flex justify-end">
              <Button type="submit">Create Character</Button>
            </div>
          </form>
        </SectionCard>

        <div className="space-y-6">
          {story.characters.length === 0 ? (
            <SectionCard
              title="No Characters Yet"
              description="Characters appear here after the first character is created."
            >
              <p className="text-sm text-slate-600">
                Create Ocnoer first so scene authoring can immediately use her in the cast pool.
              </p>
            </SectionCard>
          ) : null}

          {story.characters.map((character) => {
            const defaultEmotion =
              character.emotions.find(
                (emotion) => emotion.key === character.defaultEmotionKey
              ) ?? character.emotions[0];
            const previewUrl = toPublicStorageUrl(
              supabaseUrl,
              defaultEmotion?.imagePath ?? null
            );

            return (
              <SectionCard
                key={character.id}
                title={character.name}
                description={`Slug: ${character.slug}`}
              >
                <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
                  <div className="space-y-3">
                    {previewUrl ? (
                      <img
                        src={previewUrl}
                        alt={`${character.name} default emotion`}
                        className="aspect-[4/5] w-full rounded-2xl object-cover"
                      />
                    ) : (
                      <div className="flex aspect-[4/5] items-center justify-center rounded-2xl bg-slate-100 text-sm text-slate-500">
                        No preview
                      </div>
                    )}
                    <div className="flex flex-wrap gap-2">
                      <Pill>{character.emotions.length} emotions</Pill>
                      <Pill>Default: {character.defaultEmotionKey}</Pill>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <form action={updateCharacterAction} className="space-y-4">
                      <input type="hidden" name="characterId" value={character.id} />
                      <input type="hidden" name="returnTo" value="/admin/characters" />
                      <FormGrid>
                        <Field htmlFor={`name-${character.id}`} label="Name">
                          <TextInput
                            id={`name-${character.id}`}
                            name="name"
                            defaultValue={character.name}
                            required
                          />
                        </Field>
                        <Field htmlFor={`slug-${character.id}`} label="Slug">
                          <TextInput
                            id={`slug-${character.id}`}
                            name="slug"
                            defaultValue={character.slug}
                            required
                          />
                        </Field>
                      </FormGrid>
                      <Field htmlFor={`bio-${character.id}`} label="Bio">
                        <TextArea
                          id={`bio-${character.id}`}
                          name="bio"
                          defaultValue={character.bio ?? ""}
                        />
                      </Field>
                      <div className="flex flex-wrap justify-end gap-3">
                        <Button type="submit">Save Character</Button>
                      </div>
                    </form>
                    <form action={deleteCharacterAction} className="flex justify-end">
                      <input type="hidden" name="characterId" value={character.id} />
                      <input type="hidden" name="returnTo" value="/admin/characters" />
                      <Button type="submit" variant="destructive">
                        Delete Character
                      </Button>
                    </form>

                    <div className="space-y-4">
                      <div className="flex items-center justify-between">
                        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-700">
                          Emotions
                        </h3>
                        <span className="text-xs text-slate-500">
                          One emotion is required at all times.
                        </span>
                      </div>
                      <div className="grid gap-4 xl:grid-cols-2">
                        {character.emotions.map((emotion) => {
                          const emotionUrl = toPublicStorageUrl(
                            supabaseUrl,
                            emotion.imagePath
                          );
                          const isDefault =
                            emotion.key === character.defaultEmotionKey;

                          return (
                            <div
                              key={emotion.id}
                              className="rounded-2xl border border-slate-200 bg-slate-50 p-4"
                            >
                              <div className="mb-3 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-semibold text-slate-900">
                                    {emotion.label}
                                  </span>
                                  {isDefault ? <Pill>Default</Pill> : null}
                                </div>
                                {!isDefault ? (
                                  <form action={setDefaultCharacterEmotionAction}>
                                    <input
                                      type="hidden"
                                      name="characterId"
                                      value={character.id}
                                    />
                                    <input
                                      type="hidden"
                                      name="emotionId"
                                      value={emotion.id}
                                    />
                                    <input
                                      type="hidden"
                                      name="returnTo"
                                      value="/admin/characters"
                                    />
                                    <Button type="submit" variant="outline" size="sm">
                                      Make Default
                                    </Button>
                                  </form>
                                ) : null}
                              </div>

                              {emotionUrl ? (
                                <img
                                  src={emotionUrl}
                                  alt={`${character.name} ${emotion.label}`}
                                  className="mb-4 aspect-[4/5] w-full rounded-xl object-cover"
                                />
                              ) : null}

                              <form action={updateCharacterEmotionAction} className="space-y-4">
                                <input
                                  type="hidden"
                                  name="characterId"
                                  value={character.id}
                                />
                                <input type="hidden" name="emotionId" value={emotion.id} />
                                <input
                                  type="hidden"
                                  name="returnTo"
                                  value="/admin/characters"
                                />
                                <FormGrid>
                                  <Field htmlFor={`emotion-key-${emotion.id}`} label="Key">
                                    <TextInput
                                      id={`emotion-key-${emotion.id}`}
                                      name="emotionKey"
                                      defaultValue={emotion.key}
                                      required
                                    />
                                  </Field>
                                  <Field htmlFor={`emotion-label-${emotion.id}`} label="Label">
                                    <TextInput
                                      id={`emotion-label-${emotion.id}`}
                                      name="emotionLabel"
                                      defaultValue={emotion.label}
                                      required
                                    />
                                  </Field>
                                </FormGrid>
                                <Field
                                  htmlFor={`emotion-file-${emotion.id}`}
                                  label="Replace Image"
                                >
                                  <TextInput
                                    id={`emotion-file-${emotion.id}`}
                                    name="imageFile"
                                    type="file"
                                    accept="image/*"
                                  />
                                </Field>
                                <div className="flex flex-wrap justify-end gap-3">
                                  <Button type="submit" size="sm">
                                    Save Emotion
                                  </Button>
                                </div>
                              </form>
                              <form action={deleteCharacterEmotionAction} className="mt-4 flex justify-end">
                                <input
                                  type="hidden"
                                  name="characterId"
                                  value={character.id}
                                />
                                <input
                                  type="hidden"
                                  name="emotionId"
                                  value={emotion.id}
                                />
                                <input
                                  type="hidden"
                                  name="returnTo"
                                  value="/admin/characters"
                                />
                                <Button type="submit" variant="destructive" size="sm">
                                  Delete Emotion
                                </Button>
                              </form>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-4">
                      <h3 className="text-sm font-semibold text-slate-900">
                        Add Emotion
                      </h3>
                      <form action={addCharacterEmotionAction} className="mt-4 space-y-4">
                        <input type="hidden" name="characterId" value={character.id} />
                        <input type="hidden" name="returnTo" value="/admin/characters" />
                        <FormGrid>
                          <Field htmlFor={`add-key-${character.id}`} label="Key">
                            <TextInput
                              id={`add-key-${character.id}`}
                              name="emotionKey"
                              placeholder="happy"
                              required
                            />
                          </Field>
                          <Field htmlFor={`add-label-${character.id}`} label="Label">
                            <TextInput
                              id={`add-label-${character.id}`}
                              name="emotionLabel"
                              placeholder="Happy"
                              required
                            />
                          </Field>
                        </FormGrid>
                        <Field
                          htmlFor={`add-file-${character.id}`}
                          label="Emotion Image"
                        >
                          <TextInput
                            id={`add-file-${character.id}`}
                            name="imageFile"
                            type="file"
                            accept="image/*"
                            required
                          />
                        </Field>
                        <div className="flex justify-end">
                          <Button type="submit">Add Emotion</Button>
                        </div>
                      </form>
                    </div>
                  </div>
                </div>
              </SectionCard>
            );
          })}
        </div>
      </div>
    </AdminPageShell>
  );
}
