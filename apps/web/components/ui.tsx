import type { ReactNode } from "react";
import { Compass } from "lucide-react";
import { categories } from "@qayda/domain";
export function Field({
  name,
  label,
  type = "text",
  required = true,
  defaultValue,
  placeholder,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
}) {
  return (
    <label className="field">
      {label}
      <input
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        maxLength={type === "text" ? 500 : undefined}
      />
    </label>
  );
}
export function Artwork({
  category,
  large = false,
}: {
  category: string;
  large?: boolean;
}) {
  return (
    <div
      className={`artwork ${large ? "large" : ""} art-${categories.indexOf(category) % 3}`}
      role="img"
      aria-label="Авторская иллюстрация гор Казахстана"
    >
      <svg
        viewBox="0 0 600 320"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <circle cx="455" cy="70" r="36" fill="var(--sand)" />
        <path d="M0 280 180 50 350 280Z" fill="#9bb7ad" />
        <path d="m180 50-58 80 53-20 42 30Z" fill="#eff2e5" />
        <path d="M170 320 390 70 600 320Z" fill="#426e61" />
        <path d="m390 70-61 72 58-12 38 22Z" fill="#e5eadb" />
        <path d="M0 250 Q150 180 270 270 T600 225V320H0Z" fill="#254f45" />
        <path d="M200 320 Q400 260 330 230 Q500 270 390 320" fill="#a5c4bf" />
      </svg>
      <span>Иллюстрация · {category}</span>
    </div>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="empty">
      <Compass size={28} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
