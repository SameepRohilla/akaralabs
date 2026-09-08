/* Seeds the studio's own fixtures: an admin account, the machines and spools
   you actually have, and a couple of journal pieces so /articles isn't empty
   on day one. Idempotent — safe to run against a live database.

   Usage:  ADMIN_EMAIL=you@akaralabs.in ADMIN_PASSWORD=... npm run db:seed
*/
// Must come first: ./index reads DATABASE_URL at module scope and throws.
import "../lib/env-file";
import { eq, sql } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db } from "./index";
import { users, printers, spools, articles } from "./schema";
import { makeReferralCode, slugify } from "../lib/ids";
import { readingMinutes, autoExcerpt } from "../lib/markdown";

const PRINTERS = [
  { name: "Bay 1", model: "Bambu Lab P1S", technology: "FDM", buildVolume: "256×256×256 mm" },
  { name: "Bay 2", model: "Bambu Lab P1S", technology: "FDM", buildVolume: "256×256×256 mm" },
  { name: "Big Bertha", model: "Creality K2 Plus", technology: "FDM", buildVolume: "350×350×350 mm" },
  { name: "Resin", model: "Elegoo Saturn 4 Ultra", technology: "SLA", buildVolume: "218×123×220 mm" },
];

const SPOOLS = [
  { material: "PLA", brand: "Wol3D", colour: "Matte black", totalGrams: 1000, remainingGrams: 780, costRupees: 1250 },
  { material: "PLA", brand: "Wol3D", colour: "Ivory", totalGrams: 1000, remainingGrams: 420, costRupees: 1250 },
  { material: "PETG", brand: "Polymaker", colour: "Charcoal", totalGrams: 1000, remainingGrams: 910, costRupees: 1850 },
  { material: "PETG", brand: "Polymaker", colour: "Translucent", totalGrams: 1000, remainingGrams: 260, costRupees: 1850 },
  { material: "ABS", brand: "Wol3D", colour: "Black", totalGrams: 1000, remainingGrams: 640, costRupees: 1500 },
  { material: "CF-NYLON", brand: "Bambu", colour: "Black", totalGrams: 1000, remainingGrams: 520, costRupees: 5400 },
  { material: "TPU", brand: "Sainsmart", colour: "Black 95A", totalGrams: 750, remainingGrams: 300, costRupees: 2600 },
];

const ARTICLES = [
  {
    title: "Why our first CF-Nylon bracket warped, and what fixed it",
    subtitle: "A drone arm mount that lifted 2 mm off the plate, and the four things we changed.",
    tags: "build log, CF-Nylon, warping",
    access: "public" as const,
    bodyMd: `Carbon-filled nylon is stiff, light and takes vibration better than anything else we print. It is also the least forgiving material on our shelf, and our first production bracket taught us that the hard way.

## What happened

The part was a drone arm mount — 96 mm long, 8 mm walls at the boss, printed flat on the plate in CF-Nylon at 0.2 mm. It came off the printer with a visible lift at one corner: about 2 mm at the far end of the longest flat face. Dimensionally the boss was fine. The mounting holes were not coplanar any more, which for this part is the whole job.

## What we thought it was

Bed adhesion. It usually is. We went at it the obvious way first — more glue stick, a brim, a hotter plate — and the lift got *slightly* better and never went away. That was the clue: if adhesion were the problem, the fixes would have solved it outright rather than shaving a millimetre off.

## What it actually was

Differential cooling. Nylon shrinks appreciably as it drops through its glass transition, and a long flat face cools unevenly across its length. The corner that lifts is the corner that cooled first. No amount of stickiness at the interface beats a part that is actively contracting.

## The four changes

1. **Dry the filament properly.** Nylon picks up water from the air in Chandigarh in a matter of hours. Six hours at 70°C before every print, not once a week.
2. **Chamber temperature, not bed temperature.** Getting the enclosure to a stable 45°C did more than another 10°C on the plate.
3. **Slow the first two layers to 15 mm/s.** A first layer laid down slowly bonds along its whole length instead of dragging.
4. **Reorient the part.** Standing it up cost us support material and about 40 minutes, and removed the long flat face entirely.

The reoriented, dried, slow-first-layer version came out within 0.1 mm across the mounting face. We have printed the same part nineteen times since with no failures.

## The part we would tell a client

If you send us a long flat part in an engineering material and you need the flat face true, expect us to suggest standing it up and charging for supports. It is cheaper than printing it twice.`,
  },
  {
    title: "PLA, PETG or Nylon: a straight answer for functional parts",
    subtitle: "What we would pick for your part, and the two questions that decide it.",
    tags: "materials, PETG, PLA, nylon",
    access: "public" as const,
    bodyMd: `Most people asking us "which material" have already read a comparison table and come away no wiser. Tables list properties. They do not tell you what to choose. So here is how we actually decide.

## The two questions

**Will it live in the sun or in a car?** If yes, PLA is out. It softens around 55–60°C, and a closed car in Chandigarh in June comfortably exceeds that. We have seen a PLA phone mount slump into a curve on a dashboard by lunchtime.

**Does it take a load that would hurt if it let go?** If yes, we are talking Nylon or CF-Nylon, not PETG.

Everything else is detail.

## Where each one earns its place

**PLA** is the right answer more often than the internet suggests. It prints beautifully, holds fine detail, is stiff, and costs the least. For jigs, fixtures, enclosures that live indoors, prototypes, display models and anything you are iterating on weekly, PLA is not a compromise — it is the correct choice.

**PETG** is what we reach for when a part goes outside, gets warm, or needs to flex a little without cracking. It is tougher than PLA in impact and much better in the sun. It is also stringier to print and slightly less crisp on fine features.

**Nylon and CF-Nylon** are for parts that see repeated load, abrasion or vibration. Gears, living hinges, drone arms, mounts on machinery. CF-Nylon adds a lot of stiffness and takes heat well. Both need drying and both cost several times PLA.

## What we would not use

**ABS**, for most jobs. It warps, it smells, and PETG or ASA does the same work with less pain. We keep it for parts that need acetone smoothing or a specific chemical resistance.

## Just tell us the job

Honestly, the best thing you can do is skip the material choice entirely and tell us what the part *does* — where it lives, what it holds, how hot it gets, how long it needs to last. Leave "Material" on **Recommend** in the print form and we will pick, and tell you why.`,
  },
  {
    title: "Our actual tolerances, measured",
    subtitle: "What we hold on FDM and SLA, taken off real parts with calipers — not off a spec sheet.",
    tags: "process, tolerances, quality",
    access: "members" as const,
    bodyMd: `Everyone quotes ±0.2 mm. Almost nobody publishes the measurements behind it. Here is ours, taken across a batch of test parts on each machine, measured with a calibrated caliper at 22°C.

## FDM, 0.2 mm layers, PLA

Across three machines and thirty parts:

| Feature | Nominal | Measured spread |
| --- | --- | --- |
| Outer dimension, X/Y | 40.00 mm | 39.88 – 40.06 |
| Outer dimension, Z | 40.00 mm | 39.94 – 40.08 |
| Hole, printed as-is | 8.00 mm | 7.62 – 7.84 |
| Hole, reamed | 8.00 mm | 7.98 – 8.02 |
| Wall, nominal 2 mm | 2.00 mm | 1.96 – 2.05 |

The number worth staring at is the hole. **A printed hole always comes out undersize** — typically 0.2–0.4 mm on an 8 mm hole — because the inner wall pulls in as it cools and because the extrusion path cuts the corner. This is not a defect and no amount of calibration removes it. If your hole matters, we print it 0.4 mm undersize and ream it, or you design in a slot instead.

## What we will commit to

- **±0.15 mm** on outer dimensions under 50 mm, in PLA or PETG, at 0.2 mm layers.
- **±0.25 mm** over 50 mm, or in nylon, or at 0.28 mm layers.
- **±0.05 mm** on any dimension we machine or ream after printing — which we will quote for if you tell us it matters.
- **Nothing** on a dimension across a warped face, which is why we care so much about orientation.

## SLA

Resin holds much tighter — we routinely see ±0.05 mm on parts under 60 mm — but it is brittle, it is not UV-stable without a coating, and it costs more. We use it for fit-check models, small detailed parts and masters, not for anything that takes a load.

## What this means for your part

If you send us a drawing with a tolerance callout, we will tell you honestly whether we can hit it as-printed, whether it needs post-machining, or whether FDM is the wrong process for the part. That last answer is free, and we have given it more than once.`,
  },
];

async function main() {
  const email = (process.env.ADMIN_EMAIL || "hello@akaralabs.in").toLowerCase();
  const password = process.env.ADMIN_PASSWORD;

  /* ---- Admin ---------------------------------------------------------- */
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, email))
    .limit(1);

  let adminId: string;

  if (existing) {
    adminId = existing.id;
    await db
      .update(users)
      .set({
        role: "admin",
        ...(password ? { passwordHash: await bcrypt.hash(password, 12) } : {}),
        emailVerified: existing.emailVerified ?? new Date(),
      })
      .where(eq(users.id, existing.id));
    console.log(`admin: promoted existing ${email}${password ? " (password set)" : ""}`);
  } else {
    const [row] = await db
      .insert(users)
      .values({
        email,
        name: process.env.ADMIN_NAME || "Akara Labs",
        role: "admin",
        passwordHash: password ? await bcrypt.hash(password, 12) : null,
        emailVerified: new Date(),
        referralCode: makeReferralCode(),
      })
      .returning({ id: users.id });
    adminId = row.id;
    console.log(
      `admin: created ${email}${password ? " with the password given" : " — sign in with Google, or set ADMIN_PASSWORD and re-run"}`,
    );
  }

  /* ---- Machines ------------------------------------------------------- */
  for (const p of PRINTERS) {
    const [have] = await db.select({ id: printers.id }).from(printers).where(eq(printers.name, p.name)).limit(1);
    if (!have) {
      await db.insert(printers).values({ ...p, status: "idle" });
      console.log(`printer: added ${p.name}`);
    }
  }

  /* ---- Filament ------------------------------------------------------- */
  const [{ n: spoolCount }] = await db.select({ n: sql<number>`count(*)::int` }).from(spools);
  if (spoolCount === 0) {
    await db.insert(spools).values(
      SPOOLS.map((s) => ({
        material: s.material,
        brand: s.brand,
        colour: s.colour,
        totalGrams: s.totalGrams,
        remainingGrams: s.remainingGrams,
        costPaise: s.costRupees * 100,
        showPublicly: true,
        openedAt: new Date(),
      })),
    );
    console.log(`spools: added ${SPOOLS.length}`);
  } else {
    console.log(`spools: ${spoolCount} already on file, left alone`);
  }

  /* ---- Journal -------------------------------------------------------- */
  for (const a of ARTICLES) {
    const slug = slugify(a.title);
    const [have] = await db.select({ id: articles.id }).from(articles).where(eq(articles.slug, slug)).limit(1);
    if (have) continue;

    await db.insert(articles).values({
      slug,
      title: a.title,
      subtitle: a.subtitle,
      bodyMd: a.bodyMd,
      excerpt: autoExcerpt(a.bodyMd),
      readMinutes: readingMinutes(a.bodyMd),
      tags: a.tags.split(",").map((t) => t.trim()),
      access: a.access,
      status: "published",
      authorId: adminId,
      publishedAt: new Date(),
    });
    console.log(`article: published /articles/${slug}`);
  }

  console.log("\nseed complete.");
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("seed failed:", err);
    process.exit(1);
  });
