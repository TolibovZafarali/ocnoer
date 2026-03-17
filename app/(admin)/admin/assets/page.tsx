/* eslint-disable @next/next/no-img-element */

import Link from "next/link";

import {
  createBackgroundImageAssetAction,
  createBackgroundMusicTrackAction,
  deleteBackgroundImageAssetAction,
  deleteBackgroundMusicTrackAction,
  updateBackgroundImageAssetAction,
  updateBackgroundMusicTrackAction
} from "@/app/(admin)/admin/actions";
import {
  AdminPageShell,
  Field,
  FormGrid,
  Notice,
  PageHeader,
  Pill,
  SectionCard,
  TextInput
} from "@/components/admin/forms";
import { Button } from "@/components/ui/button";
import { getAdminStoryData } from "@/lib/story/repository";
import { toPublicStorageUrl } from "@/lib/story/runtime";
import { getSupabaseEnv } from "@/lib/supabase/env";

type AssetsPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? null : value ?? null;
}

function tabClassName(active: boolean) {
  return [
    "rounded-full px-4 py-2 text-sm font-medium transition",
    active
      ? "bg-slate-950 text-white"
      : "border border-slate-200 bg-white text-slate-700"
  ].join(" ");
}

export default async function AssetsPage({ searchParams }: AssetsPageProps) {
  const story = await getAdminStoryData();
  const params: Record<string, string | string[] | undefined> = searchParams
    ? await searchParams
    : {};
  const { url: supabaseUrl } = getSupabaseEnv();
  const status = getParam(params.status);
  const message = getParam(params.message);
  const tab = getParam(params.tab) === "music" ? "music" : "backgrounds";

  const activeTitle =
    tab === "backgrounds" ? "Background Images" : "Background Music Tracks";
  const returnTo =
    tab === "backgrounds" ? "/admin/assets?tab=backgrounds" : "/admin/assets?tab=music";

  return (
    <AdminPageShell>
      <div className="space-y-6">
        <PageHeader
          title="Assets"
          description="Persistent media lives in storage only. JSON stores labels, slugs, and storage paths."
          actions={
            <div className="flex flex-wrap gap-3">
              <Link className={tabClassName(tab === "backgrounds")} href="/admin/assets?tab=backgrounds">
                Background Images
              </Link>
              <Link className={tabClassName(tab === "music")} href="/admin/assets?tab=music">
                Background Music
              </Link>
            </div>
          }
        />

        {status === "success" && message ? (
          <Notice kind="success">{message}</Notice>
        ) : null}
        {status === "error" && message ? <Notice kind="error">{message}</Notice> : null}

        {tab === "backgrounds" ? (
          <>
            <SectionCard
              title="Create Background Image"
              description="Background images can be selected by scenes and compiled directly into runtime chapter JSON."
            >
              <form action={createBackgroundImageAssetAction} className="space-y-4">
                <input type="hidden" name="returnTo" value={returnTo} />
                <FormGrid>
                  <Field htmlFor="bg-label" label="Label">
                    <TextInput id="bg-label" name="label" required />
                  </Field>
                  <Field htmlFor="bg-slug" label="Slug">
                    <TextInput id="bg-slug" name="slug" required />
                  </Field>
                </FormGrid>
                <Field htmlFor="bg-alt" label="Alt Text">
                  <TextInput id="bg-alt" name="altText" />
                </Field>
                <Field htmlFor="bg-file" label="Image File">
                  <TextInput id="bg-file" name="file" type="file" accept="image/*" required />
                </Field>
                <div className="flex justify-end">
                  <Button type="submit">Create Background</Button>
                </div>
              </form>
            </SectionCard>

            <div className="grid gap-5 xl:grid-cols-2">
              {story.backgroundImages.map((asset) => {
                const assetUrl = toPublicStorageUrl(supabaseUrl, asset.filePath);

                return (
                  <SectionCard
                    key={asset.id}
                    title={asset.label}
                    description={`Slug: ${asset.slug}`}
                  >
                    {assetUrl ? (
                      <img
                        src={assetUrl}
                        alt={asset.altText ?? asset.label}
                        className="aspect-video w-full rounded-2xl object-cover"
                      />
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      <Pill>{asset.type}</Pill>
                      {asset.altText ? <Pill>{asset.altText}</Pill> : null}
                    </div>
                    <form action={updateBackgroundImageAssetAction} className="space-y-4">
                      <input type="hidden" name="assetId" value={asset.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <FormGrid>
                        <Field htmlFor={`bg-label-${asset.id}`} label="Label">
                          <TextInput
                            id={`bg-label-${asset.id}`}
                            name="label"
                            defaultValue={asset.label}
                            required
                          />
                        </Field>
                        <Field htmlFor={`bg-slug-${asset.id}`} label="Slug">
                          <TextInput
                            id={`bg-slug-${asset.id}`}
                            name="slug"
                            defaultValue={asset.slug}
                            required
                          />
                        </Field>
                      </FormGrid>
                      <Field htmlFor={`bg-alt-${asset.id}`} label="Alt Text">
                        <TextInput
                          id={`bg-alt-${asset.id}`}
                          name="altText"
                          defaultValue={asset.altText ?? ""}
                        />
                      </Field>
                      <Field htmlFor={`bg-file-${asset.id}`} label="Replace Image">
                        <TextInput
                          id={`bg-file-${asset.id}`}
                          name="file"
                          type="file"
                          accept="image/*"
                        />
                      </Field>
                      <div className="flex flex-wrap justify-end gap-3">
                        <Button type="submit">Save Background</Button>
                      </div>
                    </form>
                    <form action={deleteBackgroundImageAssetAction} className="flex justify-end">
                      <input type="hidden" name="assetId" value={asset.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <Button type="submit" variant="destructive">
                        Delete
                      </Button>
                    </form>
                  </SectionCard>
                );
              })}
            </div>
          </>
        ) : (
          <>
            <SectionCard
              title="Create Music Track"
              description="Music file paths are compiled per scene so the player never needs runtime joins."
            >
              <form action={createBackgroundMusicTrackAction} className="space-y-4">
                <input type="hidden" name="returnTo" value={returnTo} />
                <FormGrid>
                  <Field htmlFor="music-label" label="Label">
                    <TextInput id="music-label" name="label" required />
                  </Field>
                  <Field htmlFor="music-slug" label="Slug">
                    <TextInput id="music-slug" name="slug" required />
                  </Field>
                </FormGrid>
                <Field htmlFor="music-file" label="Audio File">
                  <TextInput id="music-file" name="file" type="file" accept="audio/*" required />
                </Field>
                <div className="flex justify-end">
                  <Button type="submit">Create Track</Button>
                </div>
              </form>
            </SectionCard>

            <div className="grid gap-5 xl:grid-cols-2">
              {story.backgroundMusicTracks.map((track) => {
                const trackUrl = toPublicStorageUrl(supabaseUrl, track.filePath);

                return (
                  <SectionCard
                    key={track.id}
                    title={track.label}
                    description={`Slug: ${track.slug}`}
                  >
                    {trackUrl ? <audio controls className="w-full" src={trackUrl} /> : null}
                    <div className="flex flex-wrap gap-2">
                      <Pill>{track.type}</Pill>
                    </div>
                    <form action={updateBackgroundMusicTrackAction} className="space-y-4">
                      <input type="hidden" name="assetId" value={track.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <FormGrid>
                        <Field htmlFor={`music-label-${track.id}`} label="Label">
                          <TextInput
                            id={`music-label-${track.id}`}
                            name="label"
                            defaultValue={track.label}
                            required
                          />
                        </Field>
                        <Field htmlFor={`music-slug-${track.id}`} label="Slug">
                          <TextInput
                            id={`music-slug-${track.id}`}
                            name="slug"
                            defaultValue={track.slug}
                            required
                          />
                        </Field>
                      </FormGrid>
                      <Field htmlFor={`music-file-${track.id}`} label="Replace Audio">
                        <TextInput
                          id={`music-file-${track.id}`}
                          name="file"
                          type="file"
                          accept="audio/*"
                        />
                      </Field>
                      <div className="flex flex-wrap justify-end gap-3">
                        <Button type="submit">Save Track</Button>
                      </div>
                    </form>
                    <form action={deleteBackgroundMusicTrackAction} className="flex justify-end">
                      <input type="hidden" name="assetId" value={track.id} />
                      <input type="hidden" name="returnTo" value={returnTo} />
                      <Button type="submit" variant="destructive">
                        Delete
                      </Button>
                    </form>
                  </SectionCard>
                );
              })}
            </div>
          </>
        )}

        {tab === "backgrounds" && story.backgroundImages.length === 0 ? (
          <SectionCard
            title={`No ${activeTitle}`}
            description="Create one or more background images before authoring scenes."
          />
        ) : null}

        {tab === "music" && story.backgroundMusicTracks.length === 0 ? (
          <SectionCard
            title={`No ${activeTitle}`}
            description="Music is optional per scene, but tracks created here can be attached anywhere."
          />
        ) : null}
      </div>
    </AdminPageShell>
  );
}
