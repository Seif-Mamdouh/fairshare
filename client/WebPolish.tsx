import { useEffect } from "react";
import { Platform } from "react-native";

/** CSS is scoped to interactive primitives; native keeps its platform feedback. */
export function WebPolish() {
  useEffect(() => {
    if (Platform.OS !== "web") return;
    const style = document.createElement("style");
    style.textContent = `
      [role="button"], [role="tab"], input { transition: background-color 180ms ease, border-color 180ms ease, box-shadow 180ms ease; }
      [role="button"]:focus-visible, [role="tab"]:focus-visible, input:focus-visible {
        outline: 2px solid #426B3F; outline-offset: 3px;
      }
      input:focus { border-color: #426B3F; }
      [role="tab"]:hover { background-color: #EDF3E8; }
      ::selection { background: #DCEAC8; color: #181B18; }
      @media (prefers-reduced-motion: reduce) {
        [role="button"], [role="tab"], input { transition: none; }
      }
    `;
    document.head.appendChild(style);
    return () => style.remove();
  }, []);
  return null;
}
