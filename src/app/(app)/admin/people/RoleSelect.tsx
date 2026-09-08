"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setUserRole } from "@/lib/actions/admin";

export default function RoleSelect({
  userId,
  role,
  isSelf,
}: {
  userId: string;
  role: "customer" | "staff" | "admin";
  isSelf: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <select
        className="inp"
        defaultValue={role}
        disabled={pending}
        style={{ width: "auto", padding: "5px 8px", fontSize: 12.5 }}
        onChange={(e) => {
          const next = e.target.value;
          const target = e.target;
          setError(null);
          const fd = new FormData();
          fd.set("userId", userId);
          fd.set("role", next);

          startTransition(async () => {
            const res = await setUserRole(fd);
            if (!res.ok) {
              setError(res.error);
              target.value = role;
              return;
            }
            router.refresh();
          });
        }}
      >
        <option value="customer">customer</option>
        <option value="staff">staff</option>
        <option value="admin">admin</option>
      </select>
      {isSelf ? (
        <span style={{ display: "block", fontSize: 11, color: "var(--ink-faint)", marginTop: 3 }}>
          that&apos;s you
        </span>
      ) : null}
      {error ? (
        <span style={{ display: "block", fontSize: 11.5, color: "#D98A80", marginTop: 4, maxWidth: 160 }}>
          {error}
        </span>
      ) : null}
    </>
  );
}
