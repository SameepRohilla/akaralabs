import type { Metadata } from "next";
import LegacyPage from "@/components/LegacyPage";

export const metadata: Metadata = {
  title: "About",
  description: "Akara Labs is a prototyping and product-engineering studio in India, founded by an engineer working across AI, IoT, robotics, drones and defence. आकара means form — the act of giving shape to what does not yet exist.",
  alternates: { canonical: "/about/" },
  openGraph: {
    title: "About — Akara Labs",
    description: "Akara Labs is a prototyping and product-engineering studio in India, founded by an engineer working across AI, IoT, robotics, drones and defence. आकара means form — the act of giving shape to what does not yet exist.",
    url: "/about/",
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
      <LegacyPage name="about" />
    </>
  );
}
