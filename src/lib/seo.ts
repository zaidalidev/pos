import { APP_NAME } from "@/lib/branding";

/** Public site origin — set VITE_SITE_URL in production (no trailing slash). */
export const SITE_URL = (
  (import.meta.env["VITE_SITE_URL"] as string | undefined)?.trim() ||
  "https://shoponclick.com"
).replace(/\/$/, "");

export const SITE_TAGLINE = "Simple POS & Inventory Management for Your Shop";

export const SITE_DESCRIPTION =
  "shoponclick is a simple POS and inventory system for accessories shops in Pakistan. Sell faster, track stock, manage customers, suppliers, and accounts — all in one place.";

export const SITE_KEYWORDS = [
  "POS software Pakistan",
  "inventory management",
  "accessories shop POS",
  "mobile accessories software",
  "shop management software",
  "point of sale Pakistan",
  "stock management",
  "shoponclick",
  "dukan software",
].join(", ");

export const OG_IMAGE = "/og-image.png";

export function absoluteUrl(path = "/") {
  if (/^https?:\/\//i.test(path)) return path;
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${SITE_URL}${normalized === "/" ? "" : normalized}` || SITE_URL;
}

type PageHeadOptions = {
  /** Path for canonical + og:url (e.g. "/login"). */
  path?: string;
  /** Allow search indexing. Default true for marketing/auth pages. */
  index?: boolean;
  /** Open Graph type. */
  ogType?: "website" | "article";
  /** Absolute or site-relative image path. */
  image?: string;
};

/** Shared document head for route `head:` callbacks. */
export function pageHead(title: string, description: string, options: PageHeadOptions = {}) {
  const fullTitle = title.includes(APP_NAME) ? title : `${title} — ${APP_NAME}`;
  const image = absoluteUrl(options.image ?? OG_IMAGE);
  const url = options.path ? absoluteUrl(options.path) : undefined;
  const robots =
    options.index === undefined
      ? null
      : options.index
        ? "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
        : "noindex, nofollow";

  return () => ({
    meta: [
      { title: fullTitle },
      { name: "description", content: description },
      { name: "keywords", content: SITE_KEYWORDS },
      ...(robots ? [{ name: "robots", content: robots }] : []),
      { name: "author", content: APP_NAME },
      { name: "creator", content: APP_NAME },
      { name: "publisher", content: APP_NAME },
      { name: "geo.region", content: "PK" },
      { property: "og:site_name", content: APP_NAME },
      { property: "og:locale", content: "en_PK" },
      { property: "og:type", content: options.ogType ?? "website" },
      { property: "og:title", content: fullTitle },
      { property: "og:description", content: description },
      { property: "og:image", content: image },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: `${APP_NAME} — ${SITE_TAGLINE}` },
      ...(url ? [{ property: "og:url", content: url }] : []),
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: fullTitle },
      { name: "twitter:description", content: description },
      { name: "twitter:image", content: image },
      { name: "twitter:image:alt", content: `${APP_NAME} — ${SITE_TAGLINE}` },
    ],
    links: url ? [{ rel: "canonical", href: url }] : [],
  });
}

/** Public marketing/auth pages — indexable with canonical URL. */
export function publicPageHead(title: string, description: string, path: string) {
  return pageHead(title, description, { index: true, path });
}

/** Authenticated / admin screens — keep out of search results. */
export function privatePageHead(title: string, description: string) {
  return pageHead(title, description, { index: false });
}

export function softwareApplicationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: APP_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    description: SITE_DESCRIPTION,
    url: SITE_URL,
    image: absoluteUrl(OG_IMAGE),
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "PKR",
    },
    areaServed: {
      "@type": "Country",
      name: "Pakistan",
    },
    publisher: {
      "@type": "Organization",
      name: APP_NAME,
      url: SITE_URL,
      logo: absoluteUrl("/dukanonclick.png"),
    },
  };
}

export function organizationJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: APP_NAME,
    url: SITE_URL,
    logo: absoluteUrl("/dukanonclick.png"),
    description: SITE_DESCRIPTION,
    areaServed: "PK",
  };
}

export function webSiteJsonLd() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: APP_NAME,
    alternateName: ["Shop on Click", "ShopOnClick", "Dukan on Click"],
    url: SITE_URL,
    description: SITE_DESCRIPTION,
    inLanguage: "en-PK",
    publisher: {
      "@type": "Organization",
      name: APP_NAME,
      url: SITE_URL,
    },
  };
}

export function jsonLdScript(...graphs: Record<string, unknown>[]) {
  return {
    type: "application/ld+json" as const,
    children: JSON.stringify(graphs.length === 1 ? graphs[0] : graphs),
  };
}
