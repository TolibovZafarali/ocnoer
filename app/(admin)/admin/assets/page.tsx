/* eslint-disable @next/next/no-img-element */

import Link from "next/link";

import {
  createBackgroundImageAssetAction,
  createBackgroundMusicTrackAction,
  updateBackgroundImageAssetAction,
  updateBackgroundMusicTrackAction
} from "@/app/(admin)/admin/actions";
import {
  AdminCard,
  AdminCardGrid,
  AdminEmptyState
} from "@/components/admin/cards";
import {
  AdminPageShell,
  Field,
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
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function tabClassName(active: boolean) {
  return [
    "rounded-full px-4 py-2 text-sm font-medium transition",
    active
      ? "bg-slate-950 text-white"
      : "border border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:text-slate-950"
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
  const backgroundReturnTo = "/admin/assets?tab=backgrounds";
  const musicReturnTo = "/admin/assets?tab=music";

  return (
    <AdminPageShell>
      <div className="space-y-6">
        <PageHeader
          title="Assets"
          description="Keep assets on one page with lightweight create and inline update controls for backgrounds and music."
          actions={
            <div className="flex flex-wrap gap-3">
              <Link
                className={tabClassName(tab === "backgrounds")}
                href="/admin/assets?tab=backgrounds"
              >
                Background Images
              </Link>
              <Link
                className={tabClassName(tab === "music")}
                href="/admin/assets?tab=music"
              >
                Background Music Tracks
              </Link>
            </div>
          }
        />

        {status === "success" && message ? (
          <Notice kind="success">{message}</Notice>
        ) : null}
        {status === "error" && message ? (
          <Notice kind="error">{message}</Notice>
        ) : null}

        {tab === "backgrounds" ? (
          <>
            <SectionCard
              title="Add Background Image"
              description="Upload an image and give it a label. The slug is derived automatically."
            >
              <form
                action={createBackgroundImageAssetAction}
                className="space-y-4"
                encType="multipart/form-data"
              >
                <input
                  type="hidden"
                  name="returnTo"
                  value={backgroundReturnTo}
                />

                <div className="grid gap-4 lg:grid-cols-3">
                  <Field label="Label" htmlFor="background-label">
                    <TextInput
                      id="background-label"
                      name="label"
                      placeholder="Forest Clearing"
                      required
                    />
                  </Field>

                  <Field
                    label="Alt Text"
                    htmlFor="background-alt-text"
                    hint="Optional."
                  >
                    <TextInput
                      id="background-alt-text"
                      name="altText"
                      placeholder="Mossy clearing at sunset"
                    />
                  </Field>

                  <Field label="Image File" htmlFor="background-file">
                    <TextInput
                      id="background-file"
                      name="file"
                      type="file"
                      accept="image/*"
                      required
                    />
                  </Field>
                </div>

                <div className="flex justify-end">
                  <Button type="submit">Add Background Image</Button>
                </div>
              </form>
            </SectionCard>

            {story.backgroundImages.length === 0 ? (
              <AdminEmptyState
                title="No Background Images Yet"
                description="Upload the first background image above."
              />
            ) : (
              <AdminCardGrid>
                {story.backgroundImages.map((asset) => {
                  const assetUrl = toPublicStorageUrl(
                    supabaseUrl,
                    asset.filePath
                  );

                  return (
                    <AdminCard
                      key={asset.id}
                      title={asset.label}
                      eyebrow="Background Image"
                      media={
                        assetUrl ? (
                          <img
                            src={assetUrl}
                            alt={asset.altText ?? asset.label}
                            className="aspect-video w-full object-cover"
                          />
                        ) : (
                          <div className="flex aspect-video items-center justify-center bg-slate-100 text-sm text-slate-500">
                            No image preview
                          </div>
                        )
                      }
                      description={
                        <div className="space-y-3">
                          <p>{asset.slug}</p>
                          <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <summary className="cursor-pointer text-sm font-medium text-slate-800">
                              Edit Background Image
                            </summary>
                            <form
                              action={updateBackgroundImageAssetAction}
                              className="mt-3 space-y-3"
                              encType="multipart/form-data"
                            >
                              <input
                                type="hidden"
                                name="assetId"
                                value={asset.id}
                              />
                              <input
                                type="hidden"
                                name="slug"
                                value={asset.slug}
                              />
                              <input
                                type="hidden"
                                name="returnTo"
                                value={backgroundReturnTo}
                              />

                              <Field
                                label="Label"
                                htmlFor={`bg-label-${asset.id}`}
                              >
                                <TextInput
                                  id={`bg-label-${asset.id}`}
                                  name="label"
                                  defaultValue={asset.label}
                                  required
                                />
                              </Field>

                              <Field
                                label="Alt Text"
                                htmlFor={`bg-alt-${asset.id}`}
                                hint="Optional."
                              >
                                <TextInput
                                  id={`bg-alt-${asset.id}`}
                                  name="altText"
                                  defaultValue={asset.altText ?? ""}
                                />
                              </Field>

                              <Field
                                label="Replace Image"
                                htmlFor={`bg-file-${asset.id}`}
                                hint="Optional."
                              >
                                <TextInput
                                  id={`bg-file-${asset.id}`}
                                  name="file"
                                  type="file"
                                  accept="image/*"
                                />
                              </Field>

                              <div className="flex justify-end">
                                <Button
                                  type="submit"
                                  size="sm"
                                  variant="outline"
                                >
                                  Save Changes
                                </Button>
                              </div>
                            </form>
                          </details>
                        </div>
                      }
                      footer={
                        <>
                          <Pill>{asset.type}</Pill>
                          {asset.altText ? <Pill>{asset.altText}</Pill> : null}
                        </>
                      }
                    />
                  );
                })}
              </AdminCardGrid>
            )}
          </>
        ) : (
          <>
            <SectionCard
              title="Add Background Music"
              description="Upload an audio file and give it a label. The slug is derived automatically."
            >
              <form
                action={createBackgroundMusicTrackAction}
                className="space-y-4"
                encType="multipart/form-data"
              >
                <input type="hidden" name="returnTo" value={musicReturnTo} />

                <div className="grid gap-4 lg:grid-cols-2">
                  <Field label="Label" htmlFor="music-label">
                    <TextInput
                      id="music-label"
                      name="label"
                      placeholder="Quiet Strings"
                      required
                    />
                  </Field>

                  <Field label="Audio File" htmlFor="music-file">
                    <TextInput
                      id="music-file"
                      name="file"
                      type="file"
                      accept="audio/*"
                      required
                    />
                  </Field>
                </div>

                <div className="flex justify-end">
                  <Button type="submit">Add Background Music</Button>
                </div>
              </form>
            </SectionCard>

            {story.backgroundMusicTracks.length === 0 ? (
              <AdminEmptyState
                title="No Background Music Tracks Yet"
                description="Upload the first background music track above."
              />
            ) : (
              <AdminCardGrid>
                {story.backgroundMusicTracks.map((track) => {
                  const trackUrl = toPublicStorageUrl(
                    supabaseUrl,
                    track.filePath
                  );

                  return (
                    <AdminCard
                      key={track.id}
                      title={track.label}
                      eyebrow="Background Music"
                      media={
                        trackUrl ? (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                            <audio controls className="w-full" src={trackUrl} />
                          </div>
                        ) : (
                          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">
                            No audio preview
                          </div>
                        )
                      }
                      description={
                        <div className="space-y-3">
                          <p>{track.slug}</p>
                          <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                            <summary className="cursor-pointer text-sm font-medium text-slate-800">
                              Edit Music Track
                            </summary>
                            <form
                              action={updateBackgroundMusicTrackAction}
                              className="mt-3 space-y-3"
                              encType="multipart/form-data"
                            >
                              <input
                                type="hidden"
                                name="assetId"
                                value={track.id}
                              />
                              <input
                                type="hidden"
                                name="slug"
                                value={track.slug}
                              />
                              <input
                                type="hidden"
                                name="returnTo"
                                value={musicReturnTo}
                              />

                              <Field
                                label="Label"
                                htmlFor={`music-label-${track.id}`}
                              >
                                <TextInput
                                  id={`music-label-${track.id}`}
                                  name="label"
                                  defaultValue={track.label}
                                  required
                                />
                              </Field>

                              <Field
                                label="Replace Audio"
                                htmlFor={`music-file-${track.id}`}
                                hint="Optional."
                              >
                                <TextInput
                                  id={`music-file-${track.id}`}
                                  name="file"
                                  type="file"
                                  accept="audio/*"
                                />
                              </Field>

                              <div className="flex justify-end">
                                <Button
                                  type="submit"
                                  size="sm"
                                  variant="outline"
                                >
                                  Save Changes
                                </Button>
                              </div>
                            </form>
                          </details>
                        </div>
                      }
                      footer={<Pill>{track.type}</Pill>}
                    />
                  );
                })}
              </AdminCardGrid>
            )}
          </>
        )}
      </div>
    </AdminPageShell>
  );
}
