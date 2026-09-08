"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveArticle } from "@/lib/actions/admin";

type Draft = {
  id?: string;
  title: string;
  subtitle: string;
  slug: string;
  bodyMd: string;
  excerpt: string;
  tags: string;
  access: "public" | "members" | "clients";
  status: "draft" | "published" | "archived";
};

const EMPTY: Draft = {
  title: "",
  subtitle: "",
  slug: "",
  bodyMd: "",
  excerpt: "",
  tags: "",
  access: "public",
  status: "draft",
};

const ACCESS_HELP: Record<Draft["access"], string> = {
  public: "Anyone can read it. Best for the pieces you want found.",
  members: "First quarter is public as a teaser; the rest needs a free account.",
  clients: "Only people who've had a job through the workshop can read it.",
};

export default function ArticleEditor({ article }: { article: Draft | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<Draft>(article ?? EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const words = draft.bodyMd.trim().split(/\s+/).filter(Boolean).length;

  function set<K extends keyof Draft>(key: K, value: Draft[K]) {
    setDraft((d) => ({ ...d, [key]: value }));
    setSaved(false);
  }

  function submit(status: Draft["status"]) {
    setError(null);
    startTransition(async () => {
      const res = await saveArticle({ ...draft, status });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      setDraft((d) => ({ ...d, status, slug: res.slug ?? d.slug }));
      if (!draft.id) router.push("/admin/articles");
      else router.refresh();
    });
  }

  return (
    <div className="split">
      <div className="panel">
        {error ? (
          <div className="notice notice-err" style={{ marginBottom: 16 }}>
            {error}
          </div>
        ) : null}

        <label className="field">
          <span className="lbl">Title</span>
          <input
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="Why our first CF-Nylon bracket warped, and the fix"
            style={{ fontSize: 17 }}
          />
        </label>

        <label className="field">
          <span className="lbl">Standfirst</span>
          <input
            value={draft.subtitle}
            onChange={(e) => set("subtitle", e.target.value)}
            placeholder="One line under the headline. Optional."
          />
        </label>

        <label className="field">
          <span className="lbl">Body — Markdown</span>
          <textarea
            value={draft.bodyMd}
            onChange={(e) => set("bodyMd", e.target.value)}
            placeholder={"## What happened\n\nThe part came off the plate with a 2 mm lift at one corner…\n\n- chamber at 45°C\n- brim, 8 mm\n\n> The fix was slowing the first layer, not more adhesive."}
            style={{ minHeight: 460, fontFamily: "var(--font-mono)", fontSize: 13.5, lineHeight: 1.7 }}
          />
          <span className="hint">
            {words} words · about {Math.max(1, Math.round(words / 200))} min read. Headings,
            lists, quotes, code, tables and images all work. HTML is stripped.
          </span>
        </label>
      </div>

      <aside className="stack">
        <div className="panel">
          <div className="panel-head">
            <h3>Publishing</h3>
          </div>

          <label className="field">
            <span className="lbl">Who can read it</span>
            <select value={draft.access} onChange={(e) => set("access", e.target.value as Draft["access"])}>
              <option value="public">Public</option>
              <option value="members">Members — free account</option>
              <option value="clients">Clients only</option>
            </select>
            <span className="hint">{ACCESS_HELP[draft.access]}</span>
          </label>

          <label className="field">
            <span className="lbl">Web address</span>
            <input
              value={draft.slug}
              onChange={(e) => set("slug", e.target.value)}
              placeholder="auto from the title"
              style={{ fontFamily: "var(--font-mono)", fontSize: 13 }}
            />
            <span className="hint">
              Leave blank on a new piece. Changing it later breaks existing links.
            </span>
          </label>

          <label className="field">
            <span className="lbl">Tags</span>
            <input
              value={draft.tags}
              onChange={(e) => set("tags", e.target.value)}
              placeholder="materials, build log, CF-Nylon"
            />
            <span className="hint">Comma separated, up to 8.</span>
          </label>

          <label className="field">
            <span className="lbl">Excerpt</span>
            <textarea
              value={draft.excerpt}
              onChange={(e) => set("excerpt", e.target.value)}
              placeholder="Left blank, we take the opening lines."
              style={{ minHeight: 80 }}
              maxLength={400}
            />
          </label>

          <div className="row" style={{ marginTop: 4 }}>
            <button className="btn btn-primary btn-sm" disabled={pending || !draft.title.trim()} onClick={() => submit("published")}>
              {pending ? "Saving…" : draft.status === "published" ? "Update live" : "Publish"}
            </button>
            <button className="btn btn-ghost btn-sm" disabled={pending || !draft.title.trim()} onClick={() => submit("draft")}>
              Save draft
            </button>
            {draft.id && draft.status !== "archived" ? (
              <button className="btn btn-ghost btn-sm btn-danger" disabled={pending} onClick={() => submit("archived")}>
                Archive
              </button>
            ) : null}
          </div>

          {saved ? (
            <p style={{ color: "#7FC79B", fontSize: 13, marginTop: 12, marginBottom: 0 }}>
              ✓ Saved as {draft.status}
            </p>
          ) : null}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <h3>Attachments</h3>
              <p className="ph-sub">Downloadables — STLs, calibration files, cheat sheets.</p>
            </div>
          </div>
          <p style={{ fontSize: 13.5, color: "var(--ink-faint)", margin: 0, lineHeight: 1.6 }}>
            {draft.id
              ? "Coming in the next pass — for now, link files from the body and they inherit the article's access level."
              : "Save the piece first, then attachments can be added."}
          </p>
        </div>
      </aside>
    </div>
  );
}
