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
    ? { fontSize: 104, lineHeight: 106, letterSpacing: -3 }
    : { fontSize: 40, lineHeight: 43, letterSpacing: -0.9 };
  const head = (title: string, text: string, onPaper = false) => (
    <View style={row}>
      <View style={left}>
        <Text style={[s.partTitle, onPaper && { color: L.ink }]}>{title}</Text>
      </View>
      <View style={right}>
        <Text style={[s.partText, onPaper && { color: L.soft }]}>{text}</Text>
      </View>
    </View>
  );
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
        <View style={[row, { marginTop: desktop ? 44 : 24 }]}>
          <View style={left}>
            <Text style={s.intro}>
              Fairshare keeps one running tab for your household or your trip.
              It works out who owes whom to the cent and shows the fewest
              payments that settle it.
            </Text>
            <View style={s.actions}>
              <Action label="Create an account" onPress={() => go("sign-up")} />
              <Text style={s.free}>
                Free and open source.{`\n`}Every feature included.
              </Text>
            </View>
          </View>
          <View
            style={right}
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
                <Text style={s.figure}>{amount}</Text>
              </View>
            ))}
          </View>
        </View>
        {/* The sum line runs the full measure: both columns resolve into the pink. */}
        <View style={s.sumRule} />
      </View>
      <View style={s.pinkBand}>
        <View
          style={[
            s.sumInner,
            { paddingHorizontal: pad },
            row,
            !desktop && { flexDirection: "column-reverse" },
          ]}
        >
          <View style={left}>
            <Text style={[s.label, { marginTop: 24, marginBottom: 18 }]}>
              Two payments settle it
            </Text>
            <View style={s.pay}>
              <Text style={s.ledgerTitle}>Maya pays you</Text>
              <Text style={[s.figure, s.payBig]}>$933.90</Text>
            </View>
            <View style={[s.pay, { borderBottomWidth: 1 }]}>
              <Text style={s.ledgerTitle}>Theo pays you</Text>
              <Text style={[s.figure, s.payBig]}>$895.80</Text>
            </View>
          </View>
          <View style={right}>
            <Text style={[s.label, { marginTop: 24 }]}>Owed to you</Text>
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

      {/* The three places it goes wrong: heading left, explanation right, then the working. */}
      <View
        style={s.band}
        onLayout={(event) => {
          partsY.current = event.nativeEvent.layout.y;
        }}
      >
        <View style={[s.bandInner, { paddingHorizontal: pad }]}>
          <Text style={[s.label, s.bandLabel]}>
            The parts that usually start the argument
          </Text>

          <View style={s.part}>
            {head(
              "The receipt nobody wants to type",
              "Photograph it. Fairshare reads the items and you say whose each one is. Nothing joins the tab until the items add up to the total printed on the receipt.",
            )}
            <View style={[row, { marginTop: desktop ? 40 : 28 }]}>
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
                  <Text style={[s.slipMeta, { marginTop: 12 }]}>
                    5 ITEMS. THANK YOU.
                  </Text>
                </View>
              </View>
              <View style={[right, desktop && { marginTop: tableTop }]}>
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
                      <Text style={[s.item, s.who, you && { color: L.ink }]}>
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
            {head(
              "The cent that vanishes",
              "A hundred dollars does not divide by three. However you split, Fairshare makes the shares add back up to the total, and says who carries the odd cent.",
            )}
            <View
              style={[
                row,
                { marginTop: desktop ? 40 : 28 },
                desktop && { alignItems: "stretch" },
              ]}
            >
              <View style={[left, { justifyContent: "space-between" }]}>
                {[
                  [
                    "Equal",
                    "The odd cents go to the first people in the split.",
                  ],
                  [
                    "Exact",
                    "You type the amounts. It will not save until they add up.",
                  ],
                  [
                    "By item",
                    "Each receipt line is split among whoever shared it.",
                  ],
                ].map(([kind, note]) => (
                  <View key={kind} style={s.note}>
                    <Text style={[s.label, { color: L.onDeep }]}>{kind}</Text>
                    <Text style={s.noteText}>{note}</Text>
                  </View>
                ))}
              </View>
              <View style={right}>
                {(
                  [
                    ["You", "", "$33.3", "4"],
                    ["Maya", "+", "$33.33", ""],
                    ["Theo", "+", "$33.33", ""],
                    ["The bill", "=", "$100.00", ""],
                  ] as [string, string, string, string][]
                ).map(([who, sign, text, cent], i) => (
                  <View key={i} style={[s.sumLine, i === 3 && s.sumLineTotal]}>
                    <Text style={s.sumWho}>{who}</Text>
                    <Text style={[s.big, s.sumSign, !desktop && s.bigSmall]}>
                      {sign}
                    </Text>
                    <View style={[s.sumNum, !desktop && { width: 230 }]}>
                      <Text style={[s.big, !desktop && s.bigSmall]}>
                        {text}
                      </Text>
                      {!!cent && (
                        <View style={s.cent}>
                          <Text
                            style={[
                              s.big,
                              { color: L.ink },
                              !desktop && s.bigSmall,
                            ]}
                          >
                            {cent}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={s.part}>
            {head(
              "The expense everyone forgets",
              "Say it to Claude or any connected assistant while you still remember. It writes a draft, and nothing posts until you approve it.",
            )}
            <View style={[row, { marginTop: desktop ? 40 : 28 }]}>
              <View style={left}>
                <Text style={s.tableLabel}>You, to your assistant</Text>
                <View style={{ flexDirection: "row", marginTop: 12 }}>
                  <Text style={[s.said, s.saidMark]}>“</Text>
                  <Text style={[s.said, { flex: 1 }]}>
                    Add Friday’s dinner, $124.50, Theo paid, split three ways.”
                  </Text>
                </View>
              </View>
              <View style={right}>
                <View style={s.tableHead}>
                  <Text style={[s.tableLabel, { flex: 1 }]}>
                    The draft it writes back
                  </Text>
                  <Text style={[s.tableLabel, s.price]}>Amount</Text>
                </View>
                <View style={s.draftRow}>
                  <Text style={[s.item, { flex: 1 }]}>Friday dinner</Text>
                  <Text style={[s.figure, s.onDeep]}>$124.50</Text>
                </View>
                <View style={s.draftRow}>
                  <Text style={[s.item, { flex: 1 }]}>Theo paid</Text>
                  <Text style={[s.figure, s.onDeep]}>$124.50</Text>
                </View>
                <View style={s.draftRow}>
                  <Text style={[s.item, { flex: 1 }]}>
                    Maya and you each owe him
                  </Text>
                  <Text style={[s.figure, s.onDeep]}>$41.50</Text>
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

      {/* Open source, for real: how to run it yourself. */}
      <View style={[s.own, { paddingHorizontal: pad }]}>
        <View style={row}>
          <View style={left}>
            <Text style={[s.partTitle, { color: L.ink }]}>
              Or run your own copy
            </Text>
            <Text style={[s.partText, { color: L.soft, marginTop: 16 }]}>
              Fairshare is open source. If you would rather hold the data
              yourself, it deploys to Vercel with a Neon Postgres database.
            </Text>
          </View>
          <View style={right}>
            {[
              ["1", "Fork the repository", "Seif-Mamdouh/fairshare"],
              [
                "2",
                "Create a Neon database, apply the schema",
                "npm run db:migrate",
              ],
              [
                "3",
                "Import the fork into Vercel, set the database URL",
                "DATABASE_URL",
              ],
            ].map(([n, text, code], i) => (
              <View
                key={n}
                style={[
                  s.step,
                  i === 0 && { borderTopWidth: 4, borderColor: L.ink },
                ]}
              >
                <Text style={s.stepNum}>{n}</Text>
                <Text style={s.stepText}>{text}</Text>
                <Text style={[s.figure, { fontSize: 19 }]}>{code}</Text>
              </View>
            ))}
          </View>
        </View>
      </View>

      {/* The ending the product is for. */}
      <View style={s.close}>
        <View style={[s.closeInner, { paddingHorizontal: pad }]}>
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
          <View style={[row, desktop && { alignItems: "flex-end" }]}>
            <View style={left}>
              {["Maya", "Theo", "You"].map((name) => (
                <View key={name} style={s.zeroRow}>
                  <Text style={[s.ledgerTitle, s.onDeep]}>
                    {name === "You" ? "You owe" : name + " owes"}
                  </Text>
                  <Text style={[s.figure, s.onDeep]}>$0.00</Text>
                </View>
              ))}
            </View>
            <View style={right}>
              <Text style={[s.partTitle, { maxWidth: 640 }]}>
                Start a tab with the people you already split with.
              </Text>
              <View style={s.actions}>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => go("sign-up")}
                  style={[s.action, s.actionPink]}
                >
                  <Text style={[s.actionText, { color: L.ink }]}>
                    Create an account
                  </Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => go("sign-in")}
                  style={[s.action, s.actionOnInk]}
                >
                  <Text style={[s.actionText, { color: L.onDeep }]}>
                    Sign in
                  </Text>
                </Pressable>
              </View>
            </View>
          </View>
          <View style={s.footTop}>
            <View style={{ gap: 10, flex: 1, minWidth: 280 }}>
              <Brand tone={L.onDeep} />
              <Text style={s.footText}>
                Free, with no subscription, no expense limit and every feature
                included.
              </Text>
            </View>
            <View style={s.footLinks}>
              <Pressable accessibilityRole="link" onPress={open("")}>
                <Text style={[s.navLink, s.onDeep]}>Source on GitHub</Text>
              </Pressable>
              <Pressable
                accessibilityRole="link"
                onPress={open("/blob/main/docs/DEPLOYMENT.md")}
              >
                <Text style={[s.navLink, s.onDeep]}>Deployment guide</Text>
              </Pressable>
              <Pressable
                accessibilityRole="link"
                onPress={open("/blob/main/docs/MCP_PROVIDERS.md")}
              >
                <Text style={[s.navLink, s.onDeep]}>Connect an assistant</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

// Lines the table's rows up with the receipt's.
const tableTop = 65;

const num = { fontVariant: ["tabular-nums" as const, "lining-nums" as const] };
const wrap = {
  width: "100%" as const,
  maxWidth: 1440,
  alignSelf: "center" as const,
};
const s = StyleSheet.create({
  bandLabel: {
    color: L.onDeep,
    paddingBottom: 16,
    borderBottomWidth: 4,
    borderColor: L.onDeep,
  },
  sumNum: { width: 430, flexDirection: "row", justifyContent: "flex-end" },
  close: { backgroundColor: L.ink },
  zeroRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 11,
    borderTopWidth: 1,
    borderColor: L.onDeepLine,
  },
  actionPink: { backgroundColor: L.pink, borderColor: L.pink },
  actionOnInk: { backgroundColor: "transparent", borderColor: L.onDeep },
  payBig: { fontSize: 30, lineHeight: 36 },
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
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 20,
    marginTop: 28,
  },
  title: { fontFamily: display, fontWeight: "600", color: L.ink },
  // Type rule: one mid-size label; mono for line items; the display face for answers.
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
  onDeep: { color: L.onDeep },

  hero: { ...wrap, paddingTop: 30 },
  intro: { fontFamily: sans, fontSize: 20, lineHeight: 30, color: L.soft },
  free: {
    fontFamily: sans,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: "500",
    color: L.ink,
  },
  ledgerHead: {
    fontFamily: sans,
    fontSize: 16,
    lineHeight: 30,
    color: L.soft,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderColor: "#B9B7AA",
  },
  ledgerRow: {
    flexDirection: "row",
    alignItems: "baseline",
    gap: 20,
    height: 72,
    paddingTop: 20,
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
  sumRule: { height: 4, backgroundColor: L.ink },

  pinkBand: { backgroundColor: L.pink },
  sumInner: { ...wrap, paddingBottom: 56 },
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

  band: { backgroundColor: L.deep },
  bandInner: { ...wrap, paddingTop: 96, paddingBottom: 120 },
  part: { marginTop: 72 },
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
    maxWidth: 640,
  },
  tableHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 20,
    height: 44,
    paddingBottom: 10,
    paddingRight: 14,
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
    height: 44,
    paddingRight: 14,
    borderBottomWidth: 1,
    borderColor: L.onDeepLine,
  },
  itemYou: { backgroundColor: L.pink },
  // The marked row runs from the receipt's left edge to the table's right edge.
  itemReach: { marginLeft: -576, paddingLeft: 576 },
  item: { fontFamily: sans, fontSize: 19, color: L.onDeep },
  itemTotal: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    height: 76,
    paddingRight: 14,
    borderTopWidth: 4,
    borderColor: L.onDeep,
    marginTop: -1,
  },
  slip: {
    width: 420,
    backgroundColor: L.paper,
    paddingHorizontal: 34,
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
    height: 44,
  },
  slipMarked: {
    backgroundColor: L.pink,
    marginHorizontal: -34,
    paddingHorizontal: 34,
  },
  slipText: { fontFamily: mono, fontSize: 17, color: L.ink },
  slipStrong: {
    fontFamily: mono,
    fontSize: 19,
    fontWeight: "700",
    color: L.ink,
  },
  note: {
    gap: 6,
    paddingTop: 16,
    paddingBottom: 16,
    borderTopWidth: 1,
    borderColor: L.onDeepLine,
    flex: 1,
  },
  noteText: {
    fontFamily: sans,
    fontSize: 19,
    lineHeight: 28,
    color: L.onDeepSoft,
    maxWidth: 420,
  },
  sumLine: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "flex-end",
    paddingRight: 14,
    borderTopWidth: 1,
    borderColor: L.onDeepLine,
  },
  sumLineTotal: { borderTopWidth: 4, borderColor: L.onDeep },
  sumWho: { flex: 1, fontFamily: sans, fontSize: 19, color: L.onDeepSoft },
  sumSign: { width: 90, textAlign: "right" },
  big: {
    fontFamily: display,
    fontSize: 104,
    lineHeight: 116,
    fontWeight: "600",
    letterSpacing: -3.6,
    color: L.onDeep,
    ...num,
  },
  bigSmall: { fontSize: 56, lineHeight: 66, letterSpacing: -1.6 },
  cent: { backgroundColor: L.pink, paddingHorizontal: 5, marginLeft: 3 },
  said: {
    fontFamily: display,
    fontSize: 56,
    lineHeight: 62,
    fontWeight: "600",
    letterSpacing: -1.2,
    color: L.onDeep,
  },
  saidMark: { position: "absolute", left: -28 },
  draftRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    height: 56,
    paddingRight: 14,
    borderBottomWidth: 1,
    borderColor: L.onDeepLine,
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
    borderWidth: 2,
    borderColor: L.onDeep,
    backgroundColor: L.onDeep,
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
    marginLeft: 10,
  },

  closeInner: { ...wrap, paddingTop: 88, paddingBottom: 40 },
  square: {
    fontFamily: display,
    fontSize: 232,
    lineHeight: 226,
    fontWeight: "600",
    letterSpacing: -9,
    color: L.pink,
    marginLeft: -8,
    marginBottom: 56,
  },

  own: { ...wrap, paddingTop: 104, paddingBottom: 112 },
  step: {
    flexDirection: "row",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: "#B9B7AA",
  },
  stepNum: {
    fontFamily: mono,
    fontSize: 24,
    fontWeight: "700",
    color: L.ink,
    width: 28,
  },
  stepText: {
    flex: 1,
    minWidth: 220,
    fontFamily: sans,
    fontSize: 19,
    color: L.ink,
  },
  footTop: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    justifyContent: "space-between",
    gap: 16,
    marginTop: 104,
    paddingTop: 24,
    borderTopWidth: 1,
    borderColor: L.onDeepLine,
  },
  footText: { fontFamily: sans, fontSize: 16, color: L.onDeepSoft },
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
