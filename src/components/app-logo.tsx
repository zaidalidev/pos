import { APP_NAME, shopLogoUrl, type LogoTone } from "@/lib/branding";
import { cn } from "@/lib/utils";

type AppLogoProps = {
  logo?: string | undefined;
  /** light = white mark (dark/primary bg), dark = black mark (light bg) */
  tone?: LogoTone;
  alt?: string;
  className?: string;
};

export function AppLogo({ logo, tone = "light", alt = APP_NAME, className }: AppLogoProps) {
  return (
    <img
      src={shopLogoUrl(logo, tone)}
      alt={alt}
      className={cn("bg-transparent object-contain object-left", className)}
    />
  );
}
