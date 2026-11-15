"use client";

import { startTransition, useActionState, useEffect, useRef } from "react";
import type { FormState } from "@/app/actions";

/**
 * Wraps a server action form and shows its error/ok message.
 * Submits manually so input is kept on error; clears fields only on success.
 */
export default function StatefulForm({
  action, children, className, submitLabel, resetOnOk = true,
}: {
  action: (prev: FormState, fd: FormData) => Promise<FormState>;
  children: React.ReactNode;
  className?: string;
  submitLabel: string;
  resetOnOk?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok && resetOnOk) ref.current?.reset();
  }, [state, resetOnOk]);
  return (
    <form
      ref={ref}
      className={className ?? "space-y-3"}
      onSubmit={(e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        startTransition(() => formAction(fd));
      }}
    >
      {children}
      {state?.error && <p role="alert" className="rounded-xl bg-red-50 p-2 text-sm text-red-700">{state.error}</p>}
      {state?.ok && state.ok !== "sent" && <p className="rounded-xl bg-ocean-100 p-2 text-sm text-ocean">{state.ok}</p>}
      <button className="btn-ocean" disabled={pending}>{pending ? "…" : submitLabel}</button>
    </form>
  );
}
