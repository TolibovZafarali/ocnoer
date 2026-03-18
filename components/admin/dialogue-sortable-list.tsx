"use client";

import { useEffect, useState, useTransition } from "react";
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

import { AdminCard } from "@/components/admin/cards";
import { DialogueEntryForm } from "@/components/admin/dialogue-entry-form";
import { Notice, Pill } from "@/components/admin/forms";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type SceneCharacterOption = {
  id: string;
  name: string;
  emotions: Array<{
    key: string;
    label: string;
  }>;
};

type DialogueListItem = {
  id: string;
  orderIndex: number;
  speakerName: string;
  emotionLabel: string | null;
  text: string;
  speakerType: "narrator" | "character";
  characterId: string;
  emotionKey: string;
};

type ReorderActionResult = {
  ok: boolean;
  message?: string;
};

type DialogueSortableListProps = {
  chapterId: string;
  sceneId: string;
  returnTo: string;
  items: DialogueListItem[];
  sceneCharacters: SceneCharacterOption[];
  reorderAction: (formData: FormData) => Promise<ReorderActionResult>;
  updateAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
};

function getDialoguePreview(text: string) {
  return text.length > 220 ? `${text.slice(0, 217).trimEnd()}...` : text;
}

function SortableDialogueCard(props: {
  chapterId: string;
  sceneId: string;
  returnTo: string;
  item: DialogueListItem;
  sceneCharacters: SceneCharacterOption[];
  disabled: boolean;
  updateAction: (formData: FormData) => void | Promise<void>;
  deleteAction: (formData: FormData) => void | Promise<void>;
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

  return (
    <div ref={setNodeRef} style={style} className="relative">
      <button
        type="button"
        ref={setActivatorNodeRef}
        aria-label={`Drag to reorder ${props.item.speakerName} dialogue`}
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
        title={props.item.speakerName}
        eyebrow={`Dialogue ${props.item.orderIndex}`}
        description={
          <div className="space-y-4">
            <p className="whitespace-pre-wrap text-slate-700">
              {getDialoguePreview(props.item.text)}
            </p>

            <details className="rounded-xl border border-slate-200 bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-medium text-slate-800">
                Edit or delete dialogue entry
              </summary>

              <div className="mt-3 space-y-4">
                <DialogueEntryForm
                  action={props.updateAction}
                  chapterId={props.chapterId}
                  sceneId={props.sceneId}
                  returnTo={props.returnTo}
                  idPrefix={`dialogue-edit-${props.item.id}`}
                  submitLabel="Save Dialogue"
                  sceneCharacters={props.sceneCharacters}
                  initial={{
                    dialogueEntryId: props.item.id,
                    orderIndex: props.item.orderIndex,
                    text: props.item.text,
                    speakerType: props.item.speakerType,
                    characterId: props.item.characterId,
                    emotionKey: props.item.emotionKey
                  }}
                />

                <div className="border-t border-slate-200 pt-4">
                  <p className="text-sm text-slate-600">
                    Delete permanently removes this dialogue entry from the
                    scene order.
                  </p>
                  <form
                    action={props.deleteAction}
                    className="mt-3 flex justify-end"
                  >
                    <input
                      type="hidden"
                      name="chapterId"
                      value={props.chapterId}
                    />
                    <input type="hidden" name="sceneId" value={props.sceneId} />
                    <input
                      type="hidden"
                      name="dialogueEntryId"
                      value={props.item.id}
                    />
                    <input
                      type="hidden"
                      name="returnTo"
                      value={props.returnTo}
                    />
                    <Button type="submit" size="sm" variant="destructive">
                      Delete Dialogue
                    </Button>
                  </form>
                </div>
              </div>
            </details>
          </div>
        }
        footer={
          <>
            <Pill>Order {props.item.orderIndex}</Pill>
            <Pill>{props.item.speakerName}</Pill>
            {props.item.emotionLabel ? (
              <Pill>{props.item.emotionLabel}</Pill>
            ) : null}
          </>
        }
      />
    </div>
  );
}

export function DialogueSortableList(props: DialogueSortableListProps) {
  const router = useRouter();
  const [items, setItems] = useState(props.items);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
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

  useEffect(() => {
    setItems(props.items);
  }, [props.items]);

  async function persistReorder(input: {
    previousItems: DialogueListItem[];
    dialogueEntryId: string;
    targetOrderIndex: number;
  }) {
    setErrorMessage(null);

    const formData = new FormData();
    formData.set("chapterId", props.chapterId);
    formData.set("sceneId", props.sceneId);
    formData.set("dialogueEntryId", input.dialogueEntryId);
    formData.set("targetOrderIndex", String(input.targetOrderIndex));

    const result = await props.reorderAction(formData);

    if (!result.ok) {
      setItems(input.previousItems);
      setErrorMessage(
        result.message ?? "Unable to reorder dialogue right now."
      );
      return;
    }

    router.refresh();
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;

    if (!over || active.id === over.id || isPending) {
      return;
    }

    const currentItems = items;
    const oldIndex = currentItems.findIndex((item) => item.id === active.id);
    const newIndex = currentItems.findIndex((item) => item.id === over.id);

    if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
      return;
    }

    const reorderedItems = arrayMove(currentItems, oldIndex, newIndex).map(
      (item, index) => ({
        ...item,
        orderIndex: index + 1
      })
    );

    setItems(reorderedItems);
    startTransition(() => {
      void persistReorder({
        previousItems: currentItems,
        dialogueEntryId: String(active.id),
        targetOrderIndex: newIndex + 1
      });
    });
  }

  return (
    <div className="space-y-4">
      {errorMessage ? <Notice kind="error">{errorMessage}</Notice> : null}
      {isPending ? (
        <p className="text-sm text-slate-500">Saving dialogue order...</p>
      ) : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-4">
            {items.map((item) => (
              <SortableDialogueCard
                key={item.id}
                chapterId={props.chapterId}
                sceneId={props.sceneId}
                returnTo={props.returnTo}
                item={item}
                sceneCharacters={props.sceneCharacters}
                disabled={isPending}
                updateAction={props.updateAction}
                deleteAction={props.deleteAction}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
