"use client";

/* eslint-disable @next/next/no-img-element */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type FormEvent
} from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { useRouter } from "next/navigation";

import { AdminCard, AdminEmptyState } from "@/components/admin/cards";
import {
  Field,
  Notice,
  Pill,
  SectionCard,
  SelectInput,
  TextArea,
  TextInput
} from "@/components/admin/forms";
import { Button } from "@/components/ui/button";
import { SCENE_DRAFT_TEMP_ID_PREFIX } from "@/lib/story/scene-draft";
import { isPrimaryLeftStageCharacterSlug } from "@/lib/story/staging";
import { toPublicStorageUrl } from "@/lib/story/runtime";
import {
  BASE_DRESS_OPTION_KEY,
  BASE_DRESS_OPTION_LABEL
} from "@/lib/story/wardrobe";
import type { SceneDraftPayload } from "@/lib/story/types";
import { cn } from "@/lib/utils";

type CharacterOption = {
  id: string;
  name: string;
  slug: string;
  emotions: Array<{
    key: string;
    label: string;
  }>;
  dresses: Array<{
    key: string;
    label: string;
  }>;
};

type BackgroundImageOption = {
  id: string;
  label: string;
  altText: string | null;
  filePath: string;
};

type BackgroundMusicOption = {
  id: string;
  label: string;
};

type DraftActionResult =
  | {
      ok: true;
    }
  | {
      ok: false;
      error: string;
    };

type SaveDraftActionResult =
  | {
      ok: true;
      redirectTo: string;
    }
  | {
      ok: false;
      error: string;
    };

type DialogueFormValues = {
  speakerType: "narrator" | "character" | "dress_prompt";
  characterId: string | null;
  emotionKey: string | null;
  dressOptionKeys: string[];
  text: string;
  orderIndex?: number;
};

type SceneDraftEditorProps = {
  chapterId: string;
  sceneId: string;
  returnTo: string;
  supabaseUrl: string;
  initialDraft: SceneDraftPayload;
  initialDraftLoaded: boolean;
  initialSourceSceneUpdatedAt: string;
  backgroundImages: BackgroundImageOption[];
  backgroundMusicTracks: BackgroundMusicOption[];
  characters: CharacterOption[];
  upsertDraftAction: (input: {
    chapterId: string;
    sceneId: string;
    sourceSceneUpdatedAt: string;
    payload: SceneDraftPayload;
  }) => Promise<DraftActionResult>;
  saveSceneDraftAction: (input: {
    chapterId: string;
    sceneId: string;
    returnTo: string;
    sourceSceneUpdatedAt: string;
    payload: SceneDraftPayload;
  }) => Promise<SaveDraftActionResult>;
  discardSceneDraftAction: (input: {
    sceneId: string;
    returnTo: string;
  }) => Promise<SaveDraftActionResult>;
};

function createTempDialogueId() {
  const suffix =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

  return `${SCENE_DRAFT_TEMP_ID_PREFIX}${suffix}`;
}

function getDraftHash(payload: SceneDraftPayload) {
  return JSON.stringify(payload);
}

function clampOrder(value: number, total: number) {
  return Math.min(Math.max(value, 1), total);
}

function moveDialogueToOrder(
  dialogue: SceneDraftPayload["dialogue"],
  entryId: string,
  requestedOrderIndex: number
) {
  const currentIndex = dialogue.findIndex((entry) => entry.id === entryId);

  if (currentIndex < 0) {
    return dialogue;
  }

  const nextIndex = clampOrder(requestedOrderIndex, dialogue.length) - 1;

  if (currentIndex === nextIndex) {
    return dialogue;
  }

  return arrayMove(dialogue, currentIndex, nextIndex);
}

function getDialogueIssue(
  entry: SceneDraftPayload["dialogue"][number],
  sceneCharacterIds: string[],
  charactersById: Map<string, CharacterOption>
) {
  if (entry.speakerType === "narrator") {
    return null;
  }

  if (!entry.characterId) {
    return "Select a speaker for this row.";
  }

  if (!sceneCharacterIds.includes(entry.characterId)) {
    return "Speaker is not currently in the scene cast.";
  }

  const character = charactersById.get(entry.characterId);

  if (!character) {
    return "Speaker no longer exists.";
  }

  if (entry.speakerType === "dress_prompt") {
    if (!isPrimaryLeftStageCharacterSlug(character.slug)) {
      return "Dress prompts currently support only Ocnoer.";
    }

    if ((entry.dressOptionKeys ?? []).length === 0) {
      return "Select at least one dress option for this row.";
    }

    const availableDressKeys = new Set([
      BASE_DRESS_OPTION_KEY,
      ...character.dresses.map((dress) => dress.key)
    ]);

    if (
      (entry.dressOptionKeys ?? []).some(
        (dressKey) => !availableDressKeys.has(dressKey)
      )
    ) {
      return "Selected dress option no longer exists.";
    }

    return null;
  }

  if (!entry.emotionKey) {
    return "Select an emotion for this row.";
  }

  if (!character.emotions.some((emotion) => emotion.key === entry.emotionKey)) {
    return "Selected emotion no longer exists.";
  }

  return null;
}

function DialogueDraftForm(props: {
  allCharacters: CharacterOption[];
  sceneCharacterIds: string[];
  submitLabel: string;
  initial?: SceneDraftPayload["dialogue"][number] & {
    orderIndex: number;
  };
  resetVersion?: number;
  onSubmit: (value: DialogueFormValues) => void;
}) {
  const isEditMode = Boolean(props.initial);
  const initialCharacterId = props.initial?.characterId ?? null;
  const allCharactersById = useMemo(
    () => new Map(props.allCharacters.map((character) => [character.id, character])),
    [props.allCharacters]
  );
  const initialSceneCharacters = useMemo(
    () =>
      props.allCharacters.filter((character) =>
        props.sceneCharacterIds.includes(character.id)
      ),
    [props.allCharacters, props.sceneCharacterIds]
  );
  const [speakerType, setSpeakerType] = useState<
    "narrator" | "character" | "dress_prompt"
  >(props.initial?.speakerType ?? "narrator");
  const [characterId, setCharacterId] = useState<string | null>(
    initialCharacterId
  );
  const [emotionKey, setEmotionKey] = useState<string | null>(
    props.initial?.emotionKey ?? null
  );
  const [dressOptionKeys, setDressOptionKeys] = useState<string[]>(
    props.initial?.dressOptionKeys ?? []
  );
  const [text, setText] = useState(props.initial?.text ?? "");
  const [orderIndex, setOrderIndex] = useState(
    String(props.initial?.orderIndex ?? 1)
  );

  const availableCharacters = useMemo(() => {
    const characters = [...initialSceneCharacters];

    if (isEditMode && characterId && !characters.some((item) => item.id === characterId)) {
      const currentCharacter = allCharactersById.get(characterId);

      characters.push(
        currentCharacter ?? {
          id: characterId,
          name: `${characterId} (missing)`,
          slug: "",
          emotions: [],
          dresses: []
        }
      );
    }

    return characters;
  }, [allCharactersById, characterId, initialSceneCharacters, isEditMode]);

  const selectedCharacter = useMemo(
    () => availableCharacters.find((item) => item.id === characterId) ?? null,
    [availableCharacters, characterId]
  );
  const dressPromptCharacter = useMemo(
    () =>
      availableCharacters.find((character) =>
        isPrimaryLeftStageCharacterSlug(character.slug)
      ) ?? null,
    [availableCharacters]
  );
  const availableEmotions = useMemo(() => {
    const emotions = [...(selectedCharacter?.emotions ?? [])];

    if (
      isEditMode &&
      emotionKey &&
      !emotions.some((item) => item.key === emotionKey)
    ) {
      emotions.push({
        key: emotionKey,
        label: `${emotionKey} (missing)`
      });
    }

    return emotions;
  }, [emotionKey, isEditMode, selectedCharacter]);
  const availableDressOptions = useMemo(() => {
    const character =
      speakerType === "dress_prompt" ? dressPromptCharacter : selectedCharacter;

    if (!character) {
      return [];
    }

    return [
      {
        key: BASE_DRESS_OPTION_KEY,
        label: BASE_DRESS_OPTION_LABEL
      },
      ...character.dresses.map((dress) => ({
        key: dress.key,
        label: dress.label
      }))
    ];
  }, [dressPromptCharacter, selectedCharacter, speakerType]);

  useEffect(() => {
    setSpeakerType(props.initial?.speakerType ?? "narrator");
    setCharacterId(props.initial?.characterId ?? null);
    setEmotionKey(props.initial?.emotionKey ?? null);
    setDressOptionKeys(props.initial?.dressOptionKeys ?? []);
    setText(props.initial?.text ?? "");
    setOrderIndex(String(props.initial?.orderIndex ?? 1));
  }, [props.initial, props.resetVersion]);

  useEffect(() => {
    if (speakerType === "narrator") {
      return;
    }

    if (speakerType === "dress_prompt") {
      if (!dressPromptCharacter) {
        setCharacterId(null);
        setDressOptionKeys([]);
        return;
      }

      if (characterId !== dressPromptCharacter.id) {
        setCharacterId(dressPromptCharacter.id);
      }

      setEmotionKey(null);
      setDressOptionKeys((currentValue) =>
        currentValue.filter((dressKey) =>
          availableDressOptions.some((option) => option.key === dressKey)
        )
      );
      return;
    }

    if (!characterId && availableCharacters[0]) {
      setCharacterId(availableCharacters[0].id);
      setEmotionKey(availableCharacters[0].emotions[0]?.key ?? null);
      return;
    }

    if (!availableCharacters.some((character) => character.id === characterId)) {
      const fallbackCharacter = availableCharacters[0] ?? null;
      setCharacterId(fallbackCharacter?.id ?? null);
      setEmotionKey(fallbackCharacter?.emotions[0]?.key ?? null);
      return;
    }

    if (
      emotionKey &&
      availableEmotions.some((emotion) => emotion.key === emotionKey)
    ) {
      return;
    }

    setEmotionKey(availableEmotions[0]?.key ?? null);
  }, [
    availableCharacters,
    availableDressOptions,
    availableEmotions,
    characterId,
    dressPromptCharacter,
    emotionKey,
    speakerType
  ]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    props.onSubmit({
      speakerType,
      characterId:
        speakerType === "character" || speakerType === "dress_prompt"
          ? characterId
          : null,
      emotionKey: speakerType === "character" ? emotionKey : null,
      dressOptionKeys:
        speakerType === "dress_prompt" ? dressOptionKeys : [],
      text,
      orderIndex: isEditMode ? Number.parseInt(orderIndex, 10) || 1 : undefined
    });
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
    >
      <div
        className={`grid gap-4 ${
          speakerType === "character"
            ? "md:grid-cols-[140px_1fr]"
            : "md:grid-cols-[180px_1fr]"
        }`}
      >
        <Field label="Speaker" htmlFor={`dialogue-speaker-${props.resetVersion ?? "0"}`}>
          <SelectInput
            id={`dialogue-speaker-${props.resetVersion ?? "0"}`}
            value={speakerType}
            onChange={(event) =>
              setSpeakerType(
                event.target.value as
                  | "narrator"
                  | "character"
                  | "dress_prompt"
              )
            }
          >
            <option value="narrator">Narrator</option>
            {availableCharacters.length > 0 || speakerType === "character" ? (
              <option value="character">Character</option>
            ) : null}
            {dressPromptCharacter ? (
              <option value="dress_prompt">Dress Prompt</option>
            ) : null}
          </SelectInput>
        </Field>

        {speakerType === "character" ? (
          <Field label="Scene Character" htmlFor={`dialogue-character-${props.resetVersion ?? "0"}`}>
            <SelectInput
              id={`dialogue-character-${props.resetVersion ?? "0"}`}
              value={characterId ?? ""}
              onChange={(event) => setCharacterId(event.target.value || null)}
            >
              {availableCharacters.map((character) => (
                <option key={character.id} value={character.id}>
                  {character.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        ) : null}
      </div>

      {speakerType === "character" ? (
        <Field label="Emotion" htmlFor={`dialogue-emotion-${props.resetVersion ?? "0"}`}>
          <SelectInput
            id={`dialogue-emotion-${props.resetVersion ?? "0"}`}
            value={emotionKey ?? ""}
            onChange={(event) => setEmotionKey(event.target.value || null)}
          >
            {availableEmotions.map((emotion) => (
              <option key={emotion.key} value={emotion.key}>
                {emotion.label}
              </option>
            ))}
          </SelectInput>
        </Field>
      ) : null}

      {speakerType === "dress_prompt" ? (
        <Field
          label="Dress Options"
          htmlFor={`dialogue-dresses-${props.resetVersion ?? "0"}`}
          hint="Select one or more choices the player can pick."
        >
          <div
            id={`dialogue-dresses-${props.resetVersion ?? "0"}`}
            className="space-y-2 rounded-xl border border-slate-200 bg-white p-3"
          >
            {availableDressOptions.length === 0 ? (
              <p className="text-sm text-slate-500">
                Ocnoer must be present in the scene cast to add a dress prompt.
              </p>
            ) : (
              availableDressOptions.map((dressOption) => {
                const checked = dressOptionKeys.includes(dressOption.key);

                return (
                  <label
                    key={dressOption.key}
                    className="flex items-center gap-3 text-sm text-slate-700"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(event) =>
                        setDressOptionKeys((currentValue) =>
                          event.target.checked
                            ? [...currentValue, dressOption.key]
                            : currentValue.filter(
                                (value) => value !== dressOption.key
                              )
                        )
                      }
                      className="h-4 w-4 rounded border-slate-300 text-slate-900"
                    />
                    <span>{dressOption.label}</span>
                  </label>
                );
              })
            )}
          </div>
        </Field>
      ) : null}

      {isEditMode ? (
        <Field label="Order" htmlFor={`dialogue-order-${props.resetVersion ?? "0"}`} hint="1 is first in scene order.">
          <TextInput
            id={`dialogue-order-${props.resetVersion ?? "0"}`}
            type="number"
            min={1}
            step={1}
            value={orderIndex}
            onChange={(event) => setOrderIndex(event.target.value)}
          />
        </Field>
      ) : null}

      <Field label="Dialogue Text" htmlFor={`dialogue-text-${props.resetVersion ?? "0"}`}>
        <TextArea
          id={`dialogue-text-${props.resetVersion ?? "0"}`}
          rows={5}
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
      </Field>

      <div className="flex justify-end">
        <Button type="submit">{props.submitLabel}</Button>
      </div>
    </form>
  );
}

function SortableDialogueDraftCard(props: {
  item: SceneDraftPayload["dialogue"][number];
  orderIndex: number;
  sceneCharacterIds: string[];
  allCharacters: CharacterOption[];
  disabled: boolean;
  onUpdate: (entryId: string, values: DialogueFormValues) => void;
  onDelete: (entryId: string) => void;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging
  } = useSortable({
    id: props.item.id,
    disabled: props.disabled
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition
  };
  const allCharactersById = useMemo(
    () => new Map(props.allCharacters.map((character) => [character.id, character])),
    [props.allCharacters]
  );
  const issue = getDialogueIssue(
    props.item,
    props.sceneCharacterIds,
    allCharactersById
  );
  const characterName =
    props.item.speakerType === "dress_prompt"
      ? "Dress Prompt"
      : props.item.speakerType === "character" && props.item.characterId
      ? (allCharactersById.get(props.item.characterId)?.name ??
        `${props.item.characterId} (missing)`)
      : "Narrator";
  const dressOptionLabels =
    props.item.speakerType === "dress_prompt" && props.item.characterId
      ? (props.item.dressOptionKeys ?? []).map((dressKey) => {
          const promptCharacterId = props.item.characterId as string;

          if (dressKey === BASE_DRESS_OPTION_KEY) {
            return BASE_DRESS_OPTION_LABEL;
          }

          return (
            allCharactersById
              .get(promptCharacterId)
              ?.dresses.find((dress) => dress.key === dressKey)
              ?.label ?? `${dressKey} (missing)`
          );
        })
      : [];
  const emotionLabel =
    props.item.speakerType === "character" &&
    props.item.characterId &&
    props.item.emotionKey
      ? (
          allCharactersById
            .get(props.item.characterId)
            ?.emotions.find((emotion) => emotion.key === props.item.emotionKey)
            ?.label ?? `${props.item.emotionKey} (missing)`
        )
      : null;

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={`Drag to reorder ${characterName} dialogue`}
        title="Drag to reorder"
        disabled={props.disabled}
        className="absolute right-4 top-4 z-10 inline-flex h-9 w-9 cursor-grab items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-slate-300 hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-300 disabled:cursor-not-allowed disabled:opacity-50"
        style={{ touchAction: "none" }}
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-4 w-4" aria-hidden="true" />
      </button>

      <AdminCard
        className={cn(
          "relative pr-16",
          isDragging && "border-slate-300 shadow-md ring-2 ring-slate-200"
        )}
        title={characterName}
        eyebrow={`Dialogue ${props.orderIndex}`}
        description={
          <div className="space-y-4">
            <p className="whitespace-pre-wrap text-slate-700">{props.item.text}</p>

            {issue ? <Notice kind="error">{issue}</Notice> : null}

            <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-800">
                Edit or delete dialogue entry
              </summary>

              <div className="mt-3 space-y-4">
                <DialogueDraftForm
                  allCharacters={props.allCharacters}
                  sceneCharacterIds={props.sceneCharacterIds}
                  submitLabel="Apply Dialogue Changes"
                  initial={{
                    ...props.item,
                    orderIndex: props.orderIndex
                  }}
                  onSubmit={(value) => props.onUpdate(props.item.id, value)}
                />

                <div className="border-t border-slate-200 pt-4">
                  <p className="text-sm text-slate-600">
                    Delete removes this dialogue row from the draft immediately.
                  </p>
                  <div className="mt-3 flex justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => props.onDelete(props.item.id)}
                    >
                      Delete Dialogue
                    </Button>
                  </div>
                </div>
              </div>
            </details>
          </div>
        }
        footer={
          <>
            <Pill>Order {props.orderIndex}</Pill>
            <Pill>{characterName}</Pill>
            {emotionLabel ? <Pill>{emotionLabel}</Pill> : null}
            {dressOptionLabels.map((label) => (
              <Pill key={label}>{label}</Pill>
            ))}
            {issue ? <Pill tone="warning">Needs review</Pill> : null}
          </>
        }
      />
    </div>
  );
}

export function SceneDraftEditor(props: SceneDraftEditorProps) {
  const router = useRouter();
  const charactersById = useMemo(
    () => new Map(props.characters.map((character) => [character.id, character])),
    [props.characters]
  );
  const backgroundImagesById = useMemo(
    () =>
      new Map(
        props.backgroundImages.map((backgroundImage) => [
          backgroundImage.id,
          backgroundImage
        ])
      ),
    [props.backgroundImages]
  );
  const [draft, setDraft] = useState(props.initialDraft);
  const [lastSyncedHash, setLastSyncedHash] = useState(
    getDraftHash(props.initialDraft)
  );
  const [hasPersistedDraft, setHasPersistedDraft] = useState(
    props.initialDraftLoaded
  );
  const [draftStatus, setDraftStatus] = useState<
    "idle" | "saving" | "saved" | "error"
  >("idle");
  const [draftError, setDraftError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [createResetVersion, setCreateResetVersion] = useState(0);
  const [isSavingScene, startSaveTransition] = useTransition();
  const [isDiscardingDraft, startDiscardTransition] = useTransition();
  const draftRef = useRef(draft);
  const latestSaveIdRef = useRef(0);
  const currentDraftHash = useMemo(() => getDraftHash(draft), [draft]);
  const hasDirtyDraft = currentDraftHash !== lastSyncedHash;
  const sceneReadiness =
    draft.dialogue.length === 0
      ? {
          label: "Incomplete",
          tone: "warning" as const,
          description:
            "Add at least one dialogue row before this scene can play in the reader."
        }
      : {
          label: "Playable",
          tone: "success" as const,
          description:
            "This scene is minimally playable in the current linear reader."
        };
  const currentBackgroundImage = backgroundImagesById.get(
    draft.scene.backgroundImageAssetId
  );
  const currentBackgroundImageUrl = toPublicStorageUrl(
    props.supabaseUrl,
    currentBackgroundImage?.filePath ?? null
  );
  const sceneCharacters = useMemo(
    () =>
      props.characters.filter((character) =>
        draft.scene.characterIds.includes(character.id)
      ),
    [draft.scene.characterIds, props.characters]
  );

  draftRef.current = draft;

  async function persistDraft(nextDraft: SceneDraftPayload) {
    const nextHash = getDraftHash(nextDraft);

    if (nextHash === lastSyncedHash) {
      return true;
    }

    const saveId = latestSaveIdRef.current + 1;
    latestSaveIdRef.current = saveId;
    setDraftStatus("saving");
    setDraftError(null);

    const result = await props.upsertDraftAction({
      chapterId: props.chapterId,
      sceneId: props.sceneId,
      sourceSceneUpdatedAt: props.initialSourceSceneUpdatedAt,
      payload: nextDraft
    });

    if (latestSaveIdRef.current !== saveId) {
      return result.ok;
    }

    if (!result.ok) {
      setDraftStatus("error");
      setDraftError(result.error);
      return false;
    }

    setLastSyncedHash(nextHash);
    setHasPersistedDraft(true);
    setDraftStatus("saved");
    return true;
  }

  useEffect(() => {
    if (!hasDirtyDraft) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      void persistDraft(draft);
    }, 600);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [draft, hasDirtyDraft]);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === "hidden" && getDraftHash(draftRef.current) !== lastSyncedHash) {
        void persistDraft(draftRef.current);
      }
    }

    function handlePageHide() {
      if (getDraftHash(draftRef.current) !== lastSyncedHash) {
        void persistDraft(draftRef.current);
      }
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, [lastSyncedHash]);

  function updateSceneField(
    field: keyof SceneDraftPayload["scene"],
    value: string | number | string[] | null
  ) {
    setActionError(null);
    setDraft((currentDraft) => ({
      ...currentDraft,
      scene: {
        ...currentDraft.scene,
        [field]: value
      }
    }));
  }

  function handleAddDialogueEntry(values: DialogueFormValues) {
    setActionError(null);
    setDraft((currentDraft) => ({
      ...currentDraft,
      dialogue: [
        ...currentDraft.dialogue,
        {
          id: createTempDialogueId(),
          speakerType: values.speakerType,
          characterId:
            values.speakerType === "character" ||
            values.speakerType === "dress_prompt"
              ? values.characterId
              : null,
          emotionKey: values.speakerType === "character" ? values.emotionKey : null,
          dressOptionKeys:
            values.speakerType === "dress_prompt"
              ? values.dressOptionKeys
              : [],
          text: values.text
        }
      ]
    }));
    setCreateResetVersion((value) => value + 1);
  }

  function handleUpdateDialogueEntry(entryId: string, values: DialogueFormValues) {
    setActionError(null);
    setDraft((currentDraft) => {
      const nextDialogue = currentDraft.dialogue.map((entry) =>
        entry.id === entryId
          ? {
              ...entry,
              speakerType: values.speakerType,
              characterId:
                values.speakerType === "character" ||
                values.speakerType === "dress_prompt"
                  ? values.characterId
                  : null,
              emotionKey:
                values.speakerType === "character" ? values.emotionKey : null,
              dressOptionKeys:
                values.speakerType === "dress_prompt"
                  ? values.dressOptionKeys
                  : [],
              text: values.text
            }
          : entry
      );

      return {
        ...currentDraft,
        dialogue: moveDialogueToOrder(
          nextDialogue,
          entryId,
          values.orderIndex ?? nextDialogue.length
        )
      };
    });
  }

  function handleDeleteDialogueEntry(entryId: string) {
    setActionError(null);
    setDraft((currentDraft) => ({
      ...currentDraft,
      dialogue: currentDraft.dialogue.filter((entry) => entry.id !== entryId)
    }));
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id) {
      return;
    }

    setActionError(null);
    setDraft((currentDraft) => {
      const oldIndex = currentDraft.dialogue.findIndex(
        (entry) => entry.id === active.id
      );
      const newIndex = currentDraft.dialogue.findIndex(
        (entry) => entry.id === over.id
      );

      if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
        return currentDraft;
      }

      return {
        ...currentDraft,
        dialogue: arrayMove(currentDraft.dialogue, oldIndex, newIndex)
      };
    });
  }

  function handleSaveScene() {
    startSaveTransition(() => {
      void (async () => {
        setActionError(null);
        setDraftError(null);
        const result = await props.saveSceneDraftAction({
          chapterId: props.chapterId,
          sceneId: props.sceneId,
          returnTo: props.returnTo,
          sourceSceneUpdatedAt: props.initialSourceSceneUpdatedAt,
          payload: draftRef.current
        });

        if (!result.ok) {
          setActionError(result.error);
          return;
        }

        router.replace(result.redirectTo);
        router.refresh();
      })();
    });
  }

  function handleDiscardDraft() {
    startDiscardTransition(() => {
      void (async () => {
        setActionError(null);
        const result = await props.discardSceneDraftAction({
          sceneId: props.sceneId,
          returnTo: props.returnTo
        });

        if (!result.ok) {
          setActionError(result.error);
          return;
        }

        router.replace(result.redirectTo);
        router.refresh();
      })();
    });
  }

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8
      }
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates
    })
  );

  return (
    <div className="space-y-6">
      {props.initialDraftLoaded ? (
        <Notice kind="success">
          Unsaved draft loaded. Scene updates stay in draft storage until you
          click <span className="font-medium">Save Scene</span>.
        </Notice>
      ) : null}

      {actionError ? <Notice kind="error">{actionError}</Notice> : null}
      {draftStatus === "error" && draftError ? (
        <Notice kind="error">{draftError}</Notice>
      ) : null}

      <SectionCard
        title="Scene Settings"
        description="Keep scene metadata here. Changes save as draft immediately and publish only when you save the scene."
      >
        <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
            {currentBackgroundImageUrl ? (
              <img
                src={currentBackgroundImageUrl}
                alt={
                  currentBackgroundImage?.altText ??
                  currentBackgroundImage?.label ??
                  draft.scene.title
                }
                className="aspect-video w-full object-cover"
              />
            ) : (
              <div className="flex aspect-video items-center justify-center text-sm text-slate-500">
                No background preview
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              <Pill>Order {draft.scene.orderIndex}</Pill>
              <Pill>
                {draft.dialogue.length === 1
                  ? "1 dialogue row"
                  : `${draft.dialogue.length} dialogue rows`}
              </Pill>
              <Pill>{draft.scene.characterIds.length} characters in cast</Pill>
              <Pill tone={sceneReadiness.tone}>{sceneReadiness.label}</Pill>
            </div>

            <p className="text-sm text-slate-600">{sceneReadiness.description}</p>

            <div className="grid gap-4 md:grid-cols-[1fr_140px]">
              <Field label="Scene Title" htmlFor="scene-draft-title">
                <TextInput
                  id="scene-draft-title"
                  value={draft.scene.title}
                  onChange={(event) =>
                    updateSceneField("title", event.target.value)
                  }
                />
              </Field>

              <Field
                label="Order"
                htmlFor="scene-draft-order"
                hint="1 is first in chapter order."
              >
                <TextInput
                  id="scene-draft-order"
                  type="number"
                  min={1}
                  step={1}
                  value={String(draft.scene.orderIndex)}
                  onChange={(event) =>
                    updateSceneField(
                      "orderIndex",
                      Number.parseInt(event.target.value, 10) || 0
                    )
                  }
                />
              </Field>
            </div>

            <Field label="Background Image" htmlFor="scene-draft-background-image">
              <SelectInput
                id="scene-draft-background-image"
                value={draft.scene.backgroundImageAssetId}
                onChange={(event) =>
                  updateSceneField("backgroundImageAssetId", event.target.value)
                }
              >
                {props.backgroundImages.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.label}
                  </option>
                ))}
              </SelectInput>
            </Field>

            <Field
              label="Background Music"
              htmlFor="scene-draft-background-music"
              hint="Optional."
            >
              <SelectInput
                id="scene-draft-background-music"
                value={draft.scene.backgroundMusicAssetId ?? ""}
                onChange={(event) =>
                  updateSceneField(
                    "backgroundMusicAssetId",
                    event.target.value || null
                  )
                }
              >
                <option value="">No music</option>
                {props.backgroundMusicTracks.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.label}
                  </option>
                ))}
              </SelectInput>
            </Field>

            <Field
              label="Scene Characters"
              htmlFor="scene-draft-character-pool"
              hint="These characters become available speakers for dialogue rows."
            >
              <div
                id="scene-draft-character-pool"
                className="grid gap-2 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-2"
              >
                {props.characters.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    No characters exist yet. Dialogue remains narrator-only
                    until characters are created.
                  </p>
                ) : (
                  props.characters.map((character) => (
                    <label
                      key={character.id}
                      className="flex items-center gap-2 text-sm text-slate-700"
                    >
                      <input
                        type="checkbox"
                        checked={draft.scene.characterIds.includes(character.id)}
                        onChange={(event) => {
                          const nextCharacterIds = event.target.checked
                            ? [...draft.scene.characterIds, character.id]
                            : draft.scene.characterIds.filter(
                                (item) => item !== character.id
                              );

                          updateSceneField("characterIds", nextCharacterIds);
                        }}
                        className="h-4 w-4 rounded border-slate-300 text-slate-900"
                      />
                      <span>{character.name}</span>
                    </label>
                  ))
                )}
              </div>
            </Field>
          </div>
        </div>
      </SectionCard>

      <SectionCard
        title="Create Dialogue Entry"
        description="Add the next dialogue row. New rows stay in the draft until you save the scene."
      >
        {sceneCharacters.length === 0 ? (
          <p className="text-sm text-slate-500">
            No scene characters are selected, so new dialogue entries will be
            narrator-only until the cast is expanded above.
          </p>
        ) : null}

        <DialogueDraftForm
          allCharacters={props.characters}
          sceneCharacterIds={draft.scene.characterIds}
          submitLabel="Add Dialogue Entry"
          resetVersion={createResetVersion}
          onSubmit={handleAddDialogueEntry}
        />
      </SectionCard>

      <section className="space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-semibold text-slate-950">Dialogue</h2>
          <p className="text-sm text-slate-600">
            Dialogue rows stay in draft order. Editing, deletion, and drag
            reorder are all local until the scene is saved.
          </p>
        </div>

        {draft.dialogue.length === 0 ? (
          <AdminEmptyState
            title="No Dialogue Yet"
            description="Create the first dialogue entry above."
          />
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={draft.dialogue.map((entry) => entry.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-4">
                {draft.dialogue.map((entry, index) => (
                  <SortableDialogueDraftCard
                    key={entry.id}
                    item={entry}
                    orderIndex={index + 1}
                    sceneCharacterIds={draft.scene.characterIds}
                    allCharacters={props.characters}
                    disabled={isSavingScene || isDiscardingDraft}
                    onUpdate={handleUpdateDialogueEntry}
                    onDelete={handleDeleteDialogueEntry}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
      </section>

      <SectionCard
        title="Save Changes"
        description="Draft saves are cheap and automatic. Only the button below publishes the scene back to authoring JSON and runtime."
      >
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="space-y-1 text-sm text-slate-600">
            {draftStatus === "saving" ? (
              <p>Saving draft...</p>
            ) : draftStatus === "saved" ? (
              <p>Draft saved.</p>
            ) : draftStatus === "error" ? (
              <p>Draft save failed.</p>
            ) : hasDirtyDraft ? (
              <p>Draft changes are pending.</p>
            ) : (
              <p>No unpublished draft changes.</p>
            )}
            <p>
              Saving the scene updates JSON and runtime once for this scene's
              chapter.
            </p>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              variant="outline"
              disabled={
                isDiscardingDraft || (!hasPersistedDraft && !hasDirtyDraft)
              }
              onClick={handleDiscardDraft}
            >
              {isDiscardingDraft ? "Discarding..." : "Discard Draft"}
            </Button>
            <Button type="button" disabled={isSavingScene} onClick={handleSaveScene}>
              {isSavingScene ? "Saving Scene..." : "Save Scene"}
            </Button>
          </div>
        </div>
      </SectionCard>
    </div>
  );
}
