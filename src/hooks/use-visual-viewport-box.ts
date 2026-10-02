import * as React from "react";

const MOBILE_MQ = "(max-width: 639px)";

/** Pins a fixed dialog inside the visible viewport when the mobile keyboard is open. */
export function useVisualViewportBoxStyle(): React.CSSProperties {
  const [style, setStyle] = React.useState<React.CSSProperties>({});

  React.useLayoutEffect(() => {
    const vv = window.visualViewport;
    const mq = window.matchMedia(MOBILE_MQ);

    const sync = () => {
      if (!mq.matches || !vv) {
        setStyle({});
        return;
      }
      const margin = 12;
      // Prefer visualViewport height so the dialog sits above the soft keyboard.
      // An explicit height (when keyboard is open) makes iOS allow touch-scrolling.
      // Do NOT set `transform` here — Tailwind v4 uses the separate `translate`
      // property, and combining both double-shifts the dialog off-screen.
      const available = Math.max(140, vv.height - margin * 2);
      const keyboardOpen = vv.height < window.innerHeight * 0.9;
      setStyle({
        top: vv.offsetTop + margin,
        maxHeight: available,
        height: keyboardOpen ? available : undefined,
      });
    };

    sync();
    vv?.addEventListener("resize", sync);
    vv?.addEventListener("scroll", sync);
    window.addEventListener("resize", sync);
    mq.addEventListener("change", sync);
    return () => {
      vv?.removeEventListener("resize", sync);
      vv?.removeEventListener("scroll", sync);
      window.removeEventListener("resize", sync);
      mq.removeEventListener("change", sync);
    };
  }, []);

  return style;
}

/** Scroll a focused field into view inside a scrollable dialog (after keyboard animates). */
export function useScrollFocusedFieldIntoView(node: HTMLElement | null) {
  React.useEffect(() => {
    if (!node) return;

    const onFocusIn = (event: FocusEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      if (!node.contains(target)) return;
      if (!/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) && !target.isContentEditable) {
        return;
      }
      window.setTimeout(() => {
        target.scrollIntoView({ block: "center", inline: "nearest", behavior: "smooth" });
      }, 120);
    };

    node.addEventListener("focusin", onFocusIn);
    return () => node.removeEventListener("focusin", onFocusIn);
  }, [node]);
}
