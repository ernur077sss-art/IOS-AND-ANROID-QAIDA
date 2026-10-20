import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Qayda — открывай Казахстан со своими",
  description: "Места, впечатления и совместные планы в Казахстане",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
