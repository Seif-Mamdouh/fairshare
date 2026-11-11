import React, { useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { AccountAccess } from "./AccountAccess";
import { Button, C, icon, Pills } from "./components";
import { Brand, Eyebrow, Reveal, serif } from "./design";

/** The welcome page uses the existing account flow; the illustration is explicitly a demo. */
export function Welcome({ user, onSession, oauthRequest }: any) {
  const { width } = useWindowDimensions();
  const desktop = width >= 1000;
  const scroll = useRef<ScrollView>(null);
  const formY = useRef(0);
  const [demo, setDemo] = useState("Your people");
  return (
    <ScrollView
      ref={scroll}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={s.page}
    >
      <View style={[s.header, { paddingHorizontal: desktop ? 64 : 24 }]}>
        <Brand />
        <Button
          small
          secondary
          label="Sign in →"
          onPress={() =>
            scroll.current?.scrollTo({ y: formY.current, animated: false })
          }
        />
      </View>
      <View
        style={[
          s.layout,
          {
            flexDirection: desktop ? "row" : "column",
            padding: desktop ? 64 : 24,
            gap: desktop ? 72 : 36,
          },
        ]}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Reveal>
            <Eyebrow>GOOD TIMES. FAIR SHARES.</Eyebrow>
            <Text
              accessibilityRole="header"
              style={[
                s.title,
                { fontSize: desktop ? 64 : 42, lineHeight: desktop ? 68 : 47 },
              ]}
            >
              Life is better{`\n`}when it’s shared.
            </Text>
            <Text style={s.intro}>
              The dinners, the trips, the place you call home. Keep the
              memories. We’ll help with the math.
            </Text>
          </Reveal>
          <Reveal delay={130} style={s.scene}>
            <View style={s.grid} pointerEvents="none" accessible={false}>
              {Array.from({ length: 72 }, (_, i) => (
                <View key={i} style={s.dot} />
              ))}
            </View>
            <View style={s.halo} pointerEvents="none" />
            <View style={s.demoTop}>
              <Eyebrow>HOW IT COMES TOGETHER</Eyebrow>
              <Text style={s.demoLabel}>Example</Text>
            </View>
            <View style={s.network}>
              <View style={s.linkLeft} />
              <View style={s.linkRight} />
              <Reveal key={demo + "left"} delay={220} style={s.node}>
                <Text style={s.nodeEmoji}>☕</Text>
                <Text style={s.nodeText}>
                  {demo === "Your people"
                    ? "Coffee with friends"
                    : "Scan a receipt"}
                </Text>
                <Text style={s.nodeAmount}>$18.00</Text>
              </Reveal>
              <Reveal drift style={s.hub}>
                <Brand compact inverse />
              </Reveal>
              <Reveal
                key={demo + "right"}
                delay={360}
                style={[s.node, { alignSelf: "flex-end" }]}
              >
                <Text style={s.nodeEmoji}>
                  {demo === "Your people" ? "⌂" : "✧"}
                </Text>
                <Text style={s.nodeText}>
                  {demo === "Your people" ? "A fair split" : "Tell your agent"}
                </Text>
                <Text style={s.nodeAmount}>
                  {demo === "Your people"
                    ? "$6.00 each"
                    : "“Split it three ways”"}
                </Text>
              </Reveal>
            </View>
            <View style={s.demoFooter}>
              <Pills
                items={["Your people", "Your assistant"]}
                value={demo}
                onChange={setDemo}
              />
            </View>
          </Reveal>
          <View style={s.perks}>
            {[
              ["users", "Made for your people"],
              ["check-circle", "Every feature, free"],
              ["lock", "Your private workspace"],
            ].map(([name, label]) => (
              <View key={name} style={s.perk}>
                {icon(name, 15, C.green)}
                <Text style={s.perkText}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
        <View
          onLayout={(event) => {
            formY.current = desktop ? 0 : event.nativeEvent.layout.y + 100;
          }}
          style={{
            width: desktop ? 400 : "100%",
            maxWidth: 520,
            alignSelf: desktop ? "flex-start" : "center",
          }}
        >
          <Reveal delay={180} style={s.form}>
            <Eyebrow>YOUR PEOPLE. ALL IN ONE PLACE.</Eyebrow>
            {!!oauthRequest && (
              <Text style={s.oauth}>
                Sign in to continue connecting your agent. You’ll choose a group
                and approve access next.
              </Text>
            )}
            <AccountAccess user={user} onSession={onSession} />
          </Reveal>
          <Text style={s.formFoot}>Less keeping tabs. More living life.</Text>
        </View>
      </View>
      <View style={s.bottom}>
        <Eyebrow>ROOMMATES · ROAD TRIPS · EVERYDAY LIFE</Eyebrow>
        <Text style={s.bottomTitle}>
          A little less “who owes what?”{`\n`}A lot more together.
        </Text>
        <Text style={s.bottomText}>
          Add expenses, scan receipts, or connect your favorite assistant.{`\n`}
          One shared picture, wherever life takes you.
        </Text>
        <Text style={s.copyright}>Fairshare · Expenses, together.</Text>
      </View>
    </ScrollView>
  );
}
const s = StyleSheet.create({
  page: { flexGrow: 1, backgroundColor: C.bg },
  header: {
    minHeight: 100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  layout: {
    width: "100%",
    maxWidth: 1440,
    alignSelf: "center",
    alignItems: "flex-start",
  },
  title: {
    fontFamily: serif,
    fontWeight: "400",
    letterSpacing: -2,
    color: C.ink,
    marginTop: 22,
    marginBottom: 22,
  },
  intro: { fontSize: 17, lineHeight: 27, color: C.muted, maxWidth: 450 },
  scene: {
    height: 280,
    width: "100%",
    marginTop: 34,
    overflow: "hidden",
    borderRadius: 24,
    backgroundColor: "#F3F5EC",
  },
  grid: {
    position: "absolute",
    width: "100%",
    height: "100%",
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-around",
    gap: 22,
    padding: 18,
    opacity: 0.6,
  },
  dot: { width: 2, height: 2, borderRadius: 1, backgroundColor: "#B9C8AD" },
  halo: {
    position: "absolute",
    width: 250,
    height: 250,
    borderRadius: 125,
    backgroundColor: "#DFEBCF",
    alignSelf: "center",
    top: 70,
    opacity: 0.65,
  },
  demoTop: {
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  demoLabel: { color: C.muted, fontSize: 10 },
  network: {
    flex: 1,
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 8,
  },
  linkLeft: {
    position: "absolute",
    width: "35%",
    height: 1,
    backgroundColor: "#BCD1AC",
    left: "15%",
    top: "42%",
    transform: [{ rotate: "15deg" }],
  },
  linkRight: {
    position: "absolute",
    width: "35%",
    height: 1,
    backgroundColor: "#BCD1AC",
    right: "15%",
    top: "64%",
    transform: [{ rotate: "15deg" }],
  },
  node: {
    backgroundColor: C.paper,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: C.line,
    width: "35%",
    maxWidth: 170,
    alignSelf: "flex-start",
    gap: 5,
    boxShadow: "0 5px 15px rgba(34,57,27,0.04)",
  },
  nodeEmoji: { fontSize: 21, color: C.green },
  nodeText: { fontSize: 11, color: C.muted },
  nodeAmount: { fontSize: 13, fontWeight: "600", color: C.ink },
  hub: {
    height: 62,
    width: 62,
    borderRadius: 31,
    backgroundColor: C.green,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "#F8FCF1",
  },
  demoFooter: { alignItems: "center", padding: 14 },
  perks: { flexDirection: "row", flexWrap: "wrap", gap: 18, marginTop: 24 },
  perk: { flexDirection: "row", alignItems: "center", gap: 6 },
  perkText: { fontSize: 11, color: C.muted },
  form: {
    backgroundColor: C.paper,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 22,
    padding: 28,
    gap: 26,
    boxShadow: "0 16px 48px rgba(34,57,27,0.04)",
  },
  formFoot: {
    color: C.muted,
    textAlign: "center",
    marginTop: 22,
    fontSize: 12,
  },
  oauth: {
    color: C.green,
    backgroundColor: C.pale,
    padding: 12,
    borderRadius: 10,
    lineHeight: 21,
  },
  bottom: {
    backgroundColor: C.pale,
    padding: 40,
    alignItems: "center",
    gap: 24,
  },
  bottomTitle: {
    fontFamily: serif,
    fontSize: 32,
    lineHeight: 39,
    textAlign: "center",
    color: C.ink,
  },
  bottomText: {
    color: C.muted,
    fontSize: 14,
    lineHeight: 23,
    textAlign: "center",
  },
  copyright: { fontSize: 11, color: C.green, marginTop: 24 },
});
