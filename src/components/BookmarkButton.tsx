"use client";

import { useState } from "react";

export default function BookmarkButton({
  articleId,
  initial,
}: {
  articleId: string;
  initial: boolean;
}) {
  const [saved, setSaved] = useState(initial);
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      className="btn btn-ghost btn-sm"
      disabled={busy}
      aria-pressed={saved}
      onClick={async () => {
        setBusy(true);
        // Optimistic — a bookmark toggle should feel instant.
        const next = !saved;
        setSaved(next);

        const res = await fetch("/api/articles/bookmark", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ articleId, saved: next }),
        });
        if (!res.ok) setSaved(!next);
        setBusy(false);
      }}
    >
      {saved ? "★ Saved" : "☆ Save for later"}
    </button>
  );
}
