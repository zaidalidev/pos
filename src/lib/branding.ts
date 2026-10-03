/** App-wide product name and default logo (Settings upload overrides per shop). */
export const APP_NAME = "shoponclick";
export const APP_NAME_SHORT = "shoponclick";
/** White mark — use on dark / primary backgrounds */
export const DEFAULT_LOGO = "/dukanonclick.png?v=7";
/** Dark mark — use on light backgrounds */
export const DEFAULT_LOGO_DARK = "/dukanonclick-logo-dark.png?v=7";
export const DEFAULT_FAVICON = "/favicon-32x32.png?v=7";

export type LogoTone = "light" | "dark";

export function shopLogoUrl(logo?: string, tone: LogoTone = "light") {
  if (logo?.trim()) return logo;
  return tone === "dark" ? DEFAULT_LOGO_DARK : DEFAULT_LOGO;
}

const FAVICON_SELECTOR = 'link[data-shop-favicon="true"]';

/** Browser tab icon: custom shop logo or default favicon files. */
export function applyShopFavicon(logo?: string) {
  if (typeof document === "undefined") return;
  // Custom upload, otherwise solid favicon (white mark on brand green)
  const href = logo?.trim() ? logo : DEFAULT_FAVICON;

  let link = document.querySelector<HTMLLinkElement>(FAVICON_SELECTOR);
  if (!link) {
    link = document.createElement("link");
    link.rel = "icon";
    link.setAttribute("data-shop-favicon", "true");
    document.head.appendChild(link);
  }
  link.type = "image/png";
  link.href = href;
}

export function resetShopFavicon() {
  applyShopFavicon(undefined);
}
