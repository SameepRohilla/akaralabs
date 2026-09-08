import type { Metadata } from "next";
import LegacyPage from "@/components/LegacyPage";

export const metadata: Metadata = {
  title: "Start a project",
  description: "Tell us what you're making. Upload a file or describe the idea — we'll come back with a quote and a plan within 12 hours.",
  alternates: { canonical: "/start/" },
  openGraph: {
    title: "Start a project — Akara Labs",
    description: "Tell us what you're making. Upload a file or describe the idea — we'll come back with a quote and a plan within 12 hours.",
    url: "/start/",
  },
};

export default function Page() {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: 'document.documentElement.setAttribute("data-hero","layers")',
        }}
      />
      <LegacyPage name="start" mainClass="start-main" />
    </>
  );
}
