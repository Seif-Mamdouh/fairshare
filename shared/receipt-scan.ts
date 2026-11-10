export function parseReceiptText(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const money = (s: string) => {
    const m = s.match(/(-?\d[\d,]*[.,]\d{2})\s*(?:[A-Z]{3})?$/);
    return m
      ? Math.round(
          Number(m[1].replace(/,(?=\d{3})/g, "").replace(",", ".")) * 100,
        )
      : null;
  };
  let total: number | undefined,
    tax = 0,
    tip = 0;
  for (const line of lines) {
    const n = money(line);
    if (n === null || n < 0) continue;
    if (
      /\b(total|amount due|balance due)\b/i.test(line) &&
      !/sub\s*total/i.test(line)
    )
      total = n;
    else if (/\btax\b/i.test(line)) tax = n;
    else if (/\b(tip|gratuity)\b/i.test(line)) tip = n;
  }
  const items = lines
    .filter(
      (l) =>
        !/(total|tax|tip|gratuity|cash|change|credit|debit|visa|mastercard|balance|amount due|payment)/i.test(
          l,
        ),
    )
    .flatMap((l) => {
      const n = money(l);
      const label = l.replace(/[-\d,.]+\s*(?:[A-Z]{3})?$/, "").trim();
      return n && n > 0 && label && /[A-Za-z]/.test(label)
        ? [{ label: label.slice(0, 150), amountMinor: n }]
        : [];
    })
    .slice(0, 100);
  const iso = text.match(/\b(20\d{2})[-/](\d{2})[-/](\d{2})\b/),
    us = text.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d{2})\b/);
  const candidate = iso
    ? `${iso[1]}-${iso[2]}-${iso[3]}`
    : us
      ? `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`
      : undefined;
  const date =
    candidate &&
    !Number.isNaN(Date.parse(candidate)) &&
    new Date(candidate).toISOString().slice(0, 10) === candidate
      ? candidate
      : undefined;
  return {
    title: lines.find((l) => /[A-Za-z]/.test(l))?.slice(0, 150) || "",
    amountMinor: total,
    taxMinor: tax,
    tipMinor: tip,
    items,
    date,
    text: text.slice(0, 20000),
  };
}
