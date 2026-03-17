"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";

import {
  type AdminLoginFormState,
  loginAdminAction
} from "@/app/admin/login/actions";
import { Button } from "@/components/ui/button";

const INITIAL_STATE: AdminLoginFormState = {
  error: null
};

function SubmitButton(props: { disabled?: boolean }) {
  const { pending } = useFormStatus();

  return (
    <Button type="submit" className="w-full" disabled={pending || props.disabled}>
      {pending ? "Checking..." : "Enter Admin"}
    </Button>
  );
}

export function AdminLoginForm(props: { disabled?: boolean }) {
  const [state, action] = useActionState(loginAdminAction, INITIAL_STATE);

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <label htmlFor="password" className="text-sm font-medium text-slate-800">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-slate-900 outline-none ring-slate-200 transition focus:ring-2"
          disabled={props.disabled}
          required
        />
      </div>

      {state.error ? (
        <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {state.error}
        </p>
      ) : null}

      <SubmitButton disabled={props.disabled} />
    </form>
  );
}
