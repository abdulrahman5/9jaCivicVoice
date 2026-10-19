import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "CivicVoice",
    short_name: "CivicVoice",
    description: "Report public service failures in Lagos and Abuja.",
    start_url: "/",
    display: "standalone",
    background_color: "#fafaf7",
    theme_color: "#0f6b47",
    icons: [],
  };
}
