/** WordPress `omraden` term IDs for Greater Stockholm. */
export const GREATER_STOCKHOLM_REGION_IDS = new Set([
  42, // Stockholm
  47, // Botkyrka
  227, // Haninge
  229, // Sollentuna
]);

/**
 * Fallback for events that are untagged or use a suburb that is not
 * its own område (Huddinge, Solna, Tyresö, Nacka, …).
 * Matched against title + slug + link only — never the full page footer.
 */
const GREATER_STOCKHOLM_KEYWORDS = [
  "stockholm",
  "sodermalm",
  "norrmalm",
  "ostermalm",
  "kungsholmen",
  "djurgarden",
  "vasastan",
  "vasastaden",
  "botkyrka",
  "alby",
  "fittja",
  "norsborg",
  "hallunda",
  "haninge",
  "sollentuna",
  "huddinge",
  "solna",
  "tyreso",
  "nacka",
  "sundbyberg",
  "jarfalla",
  "lidingo",
  "sodertalje",
  "taby",
  "skarpnack",
  "satra",
  "akalla",
  "farsta",
  "skarholmen",
  "hammarby",
  "bromma",
  "enskede",
  "kista",
  "tensta",
  "rinkeby",
  "vallingby",
  "spanga",
  "berwaldhallen",
  "medborgarplatsen",
  "konserthuset",
  "nordiska",
  "vasamuseet",
  "dramaten",
  "historiska museet",
  "judarskogen",
];

export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/&[a-z]+;/g, " ");
}

export function matchesGreaterStockholmKeywords(text: string): boolean {
  const haystack = normalize(text);
  return GREATER_STOCKHOLM_KEYWORDS.some((keyword) => haystack.includes(keyword));
}

export function isGreaterStockholm(event: {
  omraden: number[];
  title: string;
  slug: string;
  link: string;
}): boolean {
  if (event.omraden.some((id) => GREATER_STOCKHOLM_REGION_IDS.has(id))) {
    return true;
  }
  return matchesGreaterStockholmKeywords(`${event.title} ${event.slug} ${event.link}`);
}
