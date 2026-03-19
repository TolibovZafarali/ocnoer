"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  type AdminRedirectActionState,
  createCharacterNavigationAction
} from "@/app/(admin)/admin/actions";
import { Field, Notice, TextArea, TextInput } from "@/components/admin/forms";
import { waitForRouteReady } from "@/components/admin/wait-for-route-ready";
import { Button } from "@/components/ui/button";

const INITIAL_STATE: AdminRedirectActionState = {
  error: null,
  redirectTo: null
};

function SubmitButton(props: { isOpening: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" disabled={pending || props.isOpening}>
      {pending
        ? "Creating..."
        : props.isOpening
          ? "Opening..."
          : "Create Character"}
    </Button>
  );
}

export function CreateCharacterForm() {
  const [isOpening, setIsOpening] = useState(false);
  const [state, action] = useActionState(
    createCharacterNavigationAction,
    INITIAL_STATE
  );

  useEffect(() => {
    if (!state.redirectTo) {
      setIsOpening(false);
      return;
    }

    const redirectTo = state.redirectTo;
    let cancelled = false;
    setIsOpening(true);

    void (async () => {
      const isReady = await waitForRouteReady(redirectTo);

      if (cancelled) {
        return;
      }

      window.location.assign(
        isReady
          ? redirectTo
          : "/admin/characters?status=success&message=Character+created."
      );
    })();

    return () => {
      cancelled = true;
    };
  }, [state.redirectTo]);

  useEffect(() => {
    if (state.error) {
      setIsOpening(false);
    }
  }, [state.error]);

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="returnTo" value="/admin/characters" />
      <input type="hidden" name="initialEmotionKey" value="default" />
      <input type="hidden" name="initialEmotionLabel" value="Default" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Field label="Character Name" htmlFor="character-name">
          <TextInput
            id="character-name"
            name="name"
            placeholder="Nora"
            required
          />
        </Field>

        <Field
          label="Default Emotion Image"
          htmlFor="character-image"
          hint="The first uploaded image becomes the default emotion."
        >
          <TextInput
            id="character-image"
            name="imageFile"
            type="file"
            accept="image/*"
            required
          />
        </Field>
      </div>

      <Field label="Bio" htmlFor="character-bio" hint="Optional.">
        <TextArea
          id="character-bio"
          name="bio"
          placeholder="Write a short character summary."
        />
      </Field>

      {state.error ? <Notice kind="error">{state.error}</Notice> : null}
      {isOpening ? (
        <Notice kind="success">
          Character created. Opening the new page as soon as it is ready.
        </Notice>
      ) : null}

      <div className="flex justify-end">
        <SubmitButton isOpening={isOpening} />
      </div>
    </form>
  );
}
