"use client";

import { useActionState } from "react";
import { secondaryButton } from "../../ui";
import { addPracticeReports, clearPracticeReports, type ActionState } from "./actions";

export function PracticeControls() {
  const [added, add, adding] = useActionState<ActionState>(addPracticeReports, {});
  const [cleared, clear, clearing] = useActionState<ActionState>(clearPracticeReports, {});
  const note = adding || clearing ? null : (added.error ?? cleared.error ?? added.message ?? cleared.message);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form action={add}>
        <button type="submit" disabled={adding} className={secondaryButton}>
          {adding ? "Adding…" : "Add practice reports"}
        </button>
      </form>
      <form action={clear}>
        <button type="submit" disabled={clearing} className={secondaryButton}>
          {clearing ? "Clearing…" : "Clear practice reports"}
        </button>
      </form>
      {note && (
        <p role="status" className="text-sm text-muted">
          {note}
        </p>
      )}
    </div>
  );
}
