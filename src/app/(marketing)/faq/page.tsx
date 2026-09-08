import type { Metadata } from "next";
import LegacyPage from "@/components/LegacyPage";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Answers on files, materials, minimum quantities, lead times, shipping, payment and IP — everything you might want to know before starting a project with Akara Labs.",
  alternates: { canonical: "/faq/" },
  openGraph: {
    title: "FAQ — Akara Labs",
    description: "Answers on files, materials, minimum quantities, lead times, shipping, payment and IP — everything you might want to know before starting a project with Akara Labs.",
    url: "/faq/",
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
      <LegacyPage name="faq" />
    </>
  );
}
