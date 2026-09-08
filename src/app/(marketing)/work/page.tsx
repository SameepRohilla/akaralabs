import type { Metadata } from "next";
import LegacyPage from "@/components/LegacyPage";

export const metadata: Metadata = {
  title: "Work",
  description: "Selected prototyping and production work from Akara Labs — drone frames, robotic grippers, IoT enclosures, industrial parts, defence housings and custom gifting.",
  alternates: { canonical: "/work/" },
  openGraph: {
    title: "Work — Akara Labs",
    description: "Selected prototyping and production work from Akara Labs — drone frames, robotic grippers, IoT enclosures, industrial parts, defence housings and custom gifting.",
    url: "/work/",
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
      <LegacyPage name="work" />
    </>
  );
}
