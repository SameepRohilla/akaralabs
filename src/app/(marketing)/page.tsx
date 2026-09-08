import type { Metadata } from "next";
import LegacyPage from "@/components/LegacyPage";

export const metadata: Metadata = {
  title: { absolute: "Akara Labs — Giving form to ideas" },
  description: "A prototyping and product-engineering studio in India. CAD, 3D printing, and small-batch production for hardware founders, robotics, drones, IoT, defence and industrial clients — plus premium custom gifting.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "Akara Labs — Giving form to ideas",
    description: "A prototyping and product-engineering studio in India. CAD, 3D printing, and small-batch production for hardware founders, robotics, drones, IoT, defence and industrial clients — plus premium custom gifting.",
    url: "/",
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
      <LegacyPage name="home" />
    </>
  );
}
