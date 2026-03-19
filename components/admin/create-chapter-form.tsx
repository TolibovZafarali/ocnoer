"use client";

import { useActionState, useEffect, useState } from "react";
import { useFormStatus } from "react-dom";

import {
  type AdminRedirectActionState,
  createChapterNavigationAction
} from "@/app/(admin)/admin/actions";
import { Field, Notice, TextInput } from "@/components/admin/forms";
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
          : "Create Chapter"}
    </Button>
  );
}

export function CreateChapterForm() {
  const [isOpening, setIsOpening] = useState(false);
  const [state, action] = useActionState(
    createChapterNavigationAction,
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
          : "/admin/chapters?status=success&message=Chapter+created."
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
      <input type="hidden" name="returnTo" value="/admin/chapters" />

      <Field
        label="Chapter Title"
        htmlFor="chapter-title"
        hint="New chapters redirect to their scenes page after save."
      >
        <TextInput
          id="chapter-title"
          name="title"
          placeholder="Chapter 1: Arrival"
          required
        />
      </Field>

      {state.error ? <Notice kind="error">{state.error}</Notice> : null}
      {isOpening ? (
        <Notice kind="success">
          Chapter created. Opening the new page as soon as it is ready.
        </Notice>
      ) : null}

      <div className="flex justify-end">
        <SubmitButton isOpening={isOpening} />
      </div>
    </form>
  );
}
