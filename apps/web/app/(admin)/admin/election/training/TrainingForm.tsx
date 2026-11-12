"use client";

import { useActionState } from "react";
import { primaryButton } from "../../../ui";
import { submitTraining, type TrainingState } from "../actions";

export function TrainingForm({ questions }: { questions: { id: string; question: string; options: string[] }[] }) {
  const [state, action, pending] = useActionState<TrainingState, FormData>(submitTraining, {});
  const wrong = new Map(state.wrong?.map((w) => [w.id, w.why]));
  return (
    <form action={action} className="flex flex-col gap-5">
      {state.wrong && (
        <p role="alert" className="rounded-lg bg-[var(--cv-status-ack-bg)] p-3 text-sm text-[var(--cv-status-ack-fg)]">
          {state.wrong.length} answer{state.wrong.length > 1 ? "s" : ""} not right yet. Read the notes below and try again.
        </p>
      )}
      {questions.map((q, n) => (
        <fieldset key={q.id} className="flex flex-col gap-2 rounded-card border border-line bg-surface p-4">
          <legend className="px-1 text-[15px] font-semibold">
            {n + 1}. {q.question}
          </legend>
          {q.options.map((option, i) => (
            <label key={i} className="flex items-start gap-2 text-[15px]">
              <input
                type="radio"
                name={`q:${q.id}`}
                value={i}
                required
                defaultChecked={state.answers?.[q.id] === String(i)}
                key={`${q.id}-${i}-${state.answers?.[q.id]}`}
                className="mt-1 size-4"
              />
              {option}
            </label>
          ))}
          {wrong.has(q.id) && <p className="text-sm text-[var(--cv-status-ack-fg)]">Not quite. {wrong.get(q.id)}</p>}
        </fieldset>
      ))}
      <button type="submit" disabled={pending} className={primaryButton}>
        {pending ? "Checking…" : "Check my answers"}
      </button>
    </form>
  );
}
