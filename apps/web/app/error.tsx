"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main>
      <h1>Не удалось открыть страницу</h1>
      <p>Ваши сохранённые планы остаются в аккаунте.</p>
      <button onClick={reset}>Повторить</button>
    </main>
  );
}
