import type { Metadata } from "next";
import LegacyPage from "@/components/LegacyPage";

export const metadata: Metadata = {
  title: "Materials guide",
  description: "A plain-English guide to the polymers and resins Akara Labs prints — what each is, what it's best for, and how to choose. You don't need to know these going in; we'll recommend.",
  alternates: { canonical: "/materials/" },
  openGraph: {
    title: "Materials guide — Akara Labs",
    description: "A plain-English guide to the polymers and resins Akara Labs prints — what each is, what it's best for, and how to choose. You don't need to know these going in; we'll recommend.",
    url: "/materials/",
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
      <LegacyPage name="materials" />
    </>
  );
}
