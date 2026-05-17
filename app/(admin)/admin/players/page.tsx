import { PlayerStatus } from "@prisma/client";

import {
  createPlayerProfileAction,
  deletePlayerProfileAction,
  updatePlayerProfileAction,
  updatePlayerProfileStatusAction
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
  SelectInput,
  TextInput
} from "@/components/admin/forms";
import { Button } from "@/components/ui/button";
import { isPlayerOnline, listPlayerProfiles } from "@/lib/player-profiles";
import { getAdminStoryData } from "@/lib/story/repository";

type StoryData = Awaited<ReturnType<typeof getAdminStoryData>>;
type PlayerProgressRecord = NonNullable<
  Awaited<ReturnType<typeof listPlayerProfiles>>[number]["readingProgress"]
>;

type PlayersPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function getParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? (value[0] ?? null) : (value ?? null);
}

function formatDateTime(value: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(value);
}

function formatRelativeTime(value: Date | null, now: Date) {
  if (!value) {
    return "Never";
  }

  const diffMs = Math.max(0, now.getTime() - value.getTime());
  const minuteMs = 60 * 1000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (diffMs < minuteMs) {
    return "Just now";
  }

  if (diffMs < hourMs) {
    const minutes = Math.floor(diffMs / minuteMs);
    return `${minutes} min ago`;
  }

  if (diffMs < dayMs) {
    const hours = Math.floor(diffMs / hourMs);
    return `${hours} hr ago`;
  }

  const days = Math.floor(diffMs / dayMs);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

function truncateText(value: string, maxLength = 140) {
  const normalized = value.replace(/\s+/g, " ").trim();

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength - 1).trimEnd()}...`;
}

function resolveProgressLocation(
  story: StoryData | null,
  progress: PlayerProgressRecord | null
) {
  if (!progress) {
    return null;
  }

  const chapter = story?.chapters.find(
    (item) => item.id === progress.chapterId
  );
  const scene = chapter?.scenes.find((item) => item.id === progress.sceneId);
  const dialogueIndex =
    scene?.dialogue.findIndex((item) => item.id === progress.dialogueEntryId) ??
    -1;
  const dialogueEntry =
    dialogueIndex >= 0 ? (scene?.dialogue[dialogueIndex] ?? null) : null;

  return {
    chapter:
      chapter != null
        ? `Chapter ${chapter.orderIndex}: ${chapter.title}`
        : `Chapter ${progress.chapterId}`,
    scene:
      scene != null
        ? `Scene ${scene.orderIndex}: ${scene.title ?? "Untitled scene"}`
        : `Scene ${progress.sceneId}`,
    dialogue:
      dialogueEntry != null && scene != null
        ? `Line ${dialogueIndex + 1} of ${scene.dialogue.length}`
        : `Line ${progress.dialogueEntryId}`,
    excerpt: dialogueEntry ? truncateText(dialogueEntry.text) : null,
    updatedAt: progress.progressUpdatedAt
  };
}

export default async function PlayersPage({ searchParams }: PlayersPageProps) {
  const players = await listPlayerProfiles();
  const shouldLoadStory = players.some((player) => player.readingProgress);
  const storyResult = shouldLoadStory
    ? await getAdminStoryData()
        .then((story) => ({
          story,
          error: null
        }))
        .catch((error: unknown) => {
          console.error(
            "Unable to load story data for player progress.",
            error
          );

          return {
            story: null,
            error
          };
        })
    : {
        story: null,
        error: null
      };
  const params: Record<string, string | string[] | undefined> = searchParams
    ? await searchParams
    : {};
  const status = getParam(params.status);
  const message = getParam(params.message);
  const now = new Date();

  return (
    <AdminPageShell>
      <div className="space-y-6">
        <PageHeader
          title="Players"
          description="Create and manage player profiles. Username acts as the player password secret, and cat name is stored on the profile (not in story JSON)."
        />

        {status === "success" && message ? (
          <Notice kind="success">{message}</Notice>
        ) : null}
        {status === "error" && message ? (
          <Notice kind="error">{message}</Notice>
        ) : null}
        {storyResult.error ? (
          <Notice kind="error">
            Story metadata could not be loaded, so saved progress is shown as
            IDs.
          </Notice>
        ) : null}

        <SectionCard
          title="Create Player"
          description="Admin sets each player's first name and password secret (username)."
        >
          <form action={createPlayerProfileAction} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <Field label="First Name" htmlFor="player-create-first-name">
                <TextInput
                  id="player-create-first-name"
                  name="firstName"
                  placeholder="Luna"
                  required
                />
              </Field>

              <Field
                label="Username"
                htmlFor="player-create-username"
                hint="Used as the player's password secret."
              >
                <TextInput
                  id="player-create-username"
                  name="username"
                  placeholder="luna.secret"
                  required
                />
              </Field>

              <Field
                label="Cat Name"
                htmlFor="player-create-cat-name"
                hint="Optional. If provided, player cat-name prompt starts locked."
              >
                <TextInput
                  id="player-create-cat-name"
                  name="catName"
                  placeholder="Nox"
                />
              </Field>

              <Field label="Status" htmlFor="player-create-status">
                <SelectInput
                  id="player-create-status"
                  name="status"
                  defaultValue={PlayerStatus.ACTIVE}
                >
                  <option value={PlayerStatus.ACTIVE}>ACTIVE</option>
                  <option value={PlayerStatus.INACTIVE}>INACTIVE</option>
                </SelectInput>
              </Field>
            </div>

            <div className="flex justify-end">
              <Button type="submit">Create Player</Button>
            </div>
          </form>
        </SectionCard>

        {players.length === 0 ? (
          <AdminEmptyState
            title="No Players Yet"
            description="Create the first player profile above."
          />
        ) : (
          <AdminCardGrid>
            {players.map((player) => {
              const isActive = player.status === PlayerStatus.ACTIVE;
              const isOnline = isPlayerOnline(player.lastSeenAt, now);
              const progressLocation = resolveProgressLocation(
                storyResult.story,
                player.readingProgress
              );

              return (
                <AdminCard
                  key={player.id}
                  title={player.firstName}
                  eyebrow="Player Profile"
                  description={
                    <div className="space-y-3">
                      <p>Username secret: {player.username}</p>
                      <p>Cat name: {player.catName ?? "Not set"}</p>

                      <div className="space-y-1 border-t border-slate-100 pt-3">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                          Presence
                        </p>
                        <p>
                          Last seen:{" "}
                          {player.lastSeenAt
                            ? `${formatRelativeTime(player.lastSeenAt, now)} (${formatDateTime(player.lastSeenAt)})`
                            : "Never"}
                        </p>
                      </div>

                      <div className="space-y-1 border-t border-slate-100 pt-3">
                        <p className="text-xs font-medium uppercase tracking-[0.16em] text-slate-500">
                          Story Progress
                        </p>
                        {progressLocation ? (
                          <div className="space-y-1">
                            <p className="font-medium text-slate-800">
                              {progressLocation.chapter}
                            </p>
                            <p>{progressLocation.scene}</p>
                            <p>{progressLocation.dialogue}</p>
                            {progressLocation.excerpt ? (
                              <p className="text-slate-500">
                                {progressLocation.excerpt}
                              </p>
                            ) : null}
                            <p className="text-xs text-slate-500">
                              Saved{" "}
                              {formatRelativeTime(
                                progressLocation.updatedAt,
                                now
                              )}{" "}
                              ({formatDateTime(progressLocation.updatedAt)})
                            </p>
                          </div>
                        ) : (
                          <p>Not started yet.</p>
                        )}
                      </div>

                      <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <summary className="cursor-pointer text-sm font-medium text-slate-800">
                          Edit player details
                        </summary>

                        <form
                          action={updatePlayerProfileAction}
                          className="mt-3 space-y-3"
                        >
                          <input
                            type="hidden"
                            name="playerId"
                            value={player.id}
                          />

                          <Field
                            label="First Name"
                            htmlFor={`player-first-name-${player.id}`}
                          >
                            <TextInput
                              id={`player-first-name-${player.id}`}
                              name="firstName"
                              defaultValue={player.firstName}
                              required
                            />
                          </Field>

                          <Field
                            label="Username"
                            htmlFor={`player-username-${player.id}`}
                            hint="Used as the player's password secret."
                          >
                            <TextInput
                              id={`player-username-${player.id}`}
                              name="username"
                              defaultValue={player.username}
                              required
                            />
                          </Field>

                          <Field
                            label="Cat Name"
                            htmlFor={`player-cat-name-${player.id}`}
                            hint="Admin can update this any time."
                          >
                            <TextInput
                              id={`player-cat-name-${player.id}`}
                              name="catName"
                              defaultValue={player.catName ?? ""}
                              placeholder="Nox"
                            />
                          </Field>

                          <Field
                            label="Status"
                            htmlFor={`player-status-${player.id}`}
                          >
                            <SelectInput
                              id={`player-status-${player.id}`}
                              name="status"
                              defaultValue={player.status}
                            >
                              <option value={PlayerStatus.ACTIVE}>
                                ACTIVE
                              </option>
                              <option value={PlayerStatus.INACTIVE}>
                                INACTIVE
                              </option>
                            </SelectInput>
                          </Field>

                          <div className="flex justify-end">
                            <Button type="submit">Save Player</Button>
                          </div>
                        </form>
                      </details>

                      <details className="rounded-xl border border-rose-200 bg-rose-50 p-3">
                        <summary className="cursor-pointer text-sm font-medium text-rose-900">
                          Delete player
                        </summary>

                        <form
                          action={deletePlayerProfileAction}
                          className="mt-3 space-y-3"
                        >
                          <input
                            type="hidden"
                            name="playerId"
                            value={player.id}
                          />
                          <input
                            type="hidden"
                            name="returnTo"
                            value="/admin/players"
                          />
                          <label className="flex items-start gap-3 rounded-xl border border-rose-200 bg-white/70 px-4 py-3 text-sm text-rose-900">
                            <input
                              type="checkbox"
                              name="confirmDelete"
                              value="yes"
                              required
                              className="mt-0.5 h-4 w-4 rounded border-rose-300 text-rose-700"
                            />
                            <span>
                              I understand that deleting this player permanently
                              removes the profile and saved progress.
                            </span>
                          </label>

                          <div className="flex justify-end">
                            <Button
                              type="submit"
                              size="sm"
                              variant="destructive"
                            >
                              Delete Player
                            </Button>
                          </div>
                        </form>
                      </details>
                    </div>
                  }
                  footer={
                    <>
                      <Pill tone={isOnline ? "success" : "default"}>
                        {isOnline ? "Online" : "Offline"}
                      </Pill>
                      <Pill tone={isActive ? "success" : "warning"}>
                        {player.status}
                      </Pill>
                      <Pill>
                        {player.catNameLocked
                          ? "Cat name locked"
                          : "Cat name unlocked"}
                      </Pill>
                      <form action={updatePlayerProfileStatusAction}>
                        <input
                          type="hidden"
                          name="playerId"
                          value={player.id}
                        />
                        <input
                          type="hidden"
                          name="status"
                          value={
                            isActive
                              ? PlayerStatus.INACTIVE
                              : PlayerStatus.ACTIVE
                          }
                        />
                        <Button type="submit" size="sm" variant="outline">
                          {isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </form>
                    </>
                  }
                />
              );
            })}
          </AdminCardGrid>
        )}
      </div>
    </AdminPageShell>
  );
}
