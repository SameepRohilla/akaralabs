import { and, asc, desc, eq, isNull, or, sql, inArray, gte } from "drizzle-orm";
import { db } from "@/db";
import {
  requests,
  requestEvents,
  files as filesTable,
  quotes,
  quoteItems,
  messages,
  users,
  notifications,
  articles,
  articleBookmarks,
  printJobs,
  printers,
  spools,
  type RequestStage,
} from "@/db/schema";
import { isReference } from "./ids";
import { TERMINAL_STAGES } from "./stages";

/* All reads live here so access rules are written once. Every function that
   can return someone else's data takes the viewer's identity explicitly —
   there is no ambient "current user" in this layer. */

export type Viewer =
  | { kind: "user"; userId: string; role: "customer" | "staff" | "admin" }
  | { kind: "guest"; token: string }
  | { kind: "staff"; userId: string; role: "staff" | "admin" };

/** Resolves a request by reference, enforcing who may see it. Returns null
    rather than throwing so callers can render a clean 404 either way. */
export async function getRequestFor(reference: string, viewer: Viewer) {
  if (!isReference(reference)) return null;
  const ref = reference.trim().toUpperCase();

  const [row] = await db.select().from(requests).where(eq(requests.reference, ref)).limit(1);
  if (!row) return null;

  if (viewer.kind === "guest") {
    // Constant-time-ish compare on a 128-bit token; length check first.
    if (row.trackingToken.length !== viewer.token.length) return null;
    let diff = 0;
    for (let i = 0; i < viewer.token.length; i++) {
      diff |= row.trackingToken.charCodeAt(i) ^ viewer.token.charCodeAt(i);
    }
    if (diff !== 0) return null;
    return row;
  }

  if (viewer.role === "staff" || viewer.role === "admin") return row;
  return row.userId === viewer.userId ? row : null;
}

/** Full detail for a request page. `asStaff` unlocks internal notes and
    internal messages — never pass true for a customer view. */
export async function getRequestDetail(requestId: string, asStaff: boolean) {
  const [events, fileRows, quoteRows, messageRows, jobs] = await Promise.all([
    db
      .select({
        id: requestEvents.id,
        stage: requestEvents.stage,
        kind: requestEvents.kind,
        title: requestEvents.title,
        note: requestEvents.note,
        isPublic: requestEvents.isPublic,
        createdAt: requestEvents.createdAt,
        actorName: users.name,
      })
      .from(requestEvents)
      .leftJoin(users, eq(users.id, requestEvents.actorId))
      .where(
        asStaff
          ? eq(requestEvents.requestId, requestId)
          : and(eq(requestEvents.requestId, requestId), eq(requestEvents.isPublic, true)),
      )
      .orderBy(asc(requestEvents.createdAt)),

    db
      .select()
      .from(filesTable)
      .where(and(eq(filesTable.requestId, requestId), isNull(filesTable.deletedAt)))
      .orderBy(desc(filesTable.createdAt)),

    // `expired` is computed by Postgres rather than in the app: one clock, no
    // skew between the two, and nothing reads the time during render.
    db
      .select({
        id: quotes.id,
        requestId: quotes.requestId,
        number: quotes.number,
        version: quotes.version,
        status: quotes.status,
        currency: quotes.currency,
        subtotalPaise: quotes.subtotalPaise,
        discountPaise: quotes.discountPaise,
        shippingPaise: quotes.shippingPaise,
        taxRate: quotes.taxRate,
        taxPaise: quotes.taxPaise,
        totalPaise: quotes.totalPaise,
        leadTimeDays: quotes.leadTimeDays,
        notes: quotes.notes,
        terms: quotes.terms,
        validUntil: quotes.validUntil,
        sentAt: quotes.sentAt,
        decidedAt: quotes.decidedAt,
        decisionNote: quotes.decisionNote,
        createdAt: quotes.createdAt,
        expired: sql<boolean>`(${quotes.validUntil} is not null and ${quotes.validUntil} < now())`,
      })
      .from(quotes)
      .where(
        asStaff
          ? eq(quotes.requestId, requestId)
          : and(eq(quotes.requestId, requestId), sql`${quotes.status} <> 'draft'`),
      )
      .orderBy(desc(quotes.version)),

    db
      .select({
        id: messages.id,
        body: messages.body,
        fromStudio: messages.fromStudio,
        isInternal: messages.isInternal,
        createdAt: messages.createdAt,
        authorName: users.name,
        authorId: messages.authorId,
        attachmentId: messages.attachmentId,
      })
      .from(messages)
      .leftJoin(users, eq(users.id, messages.authorId))
      .where(
        asStaff
          ? eq(messages.requestId, requestId)
          : and(eq(messages.requestId, requestId), eq(messages.isInternal, false)),
      )
      .orderBy(asc(messages.createdAt)),

    asStaff
      ? db
          .select({
            id: printJobs.id,
            name: printJobs.name,
            status: printJobs.status,
            material: printJobs.material,
            copies: printJobs.copies,
            estGrams: printJobs.estGrams,
            estMinutes: printJobs.estMinutes,
            printerName: printers.name,
          })
          .from(printJobs)
          .leftJoin(printers, eq(printers.id, printJobs.printerId))
          .where(eq(printJobs.requestId, requestId))
          .orderBy(asc(printJobs.position))
      : Promise.resolve([]),
  ]);

  const items = quoteRows.length
    ? await db
        .select()
        .from(quoteItems)
        .where(inArray(quoteItems.quoteId, quoteRows.map((q) => q.id)))
        .orderBy(asc(quoteItems.position))
    : [];

  return {
    events,
    files: fileRows,
    quotes: quoteRows.map((q) => ({ ...q, items: items.filter((i) => i.quoteId === q.id) })),
    messages: messageRows,
    printJobs: jobs,
  };
}

/** The quote a customer is being asked to decide on, if any. */
export function pendingQuote<T extends { status: string }>(list: T[]): T | undefined {
  return list.find((q) => q.status === "sent");
}

export async function listRequestsForUser(userId: string) {
  return db
    .select({
      id: requests.id,
      reference: requests.reference,
      kind: requests.kind,
      stage: requests.stage,
      title: requests.title,
      createdAt: requests.createdAt,
      updatedAt: requests.updatedAt,
      promisedAt: requests.promisedAt,
      quantity: requests.quantity,
    })
    .from(requests)
    .where(eq(requests.userId, userId))
    .orderBy(desc(requests.createdAt));
}

export async function dashboardSummary(userId: string) {
  const [counts] = await db
    .select({
      total: sql<number>`count(*)::int`,
      open: sql<number>`count(*) filter (where ${requests.stage} not in ('completed','cancelled'))::int`,
      awaitingYou: sql<number>`count(*) filter (where ${requests.stage} = 'quoted')::int`,
      inProduction: sql<number>`count(*) filter (where ${requests.stage} in ('in_production','quality_check'))::int`,
      completed: sql<number>`count(*) filter (where ${requests.stage} = 'completed')::int`,
    })
    .from(requests)
    .where(eq(requests.userId, userId));

  const [unread] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(notifications)
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));

  const [fileStats] = await db
    .select({
      n: sql<number>`count(*)::int`,
      bytes: sql<number>`coalesce(sum(${filesTable.sizeBytes}),0)::bigint`,
    })
    .from(filesTable)
    .where(and(eq(filesTable.userId, userId), isNull(filesTable.deletedAt)));

  return {
    ...(counts ?? { total: 0, open: 0, awaitingYou: 0, inProduction: 0, completed: 0 }),
    unread: unread?.n ?? 0,
    files: fileStats?.n ?? 0,
    fileBytes: Number(fileStats?.bytes ?? 0),
  };
}

export async function listUnreadMessageCounts(userId: string) {
  const rows = await db
    .select({ requestId: messages.requestId, n: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(requests, eq(requests.id, messages.requestId))
    .where(
      and(
        eq(requests.userId, userId),
        eq(messages.fromStudio, true),
        eq(messages.isInternal, false),
        isNull(messages.readByCustomerAt),
      ),
    )
    .groupBy(messages.requestId);
  return new Map(rows.map((r) => [r.requestId, r.n]));
}

export async function listUserFiles(userId: string) {
  return db
    .select({
      id: filesTable.id,
      filename: filesTable.filename,
      sizeBytes: filesTable.sizeBytes,
      mimeType: filesTable.mimeType,
      createdAt: filesTable.createdAt,
      meta: filesTable.meta,
      uploadedBy: filesTable.uploadedBy,
      requestReference: requests.reference,
      requestId: requests.id,
    })
    .from(filesTable)
    .leftJoin(requests, eq(requests.id, filesTable.requestId))
    .where(and(eq(filesTable.userId, userId), isNull(filesTable.deletedAt)))
    .orderBy(desc(filesTable.createdAt));
}

export async function getNotifications(userId: string, limit = 40) {
  return db
    .select()
    .from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
}

/* ---- Articles ---------------------------------------------------------- */

export async function listArticles(opts: {
  viewerRole?: "guest" | "customer" | "staff" | "admin";
  isClient?: boolean;
  limit?: number;
  tag?: string;
}) {
  const role = opts.viewerRole ?? "guest";
  const visible: ("public" | "members" | "clients")[] =
    role === "guest" ? ["public"] : opts.isClient || role === "staff" || role === "admin"
      ? ["public", "members", "clients"]
      : ["public", "members"];

  return db
    .select({
      id: articles.id,
      slug: articles.slug,
      title: articles.title,
      subtitle: articles.subtitle,
      excerpt: articles.excerpt,
      coverKey: articles.coverKey,
      access: articles.access,
      tags: articles.tags,
      readMinutes: articles.readMinutes,
      publishedAt: articles.publishedAt,
      authorName: users.name,
    })
    .from(articles)
    .leftJoin(users, eq(users.id, articles.authorId))
    .where(
      and(
        eq(articles.status, "published"),
        inArray(articles.access, visible),
        opts.tag ? sql`${articles.tags} ? ${opts.tag}` : undefined,
      ),
    )
    .orderBy(desc(articles.publishedAt))
    .limit(opts.limit ?? 30);
}

export async function getArticle(slug: string) {
  const [row] = await db
    .select({
      article: articles,
      authorName: users.name,
      authorImage: users.image,
    })
    .from(articles)
    .leftJoin(users, eq(users.id, articles.authorId))
    .where(eq(articles.slug, slug))
    .limit(1);
  return row ?? null;
}

export async function isBookmarked(userId: string, articleId: string) {
  const [row] = await db
    .select({ articleId: articleBookmarks.articleId })
    .from(articleBookmarks)
    .where(and(eq(articleBookmarks.userId, userId), eq(articleBookmarks.articleId, articleId)))
    .limit(1);
  return !!row;
}

export async function listBookmarks(userId: string) {
  return db
    .select({
      slug: articles.slug,
      title: articles.title,
      excerpt: articles.excerpt,
      readMinutes: articles.readMinutes,
      publishedAt: articles.publishedAt,
      access: articles.access,
    })
    .from(articleBookmarks)
    .innerJoin(articles, eq(articles.id, articleBookmarks.articleId))
    .where(eq(articleBookmarks.userId, userId))
    .orderBy(desc(articleBookmarks.createdAt));
}

/** True once the person has had at least one request reach production —
    that's what "client" access on an article means. */
export async function isClient(userId: string): Promise<boolean> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(requests)
    .where(
      and(
        eq(requests.userId, userId),
        inArray(requests.stage, ["approved", "in_production", "quality_check", "shipped", "completed"]),
      ),
    );
  return (row?.n ?? 0) > 0;
}

/* ---- Admin ------------------------------------------------------------- */

export async function adminQueue(opts: { stage?: RequestStage | "open" | "all"; q?: string; limit?: number }) {
  const stageFilter =
    !opts.stage || opts.stage === "open"
      ? sql`${requests.stage} not in ('completed','cancelled')`
      : opts.stage === "all"
        ? undefined
        : eq(requests.stage, opts.stage);

  const search = opts.q?.trim()
    ? or(
        sql`${requests.reference} ilike ${"%" + opts.q.trim() + "%"}`,
        sql`${requests.contactName} ilike ${"%" + opts.q.trim() + "%"}`,
        sql`${requests.contactEmail} ilike ${"%" + opts.q.trim() + "%"}`,
        sql`coalesce(${requests.title},'') ilike ${"%" + opts.q.trim() + "%"}`,
      )
    : undefined;

  return db
    .select({
      id: requests.id,
      reference: requests.reference,
      kind: requests.kind,
      stage: requests.stage,
      title: requests.title,
      contactName: requests.contactName,
      contactEmail: requests.contactEmail,
      contactCompany: requests.contactCompany,
      quantity: requests.quantity,
      valuePaise: requests.valuePaise,
      promisedAt: requests.promisedAt,
      createdAt: requests.createdAt,
      updatedAt: requests.updatedAt,
      userId: requests.userId,
      assigneeName: users.name,
    })
    .from(requests)
    .leftJoin(users, eq(users.id, requests.assigneeId))
    .where(and(stageFilter, search))
    .orderBy(desc(requests.priority), desc(requests.createdAt))
    .limit(opts.limit ?? 200);
}

export async function adminStats() {
  // Passed as an ISO string with an explicit cast: a JS Date interpolated
  // into a raw sql template isn't serialisable by the driver in this position.
  const since = new Date(Date.now() - 1000 * 60 * 60 * 24 * 30).toISOString();

  const [pipeline] = await db
    .select({
      open: sql<number>`count(*) filter (where ${requests.stage} not in ('completed','cancelled'))::int`,
      newThisWeek: sql<number>`count(*) filter (where ${requests.createdAt} > now() - interval '7 days')::int`,
      awaitingQuote: sql<number>`count(*) filter (where ${requests.stage} in ('received','in_review'))::int`,
      awaitingCustomer: sql<number>`count(*) filter (where ${requests.stage} = 'quoted')::int`,
      inProduction: sql<number>`count(*) filter (where ${requests.stage} in ('approved','in_production','quality_check'))::int`,
      onHold: sql<number>`count(*) filter (where ${requests.stage} = 'on_hold')::int`,
    })
    .from(requests);

  const [money] = await db
    .select({
      wonPaise: sql<number>`coalesce(sum(${quotes.totalPaise}) filter (where ${quotes.status} = 'accepted'),0)::bigint`,
      wonPaise30: sql<number>`coalesce(sum(${quotes.totalPaise}) filter (where ${quotes.status} = 'accepted' and ${quotes.decidedAt} > ${since}::timestamptz),0)::bigint`,
      pendingPaise: sql<number>`coalesce(sum(${quotes.totalPaise}) filter (where ${quotes.status} = 'sent'),0)::bigint`,
      sent: sql<number>`count(*) filter (where ${quotes.status} <> 'draft')::int`,
      accepted: sql<number>`count(*) filter (where ${quotes.status} = 'accepted')::int`,
      rejected: sql<number>`count(*) filter (where ${quotes.status} = 'rejected')::int`,
    })
    .from(quotes);

  const [people] = await db
    .select({
      customers: sql<number>`count(*) filter (where ${users.role} = 'customer')::int`,
      newCustomers30: sql<number>`count(*) filter (where ${users.role} = 'customer' and ${users.createdAt} > ${since}::timestamptz)::int`,
    })
    .from(users);

  // Median hours from received to first quote sent, last 90 days.
  const responseRows = await db.execute<{ median_hours: number | null }>(sql`
    SELECT percentile_cont(0.5) WITHIN GROUP (
      ORDER BY EXTRACT(EPOCH FROM (q.sent_at - r.created_at)) / 3600
    ) AS median_hours
    FROM quotes q
    JOIN requests r ON r.id = q.request_id
    WHERE q.sent_at IS NOT NULL
      AND q.version = 1
      AND q.sent_at > now() - interval '90 days'
  `);

  return {
    pipeline: pipeline ?? {
      open: 0, newThisWeek: 0, awaitingQuote: 0, awaitingCustomer: 0, inProduction: 0, onHold: 0,
    },
    money: {
      wonPaise: Number(money?.wonPaise ?? 0),
      wonPaise30: Number(money?.wonPaise30 ?? 0),
      pendingPaise: Number(money?.pendingPaise ?? 0),
      sent: money?.sent ?? 0,
      accepted: money?.accepted ?? 0,
      rejected: money?.rejected ?? 0,
      winRate: money?.sent ? Math.round(((money.accepted ?? 0) / money.sent) * 100) : null,
    },
    people: people ?? { customers: 0, newCustomers30: 0 },
    medianQuoteHours: responseRows[0]?.median_hours != null ? Math.round(Number(responseRows[0].median_hours) * 10) / 10 : null,
  };
}

/** Requests that need the studio to do something, worst first. */
export async function adminAttention() {
  return db
    .select({
      reference: requests.reference,
      stage: requests.stage,
      contactName: requests.contactName,
      title: requests.title,
      createdAt: requests.createdAt,
      updatedAt: requests.updatedAt,
      ageHours: sql<number>`(extract(epoch from (now() - ${requests.createdAt})) / 3600)::int`,
      staleHours: sql<number>`(extract(epoch from (now() - ${requests.updatedAt})) / 3600)::int`,
    })
    .from(requests)
    .where(
      and(
        sql`${requests.stage} not in ('completed','cancelled')`,
        or(
          // never quoted and older than a day
          and(inArray(requests.stage, ["received", "in_review"]), sql`${requests.createdAt} < now() - interval '24 hours'`),
          // nothing has moved in a week
          sql`${requests.updatedAt} < now() - interval '7 days'`,
          eq(requests.stage, "on_hold"),
        ),
      ),
    )
    .orderBy(asc(requests.updatedAt))
    .limit(25);
}

export async function listSpools(publicOnly = false) {
  return db
    .select()
    .from(spools)
    .where(publicOnly ? eq(spools.showPublicly, true) : undefined)
    .orderBy(asc(spools.material), desc(spools.remainingGrams));
}

export async function materialAvailability() {
  return db
    .select({
      material: spools.material,
      spools: sql<number>`count(*)::int`,
      grams: sql<number>`coalesce(sum(${spools.remainingGrams}),0)::int`,
      colours: sql<string>`string_agg(distinct coalesce(${spools.colour},'—'), ', ')`,
    })
    .from(spools)
    .where(and(eq(spools.showPublicly, true), gte(spools.remainingGrams, 50)))
    .groupBy(spools.material)
    .orderBy(asc(spools.material));
}

export { TERMINAL_STAGES };
