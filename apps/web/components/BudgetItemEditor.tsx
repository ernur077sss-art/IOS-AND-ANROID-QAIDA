"use client";
import { useState, type FormEvent } from "react";
import { api, humanError, type Client } from "@qayda/api-client";
import type { BudgetItem } from "@qayda/domain";
export function BudgetItemEditor({
  db,
  planId,
  version,
  item,
  onSaved,
}: {
  db: Client;
  planId: string;
  version: number;
  item: BudgetItem;
  onSaved: () => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const value = BigInt(item.amount_minor);
  return (
    <details className="budget-editor">
      <summary>Изменить статью</summary>
      <form
        onSubmit={async (e: FormEvent<HTMLFormElement>) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          setBusy(true);
          setError("");
          try {
            const { parseMoney } = await import("@qayda/domain");
            await api.editBudget(
              db,
              planId,
              version,
              item.id,
              String(data.get("title")),
              parseMoney(String(data.get("amount"))).toString(),
              String(data.get("kind")),
            );
            await onSaved();
          } catch (e) {
            setError(humanError(e));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field">
          Название статьи
          <input
            name="title"
            required
            maxLength={100}
            defaultValue={item.title}
          />
        </label>
        <label className="field">
          Новая сумма, ₸
          <input
            name="amount"
            required
            inputMode="decimal"
            defaultValue={`${value / 100n}.${String(value % 100n).padStart(2, "0")}`}
          />
        </label>
        <label className="field">
          Распределение
          <select name="kind" defaultValue={item.cost_kind}>
            <option value="shared">На всех</option>
            <option value="per_person">На человека</option>
          </select>
        </label>
        {error && <p role="alert">{error}</p>}
        <button disabled={busy}>Сохранить статью</button>
      </form>
    </details>
  );
}
