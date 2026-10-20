"use client";
import { usePreferences } from "./Preferences";
import type { ReactNode } from "react";
import Image from "next/image";
import { Compass, Camera } from "lucide-react";
import { photos, listingPhoto, type PhotoKey } from "@qayda/domain";
export function Field({
  name,
  label,
  type = "text",
  required = true,
  defaultValue,
  placeholder,
  hint,
  error,
}: {
  name: string;
  label: string;
  type?: string;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
}) {
  const { t } = usePreferences();
  return (
    <label className="field">
      {t(label)}
      <input
        id={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${name}-help` : undefined}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder ? t(placeholder) : undefined}
        maxLength={type === "text" ? 500 : undefined}
      />
      {(error || hint) && (
        <small
          id={`${name}-help`}
          className={error ? "field-error" : "muted"}
          role={error ? "alert" : undefined}
        >
          {t(error || hint || "")}
        </small>
      )}
    </label>
  );
}
export function Photo({
  category,
  listingId,
  photoKey,
  large = false,
  eager = false,
}: {
  category?: string;
  listingId?: string;
  photoKey?: PhotoKey;
  large?: boolean;
  eager?: boolean;
}) {
  const { t } = usePreferences();
  const key = photoKey ?? listingPhoto(listingId);
  const photo = key ? photos[key] : undefined;
  return (
    <div className={`place-photo ${large ? "large" : ""}`}>
      {photo && key ? (
        <Image
          src={`/photos/${key}-20261020.jpg`}
          alt={t(photo.alt)}
          fill
          sizes={
            large
              ? "(max-width: 700px) 100vw, 1280px"
              : "(max-width: 600px) 100vw, (max-width: 900px) 50vw, 33vw"
          }
          loading={eager ? "eager" : "lazy"}
          style={{ objectFit: "cover" }}
        />
      ) : (
        <div className="photo-pending">
          <Camera size={30} />
          <span>{t("Здесь будет фото места")}</span>
        </div>
      )}
      {category && <span className="photo-category">{t(category)}</span>}
    </div>
  );
}
export function PhotoCredit({ listingId }: { listingId: string }) {
  const { t } = usePreferences();
  const key = listingPhoto(listingId);
  if (!key) return null;
  return (
    <p className="photo-credit">
      {" "}
      {t("Фото:")} {t(photos[key].author)} ·{" "}
      <a href="/photos">{t("Авторы и лицензии")}</a>
    </p>
  );
}
export function Empty({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  const { t } = usePreferences();
  return (
    <div className="empty">
      <Compass size={28} />
      <h3>{t(title)}</h3>
      <p>{children}</p>
    </div>
  );
}
