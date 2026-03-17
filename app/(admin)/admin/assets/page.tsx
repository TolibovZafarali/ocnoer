/* eslint-disable @next/next/no-img-element */

import Link from "next/link";

import {
  AdminCard,
  AdminCardGrid,
  AdminEmptyState
} from "@/components/admin/cards";
import {
  AdminPageShell,
  Notice,
  PageHeader,
  Pill
} from "@/components/admin/forms";
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

  return (
    <AdminPageShell>
      <div className="space-y-6">
        <PageHeader
          title="Assets"
          description="This skeleton keeps assets on one page with simple tabs for background images and music tracks."
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
          story.backgroundImages.length === 0 ? (
            <AdminEmptyState
              title="No Background Images Yet"
              description="Phase 1 focuses on the tabbed asset browsing layout. Upload and editing flows can expand in Phase 2."
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
                    description={<p>{asset.slug}</p>}
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
          )
        ) : story.backgroundMusicTracks.length === 0 ? (
          <AdminEmptyState
            title="No Background Music Tracks Yet"
            description="Phase 1 keeps the music section as a simple browseable list with playable cards."
          />
        ) : (
          <AdminCardGrid>
            {story.backgroundMusicTracks.map((track) => {
              const trackUrl = toPublicStorageUrl(supabaseUrl, track.filePath);

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
                  description={<p>{track.slug}</p>}
                  footer={<Pill>{track.type}</Pill>}
                />
              );
            })}
          </AdminCardGrid>
        )}
      </div>
    </AdminPageShell>
  );
}
