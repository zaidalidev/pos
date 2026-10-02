import { useEffect } from "react";
import { applyShopFavicon } from "@/lib/branding";

export function useShopFavicon(logo?: string) {
  useEffect(() => {
    applyShopFavicon(logo);
  }, [logo]);
}
