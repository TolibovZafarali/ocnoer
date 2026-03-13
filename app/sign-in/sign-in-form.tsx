"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  signInWithPasswordOnly,
  type SignInFormState
} from "@/app/sign-in/actions";
import { Button } from "@/components/ui/button";

const initialSignInFormState: SignInFormState = {
  error: null
};

function SubmitButton() {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Signing in..." : "Sign in"}
    </Button>
  );
}

type SignInFormProps = {
  initialError: string | null;
};

export function SignInForm({ initialError }: SignInFormProps) {
  const [state, formAction] = useActionState<SignInFormState, FormData>(
    signInWithPasswordOnly,
    {
      ...initialSignInFormState,
      error: initialError
    }
  );

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-slate-800">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none ring-slate-300 transition focus:ring-2"
          required
        />
      </div>

      {state.error ? (
        <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}

      <SubmitButton />
    </form>
  );
}
