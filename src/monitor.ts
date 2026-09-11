import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as cheerio from "cheerio";
import { isGreaterStockholm } from "./stockholm.js";
import { sendEmail } from "./resend.js";

export const USER_AGENT =
  "KompisSverige-Stockholm-Monitor/1.0 (private personal notifier)";

const API_URL =
  "https://kompissverige.se/wp-json/wp/v2/aktiviteter?per_page=50&orderby=date&order=desc&_fields=id,date,slug,link,title,omraden";

const MAX_SEEN_IDS = 2000;

export type WpEvent = {
  id: number;
  date: string;
  slug: string;
  link: string;
  title: { rendered: string };
  omraden: number[];
};

export type EnrichedEvent = {
  id: number;
  title: string;
  link: string;
  publishedAt: string;
  eventDate?: string;
  time?: string;
  location?: string;
  region?: string;
  venue?: string;
  description?: string;
  full?: boolean;
};

export type SeenStore = {
  updatedAt: string | null;
  ids: number[];
};

function decodeHtml(value: string): string {
  return cheerio.load(`<textarea>${value}</textarea>`)("textarea").text();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function cleanText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export async function fetchEvents(): Promise<WpEvent[]> {
  const response = await fetch(API_URL, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`WordPress API failed (${response.status})`);
  }
  return (await response.json()) as WpEvent[];
}

export function toFilterInput(event: WpEvent) {
  return {
    omraden: event.omraden ?? [],
    title: decodeHtml(event.title.rendered),
    slug: event.slug,
    link: event.link,
  };
}

export async function enrichEvent(event: WpEvent): Promise<EnrichedEvent> {
  const title = decodeHtml(event.title.rendered);
  const base: EnrichedEvent = {
    id: event.id,
    title,
    link: event.link,
    publishedAt: event.date,
  };

  const response = await fetch(event.link, {
    headers: { "User-Agent": USER_AGENT, Accept: "text/html" },
  });
  if (!response.ok) {
    return base;
  }

  const $ = cheerio.load(await response.text());
  const day = cleanText($(".date .day").first().text());
  const month = cleanText($(".date .month").first().text());
  const time = cleanText($(".time").first().text());
  const location = cleanText($(".location").first().text());
  const region = cleanText($(".omrade").first().text());
  const vinjett = $(".vinjett").first().clone();
  vinjett.find(".omrade").remove();
  const venue = cleanText(vinjett.text());
  const description = cleanText($(".description").first().text());
  const full = /fullbokad/i.test($("body").text());

  return {
    ...base,
    eventDate: day && month ? `${day} ${month}` : undefined,
    time: time || undefined,
    location: location || undefined,
    region: region || undefined,
    venue: venue || undefined,
    description: description || undefined,
    full,
  };
}

export async function loadSeen(filePath: string): Promise<SeenStore> {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as SeenStore;
    return {
      updatedAt: parsed.updatedAt ?? null,
      ids: Array.isArray(parsed.ids) ? parsed.ids.map(Number) : [],
    };
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === "ENOENT") {
      return { updatedAt: null, ids: [] };
    }
    throw error;
  }
}

export async function saveSeen(filePath: string, ids: number[]): Promise<void> {
  const unique = [...new Set(ids)].sort((a, b) => b - a).slice(0, MAX_SEEN_IDS);
  const store: SeenStore = {
    updatedAt: new Date().toISOString(),
    ids: unique,
  };
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function eventLines(event: EnrichedEvent): string[] {
  const lines = [`${event.title}`, event.link];
  if (event.eventDate || event.time) {
    lines.push([event.eventDate, event.time].filter(Boolean).join(" · "));
  }
  if (event.venue || event.location) {
    lines.push([event.venue, event.location].filter(Boolean).join(" — "));
  }
  if (event.full) {
    lines.push("Currently full (waitlist may be available).");
  }
  if (event.description) {
    lines.push(event.description);
  }
  return lines;
}

export function buildEmail(events: EnrichedEvent[]): { subject: string; text: string; html: string } {
  const subject =
    events.length === 1
      ? `New Kompis Sverige event in Stockholm: ${events[0].title}`
      : `New Kompis Sverige events in Stockholm (${events.length})`;

  const text = events
    .map((event) => eventLines(event).join("\n"))
    .join("\n\n---\n\n");

  const html = events
    .map((event) => {
      const meta = [event.eventDate, event.time, event.venue, event.location]
        .filter(Boolean)
        .map((part) => escapeHtml(part as string))
        .join(" · ");
      const fullNote = event.full
        ? `<p><em>Currently full (waitlist may be available).</em></p>`
        : "";
      const description = event.description
        ? `<p>${escapeHtml(event.description)}</p>`
        : "";
      return `<article>
  <h2><a href="${escapeHtml(event.link)}">${escapeHtml(event.title)}</a></h2>
  ${meta ? `<p>${meta}</p>` : ""}
  ${fullNote}
  ${description}
</article>`;
    })
    .join("\n<hr />\n");

  return { subject, text, html };
}

function parseArgs(argv: string[]) {
  return {
    dryRun: argv.includes("--dry-run"),
    seed: argv.includes("--seed"),
    testEmail: argv.includes("--test-email"),
    notifyLive: argv.includes("--notify-live"),
  };
}

async function sendTestEmail(to: string): Promise<void> {
  await sendEmail({
    to,
    subject: "Kompis Sverige monitor is live",
    text: "The Stockholm event monitor is running. You will get an email when a new Greater Stockholm event is posted.",
    html: "<p>The Stockholm event monitor is running. You will get an email when a new Greater Stockholm event is posted.</p>",
  });
}

export async function run(argv = process.argv.slice(2)): Promise<void> {
  const args = parseArgs(argv);
  const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
  const seenPath = path.join(root, "data", "seen.json");

  if (args.testEmail) {
    const to = process.env.TO_EMAIL;
    if (!to) {
      throw new Error("TO_EMAIL is not set");
    }
    await sendTestEmail(to);
    console.log(`Sent a test email to ${to}`);
    return;
  }

  const events = await fetchEvents();
  const stockholmEvents = events.filter((event) => isGreaterStockholm(toFilterInput(event)));
  console.log(
    `Fetched ${events.length} recent events, ${stockholmEvents.length} in Greater Stockholm.`,
  );

  if (args.dryRun) {
    for (const event of stockholmEvents) {
      console.log(`- [${event.id}] ${decodeHtml(event.title.rendered)} ${event.link}`);
    }
    return;
  }

  const seen = await loadSeen(seenPath);
  const firstRun = seen.ids.length === 0 || args.seed;
  const seenSet = new Set(seen.ids);

  if (firstRun) {
    const ids = [...seen.ids, ...stockholmEvents.map((event) => event.id)];
    await saveSeen(seenPath, ids);
    console.log(`Seeded ${stockholmEvents.length} existing events. No alert sent.`);
    if (args.notifyLive) {
      const to = process.env.TO_EMAIL;
      if (!to) {
        throw new Error("TO_EMAIL is not set");
      }
      await sendTestEmail(to);
      console.log(`Sent a “monitor is live” email to ${to}`);
    }
    return;
  }

  const newEvents = stockholmEvents.filter((event) => !seenSet.has(event.id));
  if (newEvents.length === 0) {
    console.log("No new Greater Stockholm events.");
    return;
  }

  console.log(`Found ${newEvents.length} new event(s). Enriching pages…`);
  const enriched: EnrichedEvent[] = [];
  for (const event of newEvents) {
    enriched.push(await enrichEvent(event));
  }

  const to = process.env.TO_EMAIL;
  if (!to) {
    throw new Error("TO_EMAIL is not set");
  }

  const email = buildEmail(enriched);
  await sendEmail({ to, ...email });
  console.log(`Sent email to ${to}: ${email.subject}`);

  await saveSeen(seenPath, [...seen.ids, ...newEvents.map((event) => event.id)]);
}

const entry = process.argv[1] ? path.parse(path.resolve(process.argv[1])).name : "";

if (entry === "monitor") {
  run().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
