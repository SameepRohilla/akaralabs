"use server";

import { revalidatePath } from "next/cache";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  requests,
  requestEvents,
  quotes,
  quoteItems,
  auditLog,
  articles,
  printers,
  spools,
  printJobs,
  users,
  type RequestStage,
} from "@/db/schema";
import { requireStaff, requireAdmin } from "@/lib/guard";
import { allowedTransitions, STAGE_META, stageLabel } from "@/lib/stages";
import { notifyStageChange, notifyQuoteSent } from "@/lib/notify";
import { quoteTotals, formatINR, paise } from "@/lib/money";
import { slugify } from "@/lib/ids";
import { readingMinutes, autoExcerpt } from "@/lib/markdown";
import { addWorkingDays } from "@/lib/dates";

/* Server actions for the studio side. Every one re-checks the role — an
   action is a public endpoint, and the sidebar not showing a button is not
   an access control. */

type Result = { ok: true } | { ok: false; error: string };

async function audit(
  actorId: string,
  action: string,
  entity: string,
  entityId: string,
  after?: unknown,
) {
  await db.insert(auditLog).values({ actorId, action, entity, entityId, after: after ?? null });
}

/* ---- Requests ---------------------------------------------------------- */

const stageSchema = z.object({
  requestId: z.string().min(1),
  stage: z.enum([
    "received", "in_review", "quoted", "approved",
    "in_production", "quality_check", "shipped", "completed", "on_hold", "cancelled",
  ]),
  note: z.string().trim().max(2000).optional(),
  notify: z.coerce.boolean().default(true),
});

export async function setStage(formData: FormData): Promise<Result> {
  const session = await requireStaff();
  const input = stageSchema.parse({
    requestId: formData.get("requestId"),
    stage: formData.get("stage"),
    note: formData.get("note") || undefined,
    notify: formData.get("notify") === "on" || formData.get("notify") === "true",
  });

  const [request] = await db.select().from(requests).where(eq(requests.id, input.requestId)).limit(1);
  if (!request) return { ok: false, error: "Request not found" };

  if (request.stage === input.stage) return { ok: false, error: "Already at that stage" };
  if (!allowedTransitions(request.stage).includes(input.stage)) {
    return {
      ok: false,
      error: `Can't go from ${STAGE_META[request.stage].label} to ${STAGE_META[input.stage].label}.`,
    };
  }

  const now = new Date();
  await db.transaction(async (tx) => {
    await tx
      .update(requests)
      .set({
        stage: input.stage,
        updatedAt: now,
        closedAt: input.stage === "completed" || input.stage === "cancelled" ? now : null,
      })
      .where(eq(requests.id, request.id));

    await tx.insert(requestEvents).values({
      requestId: request.id,
      stage: input.stage,
      kind: "stage",
      title: stageLabel(input.stage, request.kind),
      note: input.note || null,
      isPublic: true,
      actorId: session.user.id,
    });
  });

  if (input.notify) await notifyStageChange(request, input.stage, input.note);
  await audit(session.user.id, "request.stage", "request", request.id, { stage: input.stage });

  revalidatePath(`/admin/requests/${request.reference}`);
  revalidatePath("/admin");
  return { ok: true };
}

const requestMetaSchema = z.object({
  requestId: z.string().min(1),
  internalNotes: z.string().max(5000).optional(),
  assigneeId: z.string().optional(),
  priority: z.coerce.number().int().min(0).max(3).default(0),
  promisedAt: z.string().optional(),
  title: z.string().max(200).optional(),
});

export async function updateRequestMeta(formData: FormData): Promise<Result> {
  const session = await requireStaff();
  const input = requestMetaSchema.parse({
    requestId: formData.get("requestId"),
    internalNotes: formData.get("internalNotes") ?? undefined,
    assigneeId: formData.get("assigneeId") ?? undefined,
    priority: formData.get("priority") ?? 0,
    promisedAt: formData.get("promisedAt") ?? undefined,
    title: formData.get("title") ?? undefined,
  });

  await db
    .update(requests)
    .set({
      internalNotes: input.internalNotes ?? null,
      assigneeId: input.assigneeId || null,
      priority: input.priority,
      promisedAt: input.promisedAt ? new Date(input.promisedAt) : null,
      title: input.title || null,
      updatedAt: new Date(),
    })
    .where(eq(requests.id, input.requestId));

  await audit(session.user.id, "request.update", "request", input.requestId, input);
  revalidatePath("/admin");
  return { ok: true };
}

/* ---- Quotes ------------------------------------------------------------ */

const quoteItemSchema = z.object({
  description: z.string().trim().min(1),
  detail: z.string().trim().max(300).optional(),
  quantity: z.coerce.number().min(0.001).max(100000),
  unit: z.string().trim().max(20).default("nos"),
  unitPriceRupees: z.coerce.number().min(0).max(100000000),
});

const quoteSchema = z.object({
  requestId: z.string().min(1),
  items: z.array(quoteItemSchema).min(1, "A quote needs at least one line"),
  discountRupees: z.coerce.number().min(0).default(0),
  shippingRupees: z.coerce.number().min(0).default(0),
  taxRate: z.coerce.number().min(0).max(50).default(18),
  leadTimeDays: z.coerce.number().int().min(0).max(365).optional(),
  notes: z.string().max(3000).optional(),
  validDays: z.coerce.number().int().min(1).max(365).default(14),
  send: z.boolean().default(false),
});

/** Builds (and optionally sends) a quote. Re-quoting supersedes the last one
    rather than editing it, so the customer's decision history stays honest. */
export async function saveQuote(raw: unknown): Promise<Result & { quoteId?: string }> {
  const session = await requireStaff();
  const input = quoteSchema.parse(raw);

  const [request] = await db.select().from(requests).where(eq(requests.id, input.requestId)).limit(1);
  if (!request) return { ok: false, error: "Request not found" };

  const totals = quoteTotals({
    items: input.items.map((i) => ({ quantity: i.quantity, unitPricePaise: paise(i.unitPriceRupees) })),
    discountPaise: paise(input.discountRupees),
    shippingPaise: paise(input.shippingRupees),
    taxRate: input.taxRate,
  });

  const [{ maxVersion }] = await db
    .select({ maxVersion: sql<number>`coalesce(max(${quotes.version}), 0)::int` })
    .from(quotes)
    .where(eq(quotes.requestId, request.id));

  const version = maxVersion + 1;
  const now = new Date();

  const quoteId = await db.transaction(async (tx) => {
    // Any quote still awaiting a decision is replaced by this one.
    await tx
      .update(quotes)
      .set({ status: "superseded" })
      .where(and(eq(quotes.requestId, request.id), eq(quotes.status, "sent")));

    const [q] = await tx
      .insert(quotes)
      .values({
        requestId: request.id,
        number: `${request.reference}-Q${version}`,
        version,
        status: input.send ? "sent" : "draft",
        subtotalPaise: totals.subtotalPaise,
        discountPaise: totals.discountPaise,
        shippingPaise: totals.shippingPaise,
        taxRate: String(input.taxRate),
        taxPaise: totals.taxPaise,
        totalPaise: totals.totalPaise,
        leadTimeDays: input.leadTimeDays ?? null,
        notes: input.notes || null,
        validUntil: new Date(Date.now() + input.validDays * 86400000),
        sentAt: input.send ? now : null,
        createdBy: session.user.id,
      })
      .returning({ id: quotes.id });

    await tx.insert(quoteItems).values(
      input.items.map((it, i) => ({
        quoteId: q.id,
        position: i,
        description: it.description,
        detail: it.detail || null,
        quantity: String(it.quantity),
        unit: it.unit,
        unitPricePaise: paise(it.unitPriceRupees),
        amountPaise: totals.amounts[i],
      })),
    );

    if (input.send) {
      await tx
        .update(requests)
        .set({
          stage: "quoted",
          valuePaise: totals.totalPaise,
          promisedAt: input.leadTimeDays ? addWorkingDays(now, input.leadTimeDays) : request.promisedAt,
          updatedAt: now,
        })
        .where(eq(requests.id, request.id));

      await tx.insert(requestEvents).values({
        requestId: request.id,
        stage: "quoted",
        kind: "quote",
        title: "Quote sent",
        note: `${formatINR(totals.totalPaise)} including GST${
          input.leadTimeDays ? ` · ${input.leadTimeDays} working days` : ""
        }`,
        isPublic: true,
        actorId: session.user.id,
      });
    }

    return q.id;
  });

  if (input.send) {
    await notifyQuoteSent(request, {
      number: `${request.reference}-Q${version}`,
      totalLabel: formatINR(totals.totalPaise),
      leadTimeDays: input.leadTimeDays ?? null,
      validUntil: new Date(Date.now() + input.validDays * 86400000),
    });
  }

  await audit(session.user.id, input.send ? "quote.send" : "quote.draft", "quote", quoteId, {
    total: totals.totalPaise,
  });

  revalidatePath(`/admin/requests/${request.reference}`);
  revalidatePath("/admin");
  return { ok: true, quoteId };
}

/* ---- Articles ---------------------------------------------------------- */

const articleSchema = z.object({
  id: z.string().optional(),
  title: z.string().trim().min(1, "Give it a title").max(200),
  subtitle: z.string().trim().max(300).optional(),
  slug: z.string().trim().max(80).optional(),
  bodyMd: z.string().max(200000).default(""),
  excerpt: z.string().trim().max(400).optional(),
  tags: z.string().max(300).optional(),
  access: z.enum(["public", "members", "clients"]).default("public"),
  status: z.enum(["draft", "published", "archived"]).default("draft"),
});

export async function saveArticle(raw: unknown): Promise<Result & { slug?: string }> {
  const session = await requireStaff();
  const input = articleSchema.parse(raw);

  const slug = slugify(input.slug || input.title);
  if (!slug) return { ok: false, error: "That title doesn't make a usable web address." };

  const tags = (input.tags || "")
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 8);

  const base = {
    title: input.title,
    subtitle: input.subtitle || null,
    slug,
    bodyMd: input.bodyMd,
    excerpt: input.excerpt || autoExcerpt(input.bodyMd),
    readMinutes: readingMinutes(input.bodyMd),
    tags,
    access: input.access,
    status: input.status,
    updatedAt: new Date(),
  };

  try {
    if (input.id) {
      const [existing] = await db.select().from(articles).where(eq(articles.id, input.id)).limit(1);
      if (!existing) return { ok: false, error: "That article no longer exists." };

      await db
        .update(articles)
        .set({
          ...base,
          // publishedAt is set once, on first publish, and never moved again.
          publishedAt:
            input.status === "published" && !existing.publishedAt ? new Date() : existing.publishedAt,
        })
        .where(eq(articles.id, input.id));

      await audit(session.user.id, "article.update", "article", input.id, { slug, status: input.status });
    } else {
      const [row] = await db
        .insert(articles)
        .values({
          ...base,
          authorId: session.user.id,
          publishedAt: input.status === "published" ? new Date() : null,
        })
        .returning({ id: articles.id });

      await audit(session.user.id, "article.create", "article", row.id, { slug });
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes("articles_slug_idx")) {
      return { ok: false, error: `The address /articles/${slug} is already taken.` };
    }
    throw err;
  }

  revalidatePath("/articles");
  revalidatePath(`/articles/${slug}`);
  revalidatePath("/admin/articles");
  return { ok: true, slug };
}

/* ---- Shop floor -------------------------------------------------------- */

export async function savePrinter(formData: FormData): Promise<Result> {
  const session = await requireAdmin();
  const schema = z.object({
    id: z.string().optional(),
    name: z.string().trim().min(1).max(80),
    model: z.string().trim().max(80).optional(),
    technology: z.string().trim().max(20).default("FDM"),
    buildVolume: z.string().trim().max(60).optional(),
    status: z.enum(["idle", "busy", "maintenance", "offline"]).default("idle"),
  });
  const input = schema.parse(Object.fromEntries(formData));

  const values = {
    name: input.name,
    model: input.model || null,
    technology: input.technology,
    buildVolume: input.buildVolume || null,
    status: input.status,
  };

  if (input.id) {
    await db.update(printers).set(values).where(eq(printers.id, input.id));
  } else {
    await db.insert(printers).values(values);
  }

  await audit(session.user.id, "printer.save", "printer", input.id ?? input.name, values);
  revalidatePath("/admin/workshop");
  return { ok: true };
}

export async function saveSpool(formData: FormData): Promise<Result> {
  const session = await requireStaff();
  const schema = z.object({
    id: z.string().optional(),
    material: z.string().trim().min(1).max(40),
    brand: z.string().trim().max(60).optional(),
    colour: z.string().trim().max(40).optional(),
    totalGrams: z.coerce.number().int().min(1).max(20000).default(1000),
    remainingGrams: z.coerce.number().int().min(0).max(20000),
    costRupees: z.coerce.number().min(0).optional(),
    showPublicly: z.coerce.boolean().default(true),
  });
  const raw = Object.fromEntries(formData);
  const input = schema.parse({ ...raw, showPublicly: raw.showPublicly === "on" });

  if (input.remainingGrams > input.totalGrams) {
    return { ok: false, error: "Remaining can't be more than the spool holds." };
  }

  const values = {
    material: input.material.toUpperCase(),
    brand: input.brand || null,
    colour: input.colour || null,
    totalGrams: input.totalGrams,
    remainingGrams: input.remainingGrams,
    costPaise: input.costRupees != null ? paise(input.costRupees) : null,
    showPublicly: input.showPublicly,
  };

  if (input.id) {
    await db.update(spools).set(values).where(eq(spools.id, input.id));
  } else {
    await db.insert(spools).values({ ...values, openedAt: new Date() });
  }

  await audit(session.user.id, "spool.save", "spool", input.id ?? values.material, values);
  revalidatePath("/admin/workshop");
  revalidatePath("/estimate");
  return { ok: true };
}

export async function savePrintJob(formData: FormData): Promise<Result> {
  const session = await requireStaff();
  const schema = z.object({
    id: z.string().optional(),
    requestId: z.string().optional(),
    name: z.string().trim().min(1).max(120),
    printerId: z.string().optional(),
    spoolId: z.string().optional(),
    status: z.enum(["queued", "printing", "paused", "post_processing", "done", "failed"]).default("queued"),
    material: z.string().trim().max(40).optional(),
    copies: z.coerce.number().int().min(1).max(999).default(1),
    estGrams: z.coerce.number().int().min(0).max(100000).optional(),
    estMinutes: z.coerce.number().int().min(0).max(100000).optional(),
    actualGrams: z.coerce.number().int().min(0).max(100000).optional(),
    failureReason: z.string().trim().max(300).optional(),
  });
  const input = schema.parse(Object.fromEntries(formData));

  const values = {
    requestId: input.requestId || null,
    name: input.name,
    printerId: input.printerId || null,
    spoolId: input.spoolId || null,
    status: input.status,
    material: input.material || null,
    copies: input.copies,
    estGrams: input.estGrams ?? null,
    estMinutes: input.estMinutes ?? null,
    actualGrams: input.actualGrams ?? null,
    failureReason: input.failureReason || null,
    startedAt: input.status === "printing" ? new Date() : undefined,
    finishedAt: input.status === "done" || input.status === "failed" ? new Date() : undefined,
  };

  const jobId = input.id
    ? (await db.update(printJobs).set(values).where(eq(printJobs.id, input.id)).returning({ id: printJobs.id }))[0]?.id
    : (await db.insert(printJobs).values(values).returning({ id: printJobs.id }))[0]?.id;

  // Finishing a job draws its filament down, so stock stays honest without
  // anyone remembering to update it.
  if ((input.status === "done" || input.status === "failed") && input.spoolId) {
    const used = input.actualGrams ?? input.estGrams;
    if (used) {
      await db
        .update(spools)
        .set({ remainingGrams: sql`greatest(${spools.remainingGrams} - ${used}, 0)` })
        .where(eq(spools.id, input.spoolId));
    }
  }

  await audit(session.user.id, "printjob.save", "print_job", jobId ?? input.name, values);
  revalidatePath("/admin/workshop");
  return { ok: true };
}

/* ---- People ------------------------------------------------------------ */

export async function setUserRole(formData: FormData): Promise<Result> {
  const session = await requireAdmin();
  const schema = z.object({
    userId: z.string().min(1),
    role: z.enum(["customer", "staff", "admin"]),
  });
  const input = schema.parse(Object.fromEntries(formData));

  // Don't let the last admin demote themselves out of the building.
  if (input.userId === session.user.id && input.role !== "admin") {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(users)
      .where(eq(users.role, "admin"));
    if (n <= 1) return { ok: false, error: "You're the only admin — promote someone else first." };
  }

  await db.update(users).set({ role: input.role }).where(eq(users.id, input.userId));
  await audit(session.user.id, "user.role", "user", input.userId, { role: input.role });

  revalidatePath("/admin/people");
  return { ok: true };
}

/* ---- Deletes -------------------------------------------------------------
 *
 * Everything here was add-and-edit only, so a machine typed in wrongly, or a
 * spool that ran out two months ago, stayed on the shop floor for good.
 *
 * Each of these checks what points at the row before removing it. The schema
 * would let most of them through — print_jobs nulls its printer and spool
 * references on delete — but silently detaching a finished job from the machine
 * that printed it destroys the history you would want when a customer asks what
 * their part was made on. Refusing, and saying what is in the way, is better
 * than a delete that quietly loses something.
 */

export async function deletePrinter(formData: FormData): Promise<Result> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "No machine given." };

  const [printer] = await db.select().from(printers).where(eq(printers.id, id)).limit(1);
  if (!printer) return { ok: false, error: "That machine is already gone." };

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(printJobs)
    .where(eq(printJobs.printerId, id));

  if (n > 0) {
    return {
      ok: false,
      error: `${printer.name} has ${n} job${n === 1 ? "" : "s"} on the board. Clear or reassign them first — deleting it would detach them from the machine that ran them.`,
    };
  }

  await db.delete(printers).where(eq(printers.id, id));
  await audit(session.user.id, "printer.delete", "printer", id, { name: printer.name });
  revalidatePath("/admin/workshop");
  return { ok: true };
}

export async function deleteSpool(formData: FormData): Promise<Result> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "No spool given." };

  const [spool] = await db.select().from(spools).where(eq(spools.id, id)).limit(1);
  if (!spool) return { ok: false, error: "That spool is already gone." };

  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(printJobs)
    .where(eq(printJobs.spoolId, id));

  if (n > 0) {
    return {
      ok: false,
      error: `That spool is recorded against ${n} job${n === 1 ? "" : "s"}. Untick "show publicly" to retire it instead — deleting it would lose what those jobs were printed in.`,
    };
  }

  await db.delete(spools).where(eq(spools.id, id));
  await audit(session.user.id, "spool.delete", "spool", id, {
    material: spool.material,
    colour: spool.colour,
  });
  revalidatePath("/admin/workshop");
  revalidatePath("/estimate");
  revalidatePath("/materials");
  return { ok: true };
}

export async function deleteArticle(formData: FormData): Promise<Result> {
  const session = await requireAdmin();
  const id = String(formData.get("id") ?? "");
  if (!id) return { ok: false, error: "No article given." };

  const [article] = await db.select().from(articles).where(eq(articles.id, id)).limit(1);
  if (!article) return { ok: false, error: "That piece is already gone." };

  // Bookmarks cascade by design — a reader's bookmark of a deleted piece is not
  // worth keeping, and is not history anyone will ask about.
  await db.delete(articles).where(eq(articles.id, id));
  await audit(session.user.id, "article.delete", "article", id, {
    title: article.title,
    slug: article.slug,
  });
  revalidatePath("/admin/articles");
  revalidatePath("/articles");
  revalidatePath(`/articles/${article.slug}`);
  return { ok: true };
}

export type { RequestStage };
