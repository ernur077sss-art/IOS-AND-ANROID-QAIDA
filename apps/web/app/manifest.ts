import type { MetadataRoute } from "next";
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Qayda — открываем Казахстан вместе",
    short_name: "Qayda",
    description: "Места и совместные планы с друзьями в Казахстане",
    start_url: "/",
    display: "standalone",
    lang: "ru",
    background_color: "#f7f9fa",
    theme_color: "#214e43",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
