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
  return (
    <label className="field">
      {label}
      <input
        id={name}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? `${name}-help` : undefined}
        name={name}
        type={type}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        maxLength={type === "text" ? 500 : undefined}
      />
      {(error || hint) && (
        <small
          id={`${name}-help`}
          className={error ? "field-error" : "muted"}
          role={error ? "alert" : undefined}
        >
          {error || hint}
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
  const key = photoKey ?? listingPhoto(listingId);
  const photo = key ? photos[key] : undefined;
  return (
    <div className={`place-photo ${large ? "large" : ""}`}>
      {photo && key ? (
        <Image
          src={`/photos/${key}-20261020.jpg`}
          alt={photo.alt}
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
          <span>Здесь будет фото места</span>
        </div>
      )}
      {category && <span className="photo-category">{category}</span>}
    </div>
  );
}
export function PhotoCredit({ listingId }: { listingId: string }) {
  const key = listingPhoto(listingId);
  if (!key) return null;
  return (
    <p className="photo-credit">
      Фото: {photos[key].author} · <a href="/photos">Авторы и лицензии</a>
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
  return (
    <div className="empty">
      <Compass size={28} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
