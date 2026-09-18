import {
  pgTable,
  text,
  timestamp,
  integer,
  bigint,
  boolean,
  jsonb,
  numeric,
  primaryKey,
  uniqueIndex,
  index,
  pgEnum,
} from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";

/* ============================================================
   Enums
   ============================================================ */

export const userRole = pgEnum("user_role", ["customer", "staff", "admin"]);

export const requestKind = pgEnum("request_kind", ["project", "print"]);

/** The stage timeline a customer sees. Order matters — progress is derived from it. */
export const requestStage = pgEnum("request_stage", [
  "received",
  "in_review",
  "quoted",
  "approved",
  "in_production",
  "quality_check",
  "shipped",
  "completed",
  "on_hold",
  "cancelled",
]);

export const quoteStatus = pgEnum("quote_status", [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "expired",
  "superseded",
]);

export const fileOwner = pgEnum("file_owner", ["customer", "studio"]);

export const articleStatus = pgEnum("article_status", ["draft", "published", "archived"]);

export const articleAccess = pgEnum("article_access", ["public", "members", "clients"]);

export const printJobStatus = pgEnum("print_job_status", [
  "queued",
  "printing",
  "paused",
  "post_processing",
  "done",
  "failed",
]);

export const notificationKind = pgEnum("notification_kind", [
  "stage_change",
  "quote_sent",
  "quote_decision",
  "message",
  "file_added",
  "article_published",
  "system",
]);

/* ============================================================
   Auth (Auth.js / next-auth Drizzle adapter shape + our extras)
   ============================================================ */

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name"),
    email: text("email").notNull(),
    emailVerified: timestamp("email_verified", { withTimezone: true }),
    image: text("image"),

    // credentials login (null for Google-only accounts)
    passwordHash: text("password_hash"),

    role: userRole("role").notNull().default("customer"),

    // profile the portal collects/reuses to prefill intake forms
    phone: text("phone"),
    company: text("company"),
    gstin: text("gstin"),
    addressLine: text("address_line"),
    city: text("city"),
    state: text("state"),
    pincode: text("pincode"),

    locale: text("locale").notNull().default("en"),
    marketingOptIn: boolean("marketing_opt_in").notNull().default(false),
    notifyEmail: boolean("notify_email").notNull().default(true),

    // loyalty / referral
    referralCode: text("referral_code"),
    referredBy: text("referred_by"),
    creditPaise: bigint("credit_paise", { mode: "number" }).notNull().default(0),

    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("users_email_lower_idx").on(sql`lower(${t.email})`),
    uniqueIndex("users_referral_code_idx").on(t.referralCode),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("sessions", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { withTimezone: true }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/** Single-use tokens for email verification and password reset. */
export const authTokens = pgTable(
  "auth_tokens",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    purpose: text("purpose").notNull(), // 'verify_email' | 'reset_password'
    tokenHash: text("token_hash").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("auth_tokens_hash_idx").on(t.tokenHash), index("auth_tokens_user_idx").on(t.userId)],
);

/* ============================================================
   Requests — the spine of the portal
   ============================================================ */

export const requests = pgTable(
  "requests",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),

    /** Human reference shown everywhere: AKR-123456 */
    reference: text("reference").notNull(),

    /** Lets a guest track a request before they ever create an account. */
    trackingToken: text("tracking_token").notNull(),

    kind: requestKind("kind").notNull(),
    stage: requestStage("stage").notNull().default("received"),

    /** Owner once claimed; null while the enquiry is still unclaimed. */
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),

    // contact as submitted (kept even after claiming — it's the record of the enquiry)
    contactName: text("contact_name").notNull(),
    contactEmail: text("contact_email").notNull(),
    contactPhone: text("contact_phone"),
    contactCompany: text("contact_company"),

    /** When the submitter proved they own `contactEmail`, by entering the code
        we sent. Null means the enquiry is real enough to keep but nobody has
        confirmed the address, so we have not emailed them anything beyond the
        code itself and the studio has not been pinged. Requests that arrive
        from a signed-in session are verified on arrival — the account already
        proved the address. */
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),

    title: text("title"),
    brief: text("brief"),

    /** Everything the intake form collected, verbatim. Kind-specific. */
    spec: jsonb("spec").$type<Record<string, unknown>>().notNull().default({}),

    quantity: text("quantity"),
    timelineWanted: text("timeline_wanted"),

    // studio-side fields
    priority: integer("priority").notNull().default(0),
    assigneeId: text("assignee_id").references(() => users.id, { onDelete: "set null" }),
    internalNotes: text("internal_notes"),
    promisedAt: timestamp("promised_at", { withTimezone: true }),
    valuePaise: bigint("value_paise", { mode: "number" }),

    source: text("source").notNull().default("website"),
    utm: jsonb("utm").$type<Record<string, string>>(),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (t) => [
    uniqueIndex("requests_reference_idx").on(t.reference),
    index("requests_user_idx").on(t.userId),
    index("requests_stage_idx").on(t.stage),
    index("requests_email_idx").on(sql`lower(${t.contactEmail})`),
    index("requests_created_idx").on(t.createdAt),
  ],
);

/** Append-only stage/activity log — this is what renders the customer timeline. */
export const requestEvents = pgTable(
  "request_events",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    requestId: text("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    stage: requestStage("stage"),
    kind: text("kind").notNull().default("stage"), // stage | note | file | quote | message | system
    title: text("title").notNull(),
    /** Shown to the customer. Keep internal chatter in requests.internalNotes. */
    note: text("note"),
    isPublic: boolean("is_public").notNull().default(true),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("request_events_request_idx").on(t.requestId, t.createdAt)],
);

/* ============================================================
   Files
   ============================================================ */

export const files = pgTable(
  "files",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    requestId: text("request_id").references(() => requests.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),

    filename: text("filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    /** Path relative to STORAGE_DIR, or the S3 key when S3 is configured. */
    storageKey: text("storage_key").notNull(),
    checksum: text("checksum"),

    uploadedBy: fileOwner("uploaded_by").notNull().default("customer"),
    label: text("label"),
    isPublic: boolean("is_public").notNull().default(false),

    /** Geometry parsed out of STL/3MF uploads, when we can read it. */
    meta: jsonb("meta").$type<Record<string, unknown>>(),

    /** Saved to the customer's reusable model library, not just this request. */
    inLibrary: boolean("in_library").notNull().default(false),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("files_request_idx").on(t.requestId),
    index("files_user_idx").on(t.userId),
    index("files_library_idx").on(t.userId, t.inLibrary),
  ],
);

/* ============================================================
   Quotes
   ============================================================ */

export const quotes = pgTable(
  "quotes",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    requestId: text("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    number: text("number").notNull(), // AKR-123456-Q1
    version: integer("version").notNull().default(1),
    status: quoteStatus("status").notNull().default("draft"),

    currency: text("currency").notNull().default("INR"),
    subtotalPaise: bigint("subtotal_paise", { mode: "number" }).notNull().default(0),
    discountPaise: bigint("discount_paise", { mode: "number" }).notNull().default(0),
    shippingPaise: bigint("shipping_paise", { mode: "number" }).notNull().default(0),
    taxRate: numeric("tax_rate", { precision: 5, scale: 2 }).notNull().default("18.00"),
    taxPaise: bigint("tax_paise", { mode: "number" }).notNull().default(0),
    totalPaise: bigint("total_paise", { mode: "number" }).notNull().default(0),

    leadTimeDays: integer("lead_time_days"),
    notes: text("notes"),
    terms: text("terms"),

    validUntil: timestamp("valid_until", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decisionNote: text("decision_note"),

    createdBy: text("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("quotes_number_idx").on(t.number),
    index("quotes_request_idx").on(t.requestId),
    index("quotes_status_idx").on(t.status),
  ],
);

export const quoteItems = pgTable(
  "quote_items",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    quoteId: text("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    position: integer("position").notNull().default(0),
    description: text("description").notNull(),
    detail: text("detail"),
    quantity: numeric("quantity", { precision: 12, scale: 3 }).notNull().default("1"),
    unit: text("unit").notNull().default("nos"),
    unitPricePaise: bigint("unit_price_paise", { mode: "number" }).notNull().default(0),
    amountPaise: bigint("amount_paise", { mode: "number" }).notNull().default(0),
  },
  (t) => [index("quote_items_quote_idx").on(t.quoteId, t.position)],
);

/* ============================================================
   Messaging — one thread per request
   ============================================================ */

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    requestId: text("request_id")
      .notNull()
      .references(() => requests.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    /** true when written by staff/admin — drives which side of the thread it sits on. */
    fromStudio: boolean("from_studio").notNull().default(false),
    body: text("body").notNull(),
    /** Staff-only note in the thread; hidden from the customer. */
    isInternal: boolean("is_internal").notNull().default(false),
    attachmentId: text("attachment_id").references(() => files.id, { onDelete: "set null" }),
    readByCustomerAt: timestamp("read_by_customer_at", { withTimezone: true }),
    readByStudioAt: timestamp("read_by_studio_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_request_idx").on(t.requestId, t.createdAt)],
);

/* ============================================================
   Articles / build logs
   ============================================================ */

export const articles = pgTable(
  "articles",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    slug: text("slug").notNull(),
    title: text("title").notNull(),
    subtitle: text("subtitle"),
    excerpt: text("excerpt"),
    bodyMd: text("body_md").notNull().default(""),
    coverKey: text("cover_key"),

    status: articleStatus("status").notNull().default("draft"),
    access: articleAccess("access").notNull().default("public"),

    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    readMinutes: integer("read_minutes"),
    /** Downloadables attached to the piece (STLs, calibration files, cheat sheets). */
    attachments: jsonb("attachments").$type<{ name: string; key: string; size?: number }[]>().notNull().default([]),

    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    viewCount: integer("view_count").notNull().default(0),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("articles_slug_idx").on(t.slug),
    index("articles_status_idx").on(t.status, t.publishedAt),
  ],
);

export const articleBookmarks = pgTable(
  "article_bookmarks",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    articleId: text("article_id")
      .notNull()
      .references(() => articles.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.articleId] })],
);

/* ============================================================
   Shop floor — printers, spools, jobs
   ============================================================ */

export const printers = pgTable("printers", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  model: text("model"),
  technology: text("technology").notNull().default("FDM"), // FDM | SLA | SLS
  buildVolume: text("build_volume"),
  nozzleMm: numeric("nozzle_mm", { precision: 4, scale: 2 }),
  status: text("status").notNull().default("idle"), // idle | busy | maintenance | offline
  notes: text("notes"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const spools = pgTable(
  "spools",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    material: text("material").notNull(), // PLA, PETG, ABS, ASA, TPU, Nylon, CF-Nylon, Resin
    brand: text("brand"),
    colour: text("colour"),
    diameterMm: numeric("diameter_mm", { precision: 4, scale: 2 }).notNull().default("1.75"),
    totalGrams: integer("total_grams").notNull().default(1000),
    remainingGrams: integer("remaining_grams").notNull().default(1000),
    costPaise: bigint("cost_paise", { mode: "number" }),
    /** Surfaced on the public /materials page as live availability. */
    showPublicly: boolean("show_publicly").notNull().default(true),
    openedAt: timestamp("opened_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("spools_material_idx").on(t.material)],
);

export const printJobs = pgTable(
  "print_jobs",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    requestId: text("request_id").references(() => requests.id, { onDelete: "set null" }),
    fileId: text("file_id").references(() => files.id, { onDelete: "set null" }),
    printerId: text("printer_id").references(() => printers.id, { onDelete: "set null" }),
    spoolId: text("spool_id").references(() => spools.id, { onDelete: "set null" }),

    name: text("name").notNull(),
    status: printJobStatus("status").notNull().default("queued"),
    position: integer("position").notNull().default(0),

    material: text("material"),
    layerHeightMm: numeric("layer_height_mm", { precision: 4, scale: 2 }),
    infillPct: integer("infill_pct"),
    copies: integer("copies").notNull().default(1),

    estGrams: integer("est_grams"),
    actualGrams: integer("actual_grams"),
    estMinutes: integer("est_minutes"),
    actualMinutes: integer("actual_minutes"),

    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    failureReason: text("failure_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("print_jobs_status_idx").on(t.status, t.position)],
);

/* ============================================================
   Notifications & audit
   ============================================================ */

export const notifications = pgTable(
  "notifications",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: notificationKind("kind").notNull(),
    title: text("title").notNull(),
    body: text("body"),
    href: text("href"),
    requestId: text("request_id").references(() => requests.id, { onDelete: "cascade" }),
    readAt: timestamp("read_at", { withTimezone: true }),
    emailedAt: timestamp("emailed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("notifications_user_idx").on(t.userId, t.readAt, t.createdAt)],
);

export const auditLog = pgTable(
  "audit_log",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    entity: text("entity").notNull(),
    entityId: text("entity_id"),
    before: jsonb("before"),
    after: jsonb("after"),
    ip: text("ip"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("audit_entity_idx").on(t.entity, t.entityId, t.createdAt)],
);

/** Short-lived numeric codes emailed to prove someone owns an address.
 *
 * Deliberately separate from `auth_tokens`. Those are 256-bit links that live
 * for two days and only ever belong to an existing user; these are six digits
 * that live for ten minutes, are guessable by design, and frequently exist
 * *before* there is a user at all — a signup's details sit in `payload` until
 * the code comes back, so an unconfirmed address never becomes an account.
 *
 * `codeHash` is a peppered SHA-256, never the code itself: a database dump
 * should not hand anyone a working signup, and six digits would otherwise be
 * trivially reversible from a plain hash.
 */
export const emailOtps = pgTable(
  "email_otps",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),

    /** Always stored lowercased — it is half the lookup key. */
    email: text("email").notNull(),

    /** 'signup' | 'intake' | 'verify_account' */
    purpose: text("purpose").notNull(),

    codeHash: text("code_hash").notNull(),

    /** What this code unlocks. For 'signup', the whole pending account —
        including the bcrypt hash, so no plaintext password is ever stored. */
    payload: jsonb("payload").$type<Record<string, unknown>>(),

    /** Set for 'intake' (the request awaiting confirmation) and
        'verify_account' (the signed-in user), null for 'signup'. */
    requestId: text("request_id").references(() => requests.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),

    /** Wrong guesses so far. Past the cap the row is dead and must be resent. */
    attempts: integer("attempts").notNull().default(0),
    /** How many codes this row has carried, across resends. */
    sends: integer("sends").notNull().default(1),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastSentAt: timestamp("last_sent_at", { withTimezone: true }).notNull().defaultNow(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    /* The hot lookup: the one live code for this address and purpose. */
    index("email_otps_lookup_idx").on(sql`lower(${t.email})`, t.purpose, t.consumedAt),
    index("email_otps_request_idx").on(t.requestId),
    index("email_otps_expiry_idx").on(t.expiresAt),
  ],
);

/** Simple sliding-window limiter backing store — survives restarts, no Redis needed. */
export const rateLimits = pgTable("rate_limits", {
  key: text("key").primaryKey(),
  count: integer("count").notNull().default(0),
  windowStart: timestamp("window_start", { withTimezone: true }).notNull().defaultNow(),
});

/** Newsletter, kept separate from users so non-members can subscribe. */
export const subscribers = pgTable(
  "subscribers",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    email: text("email").notNull(),
    name: text("name"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    token: text("token").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("subscribers_email_idx").on(sql`lower(${t.email})`)],
);

/** Editable key/value settings so pricing and copy don't need a redeploy. */
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ============================================================
   Relations
   ============================================================ */

export const usersRelations = relations(users, ({ many }) => ({
  requests: many(requests),
  notifications: many(notifications),
  files: many(files),
}));

export const requestsRelations = relations(requests, ({ one, many }) => ({
  user: one(users, { fields: [requests.userId], references: [users.id] }),
  assignee: one(users, { fields: [requests.assigneeId], references: [users.id] }),
  events: many(requestEvents),
  files: many(files),
  quotes: many(quotes),
  messages: many(messages),
  printJobs: many(printJobs),
}));

export const requestEventsRelations = relations(requestEvents, ({ one }) => ({
  request: one(requests, { fields: [requestEvents.requestId], references: [requests.id] }),
  actor: one(users, { fields: [requestEvents.actorId], references: [users.id] }),
}));

export const filesRelations = relations(files, ({ one }) => ({
  request: one(requests, { fields: [files.requestId], references: [requests.id] }),
  user: one(users, { fields: [files.userId], references: [users.id] }),
}));

export const quotesRelations = relations(quotes, ({ one, many }) => ({
  request: one(requests, { fields: [quotes.requestId], references: [requests.id] }),
  items: many(quoteItems),
}));

export const quoteItemsRelations = relations(quoteItems, ({ one }) => ({
  quote: one(quotes, { fields: [quoteItems.quoteId], references: [quotes.id] }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  request: one(requests, { fields: [messages.requestId], references: [requests.id] }),
  author: one(users, { fields: [messages.authorId], references: [users.id] }),
  attachment: one(files, { fields: [messages.attachmentId], references: [files.id] }),
}));

export const articlesRelations = relations(articles, ({ one, many }) => ({
  author: one(users, { fields: [articles.authorId], references: [users.id] }),
  bookmarks: many(articleBookmarks),
}));

export const printJobsRelations = relations(printJobs, ({ one }) => ({
  request: one(requests, { fields: [printJobs.requestId], references: [requests.id] }),
  printer: one(printers, { fields: [printJobs.printerId], references: [printers.id] }),
  spool: one(spools, { fields: [printJobs.spoolId], references: [spools.id] }),
  file: one(files, { fields: [printJobs.fileId], references: [files.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
  request: one(requests, { fields: [notifications.requestId], references: [requests.id] }),
}));

/* ============================================================
   Inferred types
   ============================================================ */

export type User = typeof users.$inferSelect;
export type Request = typeof requests.$inferSelect;
export type RequestEvent = typeof requestEvents.$inferSelect;
export type FileRow = typeof files.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type QuoteItem = typeof quoteItems.$inferSelect;
export type Message = typeof messages.$inferSelect;
export type Article = typeof articles.$inferSelect;
export type Printer = typeof printers.$inferSelect;
export type Spool = typeof spools.$inferSelect;
export type PrintJob = typeof printJobs.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type RequestStage = (typeof requestStage.enumValues)[number];
export type RequestKind = (typeof requestKind.enumValues)[number];
