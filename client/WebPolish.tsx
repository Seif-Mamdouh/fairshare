import { useEffect } from "react";
import { Platform } from "react-native";

/** CSS is scoped to interactive primitives; native keeps its platform feedback. */
export function WebPolish() {
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const fonts = document.createElement("link");
    fonts.rel = "stylesheet";
    fonts.href =
      "https://fonts.googleapis.com/css2?family=Funnel+Display:wght@500;600;700&family=Funnel+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap";
    document.head.appendChild(fonts);
    const style = document.createElement("style");
    style.textContent = `
      [role="button"], [role="tab"], input { transition: background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease; }
      [role="button"]:focus-visible, [role="tab"]:focus-visible, input:focus-visible {
        outline: 2px solid #1D3822; outline-offset: 3px;
      }
      input:focus { border-color: #1D3822; }
      [role="tab"]:hover { background-color: #EDF3E8; }
      /* Clerk's card footer as one quiet line: sign-up link left, Clerk's mark right. */
      .cl-footer { display: flex !important; flex-direction: row !important; flex-wrap: wrap; align-items: center !important;
        justify-content: space-between !important; gap: 8px; padding: 0 32px 16px !important; margin: 0 !important;
        background: #FFFFFF !important; border: none !important; }
      .cl-footer > div { width: auto !important; padding: 0 !important; margin: 0 !important; border: none !important;
        background: transparent !important; box-shadow: none !important; }
      .cl-footer > div::before, .cl-footer > div::after { display: none !important; }
      /* The landing page's receipt: a torn bottom edge, with a shadow that follows it. */
      #fs-slip { clip-path: polygon(0 0, 100% 0, 100.000% calc(100% - 9px), 96.154% 100%, 92.308% calc(100% - 9px), 88.462% 100%, 84.615% calc(100% - 9px), 80.769% 100%, 76.923% calc(100% - 9px), 73.077% 100%, 69.231% calc(100% - 9px), 65.385% 100%, 61.538% calc(100% - 9px), 57.692% 100%, 53.846% calc(100% - 9px), 50.000% 100%, 46.154% calc(100% - 9px), 42.308% 100%, 38.462% calc(100% - 9px), 34.615% 100%, 30.769% calc(100% - 9px), 26.923% 100%, 23.077% calc(100% - 9px), 19.231% 100%, 15.385% calc(100% - 9px), 11.538% 100%, 7.692% calc(100% - 9px), 3.846% 100%, 0.000% calc(100% - 9px)); }
      /* Section edges torn like the receipt. */
      [id^="fs-tear"] { clip-path: polygon(0 0, 100% 0, 100.000% 12%, 98.438% 100%, 96.875% 12%, 95.312% 100%, 93.750% 12%, 92.188% 100%, 90.625% 12%, 89.062% 100%, 87.500% 12%, 85.938% 100%, 84.375% 12%, 82.812% 100%, 81.250% 12%, 79.688% 100%, 78.125% 12%, 76.562% 100%, 75.000% 12%, 73.438% 100%, 71.875% 12%, 70.312% 100%, 68.750% 12%, 67.188% 100%, 65.625% 12%, 64.062% 100%, 62.500% 12%, 60.938% 100%, 59.375% 12%, 57.812% 100%, 56.250% 12%, 54.688% 100%, 53.125% 12%, 51.562% 100%, 50.000% 12%, 48.438% 100%, 46.875% 12%, 45.312% 100%, 43.750% 12%, 42.188% 100%, 40.625% 12%, 39.062% 100%, 37.500% 12%, 35.938% 100%, 34.375% 12%, 32.812% 100%, 31.250% 12%, 29.688% 100%, 28.125% 12%, 26.562% 100%, 25.000% 12%, 23.438% 100%, 21.875% 12%, 20.312% 100%, 18.750% 12%, 17.188% 100%, 15.625% 12%, 14.062% 100%, 12.500% 12%, 10.938% 100%, 9.375% 12%, 7.812% 100%, 6.250% 12%, 4.688% 100%, 3.125% 12%, 1.562% 100%, 0.000% 12%); }
      ::selection { background: #DCEAC8; color: #181B18; }
      @media (prefers-reduced-motion: reduce) {
        [role="button"], [role="tab"], input { transition: none; }
      }
    `;
    document.head.appendChild(style);
    return () => {
      style.remove();
      fonts.remove();
    };
  }, []);
  return null;
}
