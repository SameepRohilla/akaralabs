import type { Metadata } from "next";
import LegacyPage from "@/components/LegacyPage";

export const metadata: Metadata = {
  title: "3D printing request",
  description: "Send us your model and print requirements — material, quality, infill, colour and finish — and we'll quote your 3D print within 12 hours. Not sure of the settings? We'll recommend them.",
  alternates: { canonical: "/print/" },
  openGraph: {
    title: "3D printing request — Akara Labs",
    description: "Send us your model and print requirements — material, quality, infill, colour and finish — and we'll quote your 3D print within 12 hours. Not sure of the settings? We'll recommend them.",
    url: "/print/",
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
      <LegacyPage name="print" mainClass="print-main" />
    </>
  );
}
