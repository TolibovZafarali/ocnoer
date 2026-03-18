"use client";

import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";

import { Button } from "@/components/ui/button";

type SceneCharacterOption = {
  id: string;
  name: string;
  emotions: Array<{
    key: string;
    label: string;
  }>;
};

type DialogueEntryFormProps = {
  action: (formData: FormData) => void | Promise<void>;
  chapterId: string;
  sceneId: string;
  returnTo: string;
  idPrefix?: string;
  submitLabel: string;
  sceneCharacters: SceneCharacterOption[];
  initial?: {
    dialogueEntryId?: string;
    orderIndex: number;
    text: string;
    speakerType: "narrator" | "character";
    characterId: string;
    emotionKey: string;
  };
};

function SubmitButton(props: { label: string }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving..." : props.label}
    </Button>
  );
}

export function DialogueEntryForm(props: DialogueEntryFormProps) {
  const firstCharacter = props.sceneCharacters[0] ?? null;
  const isEditMode = Boolean(props.initial?.dialogueEntryId);
  const prefix =
    props.idPrefix ??
    `dialogue-${props.sceneId}-${props.initial?.dialogueEntryId ?? "new"}`;
  const orderId = `${prefix}-order`;
  const speakerTypeId = `${prefix}-speaker-type`;
  const characterIdField = `${prefix}-character`;
  const emotionKeyId = `${prefix}-emotion`;
  const textId = `${prefix}-text`;
  const [speakerType, setSpeakerType] = useState<"narrator" | "character">(
    props.initial?.speakerType ?? "narrator"
  );
  const [characterId, setCharacterId] = useState(
    props.initial?.characterId || firstCharacter?.id || ""
  );
  const character = useMemo(
    () => props.sceneCharacters.find((item) => item.id === characterId) ?? null,
    [characterId, props.sceneCharacters]
  );
  const [emotionKey, setEmotionKey] = useState(
    props.initial?.emotionKey || firstCharacter?.emotions[0]?.key || ""
  );

  useEffect(() => {
    if (speakerType === "narrator") {
      return;
    }

    if (!character && firstCharacter) {
      setCharacterId(firstCharacter.id);
      setEmotionKey(firstCharacter.emotions[0]?.key ?? "");
      return;
    }

    if (
      character &&
      emotionKey &&
      character.emotions.some((item) => item.key === emotionKey)
    ) {
      return;
    }

    setEmotionKey(character?.emotions[0]?.key ?? "");
  }, [character, emotionKey, firstCharacter, speakerType]);

  return (
    <form
      action={props.action}
      className="space-y-4 rounded-2xl border border-slate-200 bg-slate-50/70 p-4"
    >
      <input type="hidden" name="chapterId" value={props.chapterId} />
      <input type="hidden" name="sceneId" value={props.sceneId} />
      <input type="hidden" name="returnTo" value={props.returnTo} />
      {props.initial?.dialogueEntryId ? (
        <input
          type="hidden"
          name="dialogueEntryId"
          value={props.initial.dialogueEntryId}
        />
      ) : null}

      <div
        className={`grid gap-4 ${
          speakerType === "character"
            ? "md:grid-cols-[140px_1fr]"
            : "md:grid-cols-[180px_1fr]"
        }`}
      >
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-slate-800"
            htmlFor={speakerTypeId}
          >
            Speaker
          </label>
          <select
            id={speakerTypeId}
            name="speakerType"
            value={speakerType}
            onChange={(event) =>
              setSpeakerType(event.target.value as "narrator" | "character")
            }
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:ring-2"
          >
            <option value="narrator">Narrator</option>
            {props.sceneCharacters.length > 0 ? (
              <option value="character">Character</option>
            ) : null}
          </select>
        </div>

        {speakerType === "character" ? (
          <div className="space-y-2">
            <label
              className="text-sm font-medium text-slate-800"
              htmlFor={characterIdField}
            >
              Scene Character
            </label>
            <select
              id={characterIdField}
              name="characterId"
              value={characterId}
              onChange={(event) => setCharacterId(event.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:ring-2"
              required
            >
              {props.sceneCharacters.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <input type="hidden" name="characterId" value="" />
        )}
      </div>

      {speakerType === "character" ? (
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-slate-800"
            htmlFor={emotionKeyId}
          >
            Emotion
          </label>
          <select
            id={emotionKeyId}
            name="emotionKey"
            value={emotionKey}
            onChange={(event) => setEmotionKey(event.target.value)}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:ring-2"
            required
          >
            {(character?.emotions ?? []).map((emotion) => (
              <option key={emotion.key} value={emotion.key}>
                {emotion.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input type="hidden" name="emotionKey" value="" />
      )}

      {isEditMode ? (
        <div className="space-y-2">
          <label
            className="text-sm font-medium text-slate-800"
            htmlFor={orderId}
          >
            Order
          </label>
          <input
            id={orderId}
            name="orderIndex"
            type="number"
            min={1}
            step={1}
            defaultValue={props.initial?.orderIndex}
            className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:ring-2"
            required
          />
          <p className="text-xs text-slate-500">1 is first in scene order.</p>
        </div>
      ) : null}

      <div className="space-y-2">
        <label className="text-sm font-medium text-slate-800" htmlFor={textId}>
          Dialogue Text
        </label>
        <textarea
          id={textId}
          name="text"
          defaultValue={props.initial?.text ?? ""}
          rows={5}
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none ring-slate-200 transition focus:ring-2"
          required
        />
      </div>

      <div className="flex justify-end">
        <SubmitButton label={props.submitLabel} />
      </div>
    </form>
  );
}
