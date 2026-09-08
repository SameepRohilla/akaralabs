import { requireStaff } from "@/lib/guard";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireStaff("/admin");
  return <>{children}</>;
}
