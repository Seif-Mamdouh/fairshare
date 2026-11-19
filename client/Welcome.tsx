import React, { useRef, useState } from "react";
import {
  Linking,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { SignInPanel, clerkCard } from "./clerk";
import { C, icon } from "./components";
import { Brand, Reveal, display, sans } from "./design";

/** Landing colours: paper, ink, forest, and the pink of a shop receipt. */
const L = {
  page: "#F4F2EB",
  paper: "#FFFDF8",
  ink: C.ink,
  soft: "#3D423B",
  faint: "#55594F",
  line: "#D6D4C8",
  deep: "#1D3822",
  onDeep: "#F4F2EB",
  onDeepSoft: "#C9D4C3",
  onDeepLine: "rgba(244,242,235,0.22)",
  pink: "#F5BBB2",
  onPinkLine: "rgba(24,27,24,0.30)",
};
const repo = "https://github.com/Seif-Mamdouh/fairshare";
const mono = Platform.select({
  web: "'IBM Plex Mono', ui-monospace, Menlo, monospace",
  default: undefined,
});

// Three people, equal splits. You paid the rent, so the others settle with you:
// 1,900.00 − 28.80 − 41.50 = 1,829.70 = 933.90 + 895.80.
const month = [
  ["Rent, November", "You paid $2,850.00, split three ways", "+$1,900.00"],
  ["Groceries", "Maya paid $86.40, split three ways", "−$28.80"],
  ["Friday dinner", "Theo paid $124.50, split three ways", "−$41.50"],
];
const items: [string, string, string, string][] = [
  ["Oat milk", "OAT MILK 1L", "Maya", "5.49"],
  ["Pasta, two boxes", "PASTA X2", "You", "6.40"],
  ["Eggs, a dozen", "EGGS DOZEN", "Theo", "4.25"],
  ["Dish soap", "DISH SOAP", "Everyone", "3.79"],
  ["Olive oil", "OLIVE OIL", "Everyone", "12.99"],
];

const initialAuth = (oauthRequest: unknown) =>
  !!oauthRequest ||
  (Platform.OS === "web" &&
    (new URLSearchParams(window.location.search).has("auth") ||
      window.location.hash.startsWith("#/")));

/** The welcome page, and the sign-in screen it leads to. */
export function Welcome({ user, onSession, oauthRequest }: any) {
  const { width } = useWindowDimensions();
  const desktop = width >= 1000;
  const narrow = width < 620;
  const scroll = useRef<ScrollView>(null);
  const partsY = useRef(0);
  // Sign-in has its own screen. It opens directly when the address says so:
  // Clerk's card steps (#/…), a sign-up link, or an agent connection.
  const [auth, setAuth] = useState(() => initialAuth(oauthRequest));
  // Clerk's card brings its own padding; our frame only adds the border.
  const [card, setCard] = useState(clerkCard);
  const pad = desktop ? 64 : 22;
  const go = (mode: "sign-up" | "sign-in") => {
    if (clerkCard && Platform.OS === "web") {
      window.history.pushState(
        null,
        "",
        mode === "sign-up" ? "/?auth=sign-up" : "/?auth=sign-in",
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
    setAuth(true);
  };
  const back = () => {
    if (Platform.OS === "web") window.history.pushState(null, "", "/");
    setAuth(false);
  };
  const toParts = () =>
    scroll.current?.scrollTo({ y: partsY.current, animated: true });
  const open = (path: string) => () => void Linking.openURL(repo + path);
  const Action = ({
    label,
    onPress,
    line = false,
    small = false,
  }: {
    label: string;
    onPress: () => void;
    line?: boolean;
    small?: boolean;
  }) => (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={[
        s.action,
        line && { backgroundColor: "transparent" },
        small && s.actionSmall,
      ]}
    >
      <Text
        style={[
          s.actionText,
          line && { color: L.ink },
          small && { fontSize: 15 },
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
  // One grid for the whole page: a 504px text column and a 736px ledger column.
  const row = desktop
    ? ({ flexDirection: "row", alignItems: "flex-start", gap: 72 } as const)
    : ({ gap: 32 } as const);
  const left = { flex: desktop ? 1 : undefined, minWidth: 0 };
  const right = { width: desktop ? 736 : undefined };

  if (auth)
    return (
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={s.page}
      >
        <View style={[s.header, { paddingHorizontal: pad }]}>
          <Pressable accessibilityRole="link" onPress={back}>
            <Brand tone={L.deep} />
          </Pressable>
          <Pressable accessibilityRole="link" onPress={back}>
            <Text style={s.navLink}>Back to the front page</Text>
          </Pressable>
        </View>
        <View style={[s.authWrap, { paddingHorizontal: pad }]}>
          <View style={[s.authCard, !card && { padding: 28 }]}>
            {!!oauthRequest && (
              <Text style={[s.oauth, card && { margin: 20, marginBottom: 0 }]}>
                Sign in to continue connecting your agent. You’ll choose a group
                and approve access next.
              </Text>
            )}
            <SignInPanel user={user} onSession={onSession} onCard={setCard} />
          </View>
        </View>
      </ScrollView>
    );

  const big = desktop
    ? { fontSize: 88, lineHeight: 92, letterSpacing: -2.3 }
    : { fontSize: 40, lineHeight: 43, letterSpacing: -0.9 };
  return (
    <ScrollView
      ref={scroll}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.page}
    >
      <View style={[s.header, { paddingHorizontal: pad }]}>
        <Brand tone={L.deep} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 32 }}>
          {desktop && (
            <>
              <Pressable accessibilityRole="button" onPress={toParts}>
                <Text style={s.navLink}>What it does</Text>
              </Pressable>
              <Pressable accessibilityRole="link" onPress={open("")}>
                <Text style={s.navLink}>GitHub</Text>
              </Pressable>
            </>
          )}
          <Pressable accessibilityRole="button" onPress={() => go("sign-in")}>
            <Text style={s.navLink}>Sign in</Text>
          </Pressable>
          {!narrow && (
            <Action
              small
              label="Create an account"
              onPress={() => go("sign-up")}
            />
          )}
        </View>
      </View>

      {/* Hero: the headline, then one month of shared costs set as a sum. */}
      <View style={[s.hero, { paddingHorizontal: pad }]}>
        <Reveal>
          <Text accessibilityRole="header" style={[s.title, big]}>
            Split the rent, the groceries{desktop ? `\n` : " "}and Friday’s
            dinner.
          </Text>
        </Reveal>
        <View
          style={[
            row,
            { marginTop: desktop ? 36 : 24 },
            desktop && { alignItems: "stretch" },
          ]}
        >
          <View style={left}>
            <Text style={s.intro}>
              Fairshare keeps one running tab for your household or your trip.
              It works out who owes whom to the cent and shows the fewest
              payments that settle it.
            </Text>
            <View style={s.actions}>
              <Action label="Create an account" onPress={() => go("sign-up")} />
              <Action line label="See what it does" onPress={toParts} />
            </View>
            <Text style={s.free}>
              Free and open source. Every feature included.
            </Text>
          </View>
          <View
            style={[right, { justifyContent: "flex-end" }]}
            accessibilityLabel="Example: one month of shared costs for three people"
          >
            <Text style={s.ledgerHead}>
              An example month in Apartment 4B. You are one of three.
            </Text>
            {month.map(([title, meta, amount], i) => (
              <View
                key={title}
                style={[s.ledgerRow, i === 2 && { borderBottomWidth: 0 }]}
              >
                <Text style={s.ledgerTitle}>{title}</Text>
                <Text style={s.ledgerMeta}>{narrow ? "" : meta}</Text>
                <Text style={[s.figure, i > 0 && s.debit]}>{amount}</Text>
              </View>
            ))}
            <View style={s.sumRule} />
          </View>
        </View>
      </View>
      <View style={s.pinkBand}>
        <View
          style={[
            s.sumInner,
            { paddingHorizontal: pad },
            row,
            desktop && { alignItems: "flex-end" },
            !desktop && { flexDirection: "column-reverse" },
          ]}
        >
          <View style={left}>
            <Text style={[s.label, { marginBottom: 12 }]}>
              Two payments settle it
            </Text>
            <View style={s.pay}>
              <Text style={s.ledgerTitle}>Maya pays you</Text>
              <Text style={s.figure}>$933.90</Text>
            </View>
            <View style={[s.pay, { borderBottomWidth: 1 }]}>
              <Text style={s.ledgerTitle}>Theo pays you</Text>
              <Text style={s.figure}>$895.80</Text>
            </View>
          </View>
          <View style={right}>
            <Text style={[s.label, { marginTop: 22 }]}>Owed to you</Text>
            <Text
              style={[
                s.sumTotal,
                !desktop && {
                  fontSize: narrow ? 62 : 96,
                  lineHeight: narrow ? 64 : 98,
                  letterSpacing: narrow ? -2 : -3,
                  textAlign: "left",
                },
              ]}
            >
              $1,829.70
            </Text>
          </View>
        </View>
      </View>

      {/* The three places it goes wrong. Heading left, explanation right, then the artifact. */}
      <View
        style={s.band}
        onLayout={(event) => {
          partsY.current = event.nativeEvent.layout.y;
        }}
      >
        <View style={[s.bandInner, { paddingHorizontal: pad }]}>
          <Text
            style={[
              s.title,
              { color: L.onDeep },
              desktop
                ? { fontSize: 68, lineHeight: 72, letterSpacing: -1.6 }
                : { fontSize: 34, lineHeight: 38, letterSpacing: -0.6 },
            ]}
          >
            The parts that usually{desktop ? `\n` : " "}start the argument.
          </Text>

          <View style={s.part}>
            <View style={row}>
              <View style={left}>
                <Text style={s.partTitle}>
                  The receipt nobody wants to type
                </Text>
              </View>
              <View style={right}>
                <Text style={s.partText}>
                  Photograph it. Fairshare reads the items, you say whose each
                  one is, and nothing joins the tab until the total checks out.
                </Text>
              </View>
            </View>
            <View style={[row, { marginTop: desktop ? 44 : 28 }]}>
              <View style={[left, { zIndex: 2 }]}>
                <View
                  nativeID="fs-slip"
                  style={[s.slip, !desktop && { alignSelf: "center" }]}
                >
                  <Text style={s.slipShop}>GREEN GROCER</Text>
                  <Text style={s.slipMeta}>214 KENT AVE 14 NOV 18:42</Text>
                  <View style={s.slipDash} />
                  {items.map(([, raw, whose, price]) => (
                    <View
                      key={raw}
                      nativeID={whose === "You" ? "fs-slip-you" : undefined}
                      style={[s.slipRow, whose === "You" && s.slipMarked]}
                    >
                      <Text style={s.slipText}>{raw}</Text>
                      <Text style={s.slipText}>{price}</Text>
                    </View>
                  ))}
                  <View style={s.slipDash} />
                  <View style={s.slipRow}>
                    <Text style={s.slipStrong}>TOTAL</Text>
                    <Text style={s.slipStrong}>32.92</Text>
                  </View>
                  <View style={s.slipRow}>
                    <Text style={s.slipText}>VISA 4417</Text>
                    <Text style={s.slipText}>32.92</Text>
                  </View>
                  <Text style={[s.slipMeta, { marginTop: 16 }]}>
                    5 ITEMS. THANK YOU.
                  </Text>
                </View>
              </View>
              <View style={[right, desktop && { marginTop: 32.5 }]}>
                <View style={s.tableHead}>
                  <Text style={[s.tableLabel, { flex: 1 }]}>5 items found</Text>
                  <Text style={[s.tableLabel, s.who]}>Whose</Text>
                  <Text style={[s.tableLabel, s.price]}>Price</Text>
                </View>
                {items.map(([name, , whose, price]) => {
                  const you = whose === "You";
                  return (
                    <View
                      key={name}
                      nativeID={you ? "fs-item-you" : undefined}
                      style={[
                        s.itemRow,
                        you && s.itemYou,
                        you && desktop && s.itemReach,
                      ]}
                    >
                      <Text
                        style={[s.item, { flex: 1 }, you && { color: L.ink }]}
                      >
                        {name}
                      </Text>
                      <Text
                        style={[
                          s.item,
                          s.who,
                          you && { color: L.ink, fontWeight: "700" },
                        ]}
                      >
                        {whose}
                      </Text>
                      <Text
                        style={[
                          s.figure,
                          s.onDeep,
                          s.price,
                          you && { color: L.ink },
                        ]}
                      >
                        ${price}
                      </Text>
                    </View>
                  );
                })}
                <View style={s.itemTotal}>
                  <Text style={[s.label, { flex: 1, color: L.onDeep }]}>
                    Matches the receipt total
                  </Text>
                  <Text
                    style={[
                      s.figure,
                      s.onDeep,
                      { fontSize: 30, lineHeight: 36 },
                    ]}
                  >
                    $32.92
                  </Text>
                </View>
              </View>
            </View>
          </View>

          <View style={s.part}>
            <View style={row}>
              <View style={left}>
                <Text style={s.partTitle}>The cent that vanishes</Text>
              </View>
              <View style={right}>
                <Text style={s.partText}>
                  A hundred dollars does not divide by three. However you split,
                  Fairshare makes the shares add back up to the total, and says
                  who carries the odd cent.
                </Text>
              </View>
            </View>
            <View style={s.equation}>
              {(
                [
                  ["$33.3", "4", "you carry the odd cent"],
                  ["+", "", ""],
                  ["$33.33", "", "Maya"],
                  ["+", "", ""],
                  ["$33.33", "", "Theo"],
                  ["=", "", ""],
                  ["$100.00", "", "the bill"],
                ] as [string, string, string][]
              ).map(([text, cent, label], i) => (
                <View key={i}>
                  <View style={{ flexDirection: "row" }}>
                    <Text
                      style={[
                        s.big,
                        !desktop && s.bigSmall,
                        narrow && s.bigTiny,
                      ]}
                    >
                      {text}
                    </Text>
                    {!!cent && (
                      <View style={s.cent}>
                        <Text
                          style={[
                            s.big,
                            { color: L.ink },
                            !desktop && s.bigSmall,
                            narrow && s.bigTiny,
                          ]}
                        >
                          {cent}
                        </Text>
                      </View>
                    )}
                  </View>
                  {!!label && !narrow && (
                    <Text style={s.bigLabel}>{label}</Text>
                  )}
                </View>
              ))}
            </View>
          </View>

          <View style={s.part}>
            <View style={row}>
              <View style={left}>
                <Text style={s.partTitle}>The expense everyone forgets</Text>
              </View>
              <View style={right}>
                <Text style={s.partText}>
                  Say it to Claude or any connected assistant while you still
                  remember. It writes a draft, and nothing posts until you
                  approve it.
                </Text>
              </View>
            </View>
            <View style={[row, { marginTop: desktop ? 44 : 28 }]}>
              <View style={left}>
                <View style={s.saidBox}>
                  <Text style={s.saidWho}>You, to your assistant</Text>
                  <Text style={s.said}>
                    “Add Friday’s dinner, $124.50, Theo paid, split three ways.”
                  </Text>
                </View>
              </View>
              <View style={right}>
                <View style={s.tableHead}>
                  <Text style={[s.tableLabel, { flex: 1 }]}>
                    Draft, waiting for you
                  </Text>
                </View>
                <View style={s.draftRow}>
                  <Text style={[s.item, { flex: 1, fontWeight: "600" }]}>
                    Friday dinner
                  </Text>
                  <Text style={[s.figure, s.onDeep]}>$124.50</Text>
                </View>
                <View style={s.draftRow}>
                  <Text style={[s.item, { flex: 1 }]}>
                    Theo paid. Maya and you owe him
                  </Text>
                  <Text style={[s.figure, s.onDeep]}>$41.50 each</Text>
                </View>
                <View style={s.draftActions}>
                  <View style={s.approve}>
                    <Text style={s.approveText}>Approve</Text>
                  </View>
                  <View style={s.edit}>
                    <Text style={s.editText}>Edit</Text>
                  </View>
                  <Text style={s.draftHint}>Nothing is on the tab yet.</Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>

      {/* The ending the product is for. */}
      <View style={[s.pinkBand, { zIndex: 2 }]}>
        <View style={[s.closeInner, { paddingHorizontal: pad }, row]}>
          <View style={left}>
            <Text
              style={[
                s.square,
                !desktop && {
                  fontSize: narrow ? 58 : 96,
                  lineHeight: narrow ? 60 : 98,
                  letterSpacing: narrow ? -2 : -3,
                  marginLeft: 0,
                },
              ]}
            >
              All square.
            </Text>
            <Text style={s.label}>
              Start a tab with the people you already split with.
            </Text>
            <View style={s.actions}>
              <Action label="Create an account" onPress={() => go("sign-up")} />
              <Action line label="Sign in" onPress={() => go("sign-in")} />
            </View>
          </View>
          <View
            style={[s.sheet, desktop && { marginTop: -150 }]}
            accessibilityLabel="Example: the tab after both payments"
          >
            <Text style={s.label}>Apartment 4B, November</Text>
            <Text style={s.sheetMeta}>After both payments</Text>
            {[
              ["Rent, November", "You paid", "$2,850.00"],
              ["Groceries", "Maya paid", "$86.40"],
              ["Friday dinner", "Theo paid", "$124.50"],
              ["Maya paid you", "Payment", "$933.90"],
              ["Theo paid you", "Payment", "$895.80"],
            ].map(([title, meta, amount]) => (
              <View key={title} style={s.sheetRow}>
                <Text style={s.sheetTitle}>{title}</Text>
                <Text style={s.sheetNote}>{meta}</Text>
                <Text style={[s.figure, { fontSize: 20 }]}>{amount}</Text>
              </View>
            ))}
            <View style={s.sheetFoot}>
              {["Maya", "Theo", "You"].map((name) => (
                <View key={name} style={{ flex: 1 }}>
                  <Text style={s.sheetNote}>{name} owes</Text>
                  <Text
                    style={[
                      s.figure,
                      { textAlign: "left", fontSize: 26, lineHeight: 34 },
                    ]}
                  >
                    $0.00
                  </Text>
                </View>
              ))}
            </View>
          </View>
        </View>
      </View>

      {/* Open source, for real: how to run it yourself. */}
      <View style={[s.own, { paddingHorizontal: pad }]}>
        <View style={row}>
          <View style={left}>
            <Text style={[s.partTitle, { color: L.ink }]}>
              Or run your own copy
            </Text>
            <Text style={[s.partText, { color: L.soft }]}>
              Fairshare is open source. If you would rather hold the data
              yourself, it deploys to Vercel with a Neon Postgres database.
            </Text>
          </View>
          <View style={right}>
            {[
              ["1", "Fork the repository", "github.com/Seif-Mamdouh/fairshare"],
              [
                "2",
                "Create a Neon database and apply the schema",
                "npm run db:migrate",
              ],
              ["3", "Import the fork into Vercel and set", "DATABASE_URL"],
            ].map(([n, text, code], i) => (
              <View
                key={n}
                style={[
                  s.step,
                  i === 0 && { borderTopWidth: 3, borderColor: L.ink },
                ]}
              >
                <Text style={s.stepNum}>{n}</Text>
                <Text style={s.stepText}>{text}</Text>
                <Text style={s.stepCode}>{code}</Text>
              </View>
            ))}
          </View>
        </View>
        <View style={s.footTop}>
          <Brand tone={L.deep} />
          <View style={s.footLinks}>
            <Pressable accessibilityRole="link" onPress={open("")}>
              <Text style={s.navLink}>Source on GitHub</Text>
            </Pressable>
            <Pressable
              accessibilityRole="link"
              onPress={open("/blob/main/docs/DEPLOYMENT.md")}
            >
              <Text style={s.navLink}>Deployment guide</Text>
            </Pressable>
            <Pressable
              accessibilityRole="link"
              onPress={open("/blob/main/docs/MCP_PROVIDERS.md")}
            >
              <Text style={s.navLink}>Connect an assistant</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const num = { fontVariant: ["tabular-nums" as const, "lining-nums" as const] };
const wrap = {
  width: "100%" as const,
  maxWidth: 1440,
  alignSelf: "center" as const,
};
const s = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: L.page },
  header: {
    ...wrap,
    height: 76,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  navLink: { fontFamily: sans, fontSize: 16, fontWeight: "500", color: L.ink },
  action: {
    height: 56,
    justifyContent: "center",
    backgroundColor: L.ink,
    borderWidth: 2,
    borderColor: L.ink,
    paddingHorizontal: 24,
  },
  actionSmall: { height: 42, paddingHorizontal: 16 },
  actionText: {
    fontFamily: sans,
    fontSize: 18,
    fontWeight: "600",
    color: L.page,
  },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 28 },
  title: { fontFamily: display, fontWeight: "600", color: L.ink },
  // One mid-size label style; column figures use the receipt's mono.
  label: {
    fontFamily: display,
    fontSize: 26,
    lineHeight: 32,
    fontWeight: "600",
    letterSpacing: -0.2,
    color: L.ink,
  },
  figure: {
    fontFamily: mono,
    fontSize: 24,
    lineHeight: 30,
    fontWeight: "600",
    letterSpacing: -0.6,
    color: L.ink,
    textAlign: "right",
    ...num,
  },
  debit: { fontWeight: "400", color: L.soft },
  onDeep: { color: L.onDeep },

  hero: { ...wrap, paddingTop: 22 },
  intro: { fontFamily: sans, fontSize: 20, lineHeight: 30, color: L.soft },
  free: {
    fontFamily: sans,
    fontSize: 16,
    fontWeight: "500",
    color: L.ink,
    marginTop: 18,
    marginBottom: 44,
  },
  ledgerHead: {
    fontFamily: sans,
    fontSize: 16,
    color: L.soft,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderColor: "#B9B7AA",
  },
  ledgerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 20,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: L.line,
  },
  ledgerTitle: {
    fontFamily: sans,
    fontSize: 19,
    fontWeight: "600",
    color: L.ink,
  },
  ledgerMeta: { flex: 1, fontFamily: sans, fontSize: 16, color: L.soft },
  // The sum line is the last thing on the paper; the pink begins exactly under it.
  sumRule: { height: 4, backgroundColor: L.ink },

  pinkBand: { backgroundColor: L.pink },
  sumInner: { ...wrap, paddingBottom: 52 },
  sumTotal: {
    fontFamily: display,
    fontSize: 176,
    lineHeight: 168,
    fontWeight: "600",
    letterSpacing: -6.5,
    color: L.ink,
    textAlign: "right",
    marginTop: 6,
    marginRight: 2,
    marginBottom: -12,
    ...num,
  },
  pay: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderColor: L.onPinkLine,
  },

  band: { backgroundColor: L.deep, zIndex: 1 },
  bandInner: { ...wrap, paddingTop: 104, paddingBottom: 190 },
  part: {
    marginTop: 72,
    paddingTop: 44,
    borderTopWidth: 1,
    borderColor: L.onDeepLine,
  },
  partTitle: {
    fontFamily: display,
    fontSize: 44,
    lineHeight: 48,
    fontWeight: "600",
    letterSpacing: -0.5,
    color: L.onDeep,
  },
  partText: {
    fontFamily: sans,
    fontSize: 20,
    lineHeight: 30,
    color: L.onDeepSoft,
    marginTop: 8,
    maxWidth: 620,
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 20,
    height: 44,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: L.onDeepLine,
  },
  tableLabel: { fontFamily: sans, fontSize: 16, color: L.onDeepSoft },
  who: { width: 110, textAlign: "right" },
  price: { width: 110, textAlign: "right" },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    height: 56,
    borderBottomWidth: 1,
    borderColor: L.onDeepLine,
  },
  itemYou: { backgroundColor: L.pink, borderColor: L.pink },
  // The marked row reaches back across the gutter to the receipt line it came from.
  itemReach: { marginLeft: -240, paddingLeft: 240 },
  item: { fontFamily: sans, fontSize: 19, color: L.onDeep },
  itemTotal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    height: 76,
    borderTopWidth: 3,
    borderColor: L.onDeep,
    marginTop: -1,
  },
  slip: {
    width: 344,
    backgroundColor: L.paper,
    paddingHorizontal: 30,
    paddingTop: 30,
    paddingBottom: 40,
  },
  slipShop: {
    fontFamily: mono,
    fontSize: 20,
    lineHeight: 26,
    fontWeight: "700",
    letterSpacing: 2,
    color: L.ink,
    textAlign: "center",
  },
  slipMeta: {
    fontFamily: mono,
    fontSize: 12,
    lineHeight: 18,
    color: "#5C5A52",
    textAlign: "center",
    marginTop: 6,
  },
  slipDash: {
    borderTopWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "#8C897E",
    marginVertical: 14,
  },
  slipRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    height: 34,
    paddingHorizontal: 8,
    marginHorizontal: -8,
  },
  slipMarked: { backgroundColor: L.pink, marginRight: -30, paddingRight: 30 },
  slipText: { fontFamily: mono, fontSize: 16, color: L.ink },
  slipStrong: {
    fontFamily: mono,
    fontSize: 19,
    fontWeight: "700",
    color: L.ink,
  },
  equation: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-start",
    justifyContent: "space-between",
    marginTop: 44,
  },
  big: {
    fontFamily: display,
    fontSize: 80,
    lineHeight: 90,
    fontWeight: "600",
    letterSpacing: -2.6,
    color: L.onDeep,
    ...num,
  },
  bigSmall: { fontSize: 44, lineHeight: 52, letterSpacing: -1 },
  bigTiny: { fontSize: 24, lineHeight: 32, letterSpacing: -0.4 },
  cent: { backgroundColor: L.pink, paddingHorizontal: 4, marginLeft: 2 },
  bigLabel: {
    fontFamily: sans,
    fontSize: 17,
    color: L.onDeepSoft,
    marginTop: 8,
  },
  saidBox: { borderLeftWidth: 4, borderColor: L.pink, paddingLeft: 24 },
  saidWho: {
    fontFamily: sans,
    fontSize: 16,
    color: L.onDeepSoft,
    marginBottom: 10,
  },
  said: {
    fontFamily: display,
    fontSize: 34,
    lineHeight: 42,
    fontWeight: "600",
    letterSpacing: -0.4,
    color: L.onDeep,
  },
  draftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    height: 56,
    borderBottomWidth: 1.5,
    borderStyle: "dashed",
    borderColor: "rgba(244,242,235,0.55)",
  },
  draftActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 24,
  },
  approve: {
    height: 56,
    justifyContent: "center",
    backgroundColor: L.onDeep,
    borderWidth: 2,
    borderColor: L.onDeep,
    paddingHorizontal: 24,
  },
  approveText: {
    fontFamily: sans,
    fontSize: 18,
    fontWeight: "600",
    color: L.deep,
  },
  edit: {
    height: 56,
    justifyContent: "center",
    borderWidth: 2,
    borderColor: L.onDeep,
    paddingHorizontal: 24,
  },
  editText: {
    fontFamily: sans,
    fontSize: 18,
    fontWeight: "600",
    color: L.onDeep,
  },
  draftHint: {
    fontFamily: sans,
    fontSize: 16,
    color: L.onDeepSoft,
    marginLeft: 12,
  },

  closeInner: { ...wrap, paddingTop: 72, paddingBottom: 72 },
  square: {
    fontFamily: display,
    fontSize: 158,
    lineHeight: 156,
    fontWeight: "600",
    letterSpacing: -5.5,
    color: L.ink,
    marginLeft: -5,
    marginBottom: 40,
  },
  sheet: {
    width: "100%",
    maxWidth: 440,
    backgroundColor: L.paper,
    paddingHorizontal: 28,
    paddingTop: 26,
    paddingBottom: 24,
  },
  sheetMeta: {
    fontFamily: sans,
    fontSize: 16,
    color: L.soft,
    marginBottom: 14,
  },
  sheetRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 12,
    height: 48,
    borderTopWidth: 1,
    borderColor: L.line,
    paddingTop: 12,
  },
  sheetTitle: {
    fontFamily: sans,
    fontSize: 17,
    fontWeight: "600",
    color: L.ink,
  },
  sheetNote: { flex: 1, fontFamily: sans, fontSize: 15, color: L.soft },
  sheetFoot: {
    flexDirection: "row",
    gap: 12,
    borderTopWidth: 3,
    borderColor: L.ink,
    paddingTop: 14,
  },

  own: { ...wrap, paddingTop: 88, paddingBottom: 40 },
  step: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 14,
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderColor: "#B9B7AA",
  },
  stepNum: {
    fontFamily: mono,
    fontSize: 17,
    fontWeight: "600",
    color: L.ink,
    width: 18,
  },
  stepText: {
    flex: 1,
    minWidth: 200,
    fontFamily: sans,
    fontSize: 19,
    color: L.ink,
  },
  stepCode: { fontFamily: mono, fontSize: 16, fontWeight: "500", color: L.ink },
  footTop: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    marginTop: 88,
    paddingTop: 22,
    borderTopWidth: 1,
    borderColor: "#B9B7AA",
  },
  footLinks: { flexDirection: "row", flexWrap: "wrap", gap: 32 },

  authWrap: {
    ...wrap,
    alignItems: "center",
    paddingTop: 40,
    paddingBottom: 80,
  },
  authCard: {
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: L.line,
    borderRadius: 16,
    overflow: "hidden",
    width: "100%",
    maxWidth: 440,
  },
  oauth: {
    fontFamily: sans,
    fontSize: 14,
    color: L.ink,
    backgroundColor: L.pink,
    padding: 12,
    borderRadius: 10,
    lineHeight: 21,
    marginBottom: 14,
  },
});
