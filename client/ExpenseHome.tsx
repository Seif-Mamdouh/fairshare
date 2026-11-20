import React, { useState, useEffect } from "react";
import {
  View,
  Animated,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { C, icon, Button } from "./components";
import { ExpenseCharts, ExpenseSearch } from "./ExpenseInsights";
import { Brand, useEntrance, serif, mono, display, sans } from "./design";
import { money } from "../shared/domain";
import {
  expenseImpact,
  overallBalances,
  expenseDate,
} from "../shared/presentation";
import { agentConnectionLabel } from "../shared/onboarding";
const categoryIcons: Record<string, string> = {
  "Food & drink": "coffee",
  Groceries: "shopping-cart",
  Transport: "truck",
  Stay: "home",
  Shopping: "gift",
  Other: "file-text",
};
// Neutral tiles: colour is reserved for money and for the one thing to look at.
const colors = ["#ECE8DB", "#E4E0D2", "#ECE8DB", "#E4E0D2", "#ECE8DB"];
// A group's mark: its initial, set like a ledger tab.
const monogram = (name: string) => (name.trim()[0] || "?").toUpperCase();
function Tile({ group, size = 48 }: any) {
  return (
    <View
      style={{
        width: size,
        height: size,
        backgroundColor: C.pale,
        borderWidth: 1,
        borderColor: C.rule,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text
        style={{
          fontFamily: display,
          fontSize: size * 0.46,
          fontWeight: "500",
          color: C.ink,
        }}
      >
        {monogram(group.name)}
      </Text>
    </View>
  );
}
/** Every amount in the app: tabular figures of the text face; green when it is owed to you. */
function Figure({ minor, currency, size = 18, signed = false, tone }: any) {
  const colour = tone || (signed && minor > 0 ? C.green : C.ink);
  const big = size >= 28;
  return (
    <Text
      style={{
        fontFamily: big ? display : sans,
        fontSize: size,
        lineHeight: Math.round(size * 1.2),
        fontWeight: big ? "500" : "600",
        letterSpacing: big ? -size * 0.02 : 0,
        color: colour,
        fontVariant: ["tabular-nums"],
      }}
    >
      {signed && minor > 0 ? "+" : signed && minor < 0 ? "−" : ""}
      {money(Math.abs(minor), currency)}
    </Text>
  );
}
/** A person: always a disc, so people and groups (squares) never look alike. */
function Person({ name, size = 28 }: any) {
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: C.pale,
        borderWidth: 1,
        borderColor: C.rule,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text style={{ fontSize: size * 0.43, fontWeight: "600", color: C.ink }}>
        {(name || "?")[0].toUpperCase()}
      </Text>
    </View>
  );
}
/** The logo's split disc, filled to the part of an expense that is yours. */
function Share({ part, size = 18 }: any) {
  const pct = Math.max(0, Math.min(1, part || 0)) * 100;
  return (
    <View
      style={
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: C.line,
          backgroundImage: `conic-gradient(${C.green} ${pct}%, ${C.line} 0)`,
        } as any
      }
    />
  );
}
const listNames = (names: string[]) =>
  !names.length
    ? "Just you so far"
    : names.length === 1
      ? "With " + names[0]
      : "With " +
        names.slice(0, -1).join(", ") +
        " and " +
        names[names.length - 1];
function IconButton({ name, label, onPress, color = C.ink }: any) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={h.iconButton}
    >
      {icon(name, 23, color)}
    </Pressable>
  );
}
function Balance({ amount, currency, large = false }: any) {
  return (
    <View style={{ alignItems: "flex-end" }}>
      {amount !== 0 && (
        <Figure
          minor={Math.abs(amount)}
          currency={currency}
          size={large ? 28 : 19}
          tone={amount > 0 ? C.green : C.ink}
        />
      )}
      <Text style={{ fontSize: 13, color: C.muted, marginTop: 1 }}>
        {amount > 0 ? "you are owed" : amount < 0 ? "you owe" : "settled up"}
      </Text>
    </View>
  );
}
function Empty({ iconName = "users", title, body, action }: any) {
  return (
    <View style={h.empty}>
      <View style={h.emptyIcon}>{icon(iconName, 36, C.green)}</View>
      <Text style={h.emptyTitle}>{title}</Text>
      <Text style={h.emptyBody}>{body}</Text>
      {action}
    </View>
  );
}
export function ExpenseHome({
  user,
  groups,
  group,
  groupOpen,
  onSelect,
  onBack,
  onOpen,
  onSignOut,
  onReview,
  onCopyInvite,
  onShareInvite,
  onRejectReceipt,
  notice,
  error,
  onDismissNotice,
}: any) {
  const { width } = useWindowDimensions(),
    desktop = width >= 900;
  const [nav, setNav] = useState("Groups"),
    [section, setSection] = useState("Expenses"),
    [search, setSearch] = useState(""),
    [searching, setSearching] = useState(false),
    [onlyBalances, setOnlyBalances] = useState(false);
  const mine = (g: any) =>
    g.members.find((m: any) => m.user_id === user.id)?.id;
  const balance = (g: any) => g.balances[mine(g)] || 0;
  const totals = overallBalances(groups, user.id);
  const select = (id: string) => {
    setNav("Groups");
    setSection("Expenses");
    setSearch("");
    void onSelect(id).catch(() => {});
  };
  const navigate = (value: string) => {
    onBack();
    setNav(value);
    setSearching(false);
    setSearch("");
  };
  useEffect(() => {
    if (groupOpen) setNav("Groups");
  }, [groupOpen]);
  const current = groupOpen && group;
  const entrance = useEntrance(current ? group.id : nav);
  useEffect(() => {
    setSection("Expenses");
  }, [group?.id]);
  const owner = group?.owner_id === user.id;
  const memberName = (id: string) =>
    group?.members.find((m: any) => m.id === id)?.name || "Member";
  const addExpense = () =>
    current
      ? onOpen("Add expense")
      : groups.length === 1
        ? void onSelect(groups[0].id)
            .then(() => onOpen("Add expense"))
            .catch(() => {})
        : onOpen(groups.length ? "Choose group" : "New group");
  const friends = groups.flatMap((g: any) =>
    g.members
      .filter((m: any) => m.user_id !== user.id)
      .map((m: any) => ({
        m,
        g,
        amount: g.transfers.reduce(
          (sum: number, t: any) =>
            sum +
            (t.to === mine(g) && t.from === m.id ? t.amountMinor : 0) -
            (t.from === mine(g) && t.to === m.id ? t.amountMinor : 0),
          0,
        ),
      })),
  );
  const activity = groups
    .flatMap((g: any) => [
      ...g.expenses.map((e: any) => ({
        kind: "expense",
        item: e,
        g,
        date: e.voided_at || e.created_at,
        when: e.spent_on,
      })),
      ...g.settlements.map((item: any) => ({
        kind: "payment",
        item,
        g,
        date: item.created_at,
      })),
    ])
    .sort(
      (a: any, b: any) =>
        new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  const navItems = [
    ["Groups", "grid"],
    ["Friends", "users"],
    ["Activity", "activity"],
    ["Workspace", "user", "Account"],
  ];
  const navButton = (item: string[]) => (
    <Pressable
      key={item[0]}
      accessibilityRole="tab"
      accessibilityState={{ selected: nav === item[0] }}
      accessibilityLabel={item[0]}
      onPress={() => navigate(item[0])}
      style={[
        h.navItem,
        desktop && h.sideNavItem,
        nav === item[0] && desktop && { borderColor: C.ink },
      ]}
    >
      {!desktop && icon(item[1], 24, nav === item[0] ? C.ink : C.muted)}
      <Text
        style={{
          fontSize: desktop ? 15 : 10,
          color: nav === item[0] ? C.ink : C.muted,
          fontWeight: nav === item[0] ? "600" : "400",
        }}
      >
        {item[2] || item[0]}
      </Text>
    </Pressable>
  );
  const active = (value: string) =>
    section === value ||
    (value === "Members" && ["Receipts", "Agents"].includes(section));
  const gutter = desktop ? Math.max(32, (width - 940) / 2 + 32) : 20;
  const balancesPanel = current ? (
    <View style={h.slip}>
      <Text style={[h.railTitle, { borderColor: C.ink }]}>To settle up</Text>
      {!group.transfers.length ? (
        <Text style={[h.small, { paddingVertical: 14, color: C.ink }]}>
          Nobody owes anything.
        </Text>
      ) : (
        group.transfers.map((t: any, i: number) => (
          <View
            key={i}
            style={[h.railRow, { borderColor: "rgba(24,27,24,0.2)" }]}
          >
            <Text style={[h.rowTitle, { flex: 1 }]} numberOfLines={1}>
              {t.from === mine(group)
                ? "You owe " + memberName(t.to)
                : t.to === mine(group)
                  ? memberName(t.from) + " owes you"
                  : memberName(t.from) + " owes " + memberName(t.to)}
            </Text>
            <Figure
              minor={t.amountMinor}
              currency={group.currency}
              size={17}
              tone={C.ink}
            />
            <Button
              small
              label="Mark paid"
              accessibilityLabel={`Record payment from ${memberName(t.from)} to ${memberName(t.to)}`}
              onPress={() =>
                onOpen("Record payment", {
                  from: t.from,
                  to: t.to,
                  amount: (t.amountMinor / 100).toFixed(2),
                })
              }
            />
          </View>
        ))
      )}
      {!!group.transfers.length && (
        <Text style={[h.small, { marginTop: 14, color: C.ink }]}>
          Pay each other however you like, then record it here.
        </Text>
      )}
    </View>
  ) : null;
  const groupRows = groups.filter(
    (g: any) =>
      g.name.toLowerCase().includes(search.toLowerCase()) &&
      (!onlyBalances || balance(g) !== 0),
  );
  return (
    <View style={h.root}>
      <View style={h.desktopBar}>
        <View style={[h.barInner, desktop && h.barInnerWide]}>
          <Brand inverse />
          {desktop && (
            <View style={{ flexDirection: "row", gap: 28, marginLeft: 36 }}>
              {navItems.map((item) => (
                <Pressable
                  key={item[0]}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: nav === item[0] }}
                  accessibilityLabel={item[0]}
                  onPress={() => navigate(item[0])}
                  style={[h.topNav, nav === item[0] && { borderColor: C.pink }]}
                >
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: "500",
                      color: nav === item[0] ? C.bg : "#B4C4AE",
                    }}
                  >
                    {item[2] || item[0]}
                  </Text>
                </Pressable>
              ))}
            </View>
          )}
          <View style={{ flex: 1 }} />
          {desktop && (
            <Button small accent label="Add expense" onPress={addExpense} />
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Your account"
            onPress={() => navigate("Workspace")}
            style={h.userChip}
          >
            <Text
              numberOfLines={1}
              style={{ fontSize: 15, color: C.bg, flexShrink: 1 }}
            >
              {user.name}
            </Text>
          </Pressable>
        </View>
      </View>
      <View style={h.app}>
        <View style={h.main}>
          {!current && (
            <View
              style={[
                h.toolbar,
                { paddingHorizontal: gutter },
                desktop
                  ? { paddingTop: 44, paddingBottom: 48 }
                  : { flexWrap: "wrap", paddingTop: 16, paddingBottom: 24 },
              ]}
            >
              <Text
                style={[
                  h.screenName,
                  !desktop && {
                    fontSize: 32,
                    lineHeight: 38,
                    flexBasis: "100%",
                    paddingBottom: 8,
                  },
                ]}
              >
                {nav === "Groups" && Object.keys(totals).length ? (
                  <>
                    {(() => {
                      const owed = Object.entries(totals).filter(
                          ([, n]) => (n as number) > 0,
                        ),
                        owe = Object.entries(totals).filter(
                          ([, n]) => (n as number) < 0,
                        );
                      const sums = (list: any[], colour: string) =>
                        list.map(([c, n], i) => (
                          <Text key={c}>
                            {i ? (i === list.length - 1 ? " and " : ", ") : ""}
                            <Text style={{ color: colour }}>
                              {money(Math.abs(n as number), c)}
                            </Text>
                          </Text>
                        ));
                      if (!owed.length && !owe.length)
                        return "You are all settled up.";
                      return (
                        <>
                          {!!owed.length && (
                            <>You are owed {sums(owed, C.pink)}</>
                          )}
                          {!!owed.length && !!owe.length && ", and you owe "}
                          {!owed.length && !!owe.length && "You owe "}
                          {sums(owe, C.bg)}.
                        </>
                      );
                    })()}
                  </>
                ) : nav === "Activity" ? (
                  "Recent activity"
                ) : nav === "Workspace" ? (
                  "Account"
                ) : (
                  nav
                )}
              </Text>
              {(nav === "Groups"
                ? groups.length > 5
                : nav === "Friends"
                  ? friends.length > 5
                  : nav === "Activity") && (
                <Button
                  small
                  inverse
                  label={searching ? "Close search" : "Search"}
                  onPress={() => setSearching(!searching)}
                />
              )}

              {nav === "Groups" ? (
                <Button
                  small
                  inverse
                  label="New group"
                  onPress={() => onOpen("New group")}
                />
              ) : nav === "Friends" ? (
                <Button
                  small
                  inverse
                  label="Add people"
                  onPress={() =>
                    onOpen(groups.length ? "Choose group" : "New group", {
                      intent: "people",
                    })
                  }
                />
              ) : null}
            </View>
          )}
          {searching && !current && (
            <View style={{ paddingHorizontal: gutter, paddingVertical: 10 }}>
              <TextInput
                accessibilityLabel="Search groups or people"
                value={search}
                onChangeText={setSearch}
                placeholder="Search"
                style={h.search}
              />
            </View>
          )}
          {!!notice && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Dismiss notification"
              onPress={onDismissNotice}
              style={h.notice}
            >
              <Text style={{ color: C.green, flex: 1 }}>{notice}</Text>
              {icon("x", 17, C.green)}
            </Pressable>
          )}
          {!!error && (
            <Text accessibilityRole="alert" style={h.error}>
              {error}
            </Text>
          )}
          <Animated.ScrollView
            style={entrance}
            contentContainerStyle={{
              paddingBottom: 100,
              flexGrow: 1,
              paddingHorizontal:
                !current && (nav === "Friends" || nav === "Activity")
                  ? gutter
                  : 0,
              paddingTop:
                !current && (nav === "Friends" || nav === "Activity") ? 16 : 0,
            }}
            keyboardShouldPersistTaps="handled"
          >
            {current ? (
              <>
                <View style={[h.groupHead, { paddingHorizontal: gutter }]}>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel="Back to groups"
                    onPress={onBack}
                    style={h.backLink}
                  >
                    {icon("arrow-left", 18, "#B4C4AE")}
                    <Text style={{ fontSize: 15, color: "#B4C4AE" }}>
                      Groups
                    </Text>
                  </Pressable>
                  <View style={h.groupTitleRow}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        numberOfLines={1}
                        style={[
                          h.groupName,
                          !desktop && { fontSize: 28, lineHeight: 32 },
                        ]}
                      >
                        {group.name}
                      </Text>
                      <Text
                        style={[
                          h.small,
                          { fontSize: 16, marginTop: 4, color: "#B4C4AE" },
                        ]}
                      >
                        {listNames(
                          group.members
                            .filter((m: any) => m.id !== mine(group))
                            .map((m: any) => m.name),
                        )}
                      </Text>
                    </View>
                    {!desktop && !!group.transfers.length && (
                      <Button
                        small
                        accent
                        label="Settle up"
                        onPress={() => setSection("Balances")}
                      />
                    )}
                    {desktop && (
                      <View style={{ alignItems: "flex-end" }}>
                        <Text style={[h.heroLabel, { color: "#B4C4AE" }]}>
                          {balance(group) === 0
                            ? "All settled up"
                            : balance(group) > 0
                              ? "You are owed"
                              : "You owe"}
                        </Text>
                        <Figure
                          minor={Math.abs(balance(group))}
                          currency={group.currency}
                          size={64}
                          tone={balance(group) > 0 ? C.pink : C.bg}
                        />
                      </View>
                    )}
                  </View>
                  {!desktop && (
                    <View
                      style={
                        desktop
                          ? {
                              flexDirection: "row",
                              alignItems: "flex-start",
                              gap: 56,
                              marginTop: 32,
                              marginBottom: 12,
                            }
                          : h.hero
                      }
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={[h.heroLabel, { color: "#B4C4AE" }]}>
                          {balance(group) === 0
                            ? "You are all settled up"
                            : balance(group) > 0
                              ? "You are owed"
                              : "You owe"}
                        </Text>
                        <Figure
                          minor={balance(group)}
                          currency={group.currency}
                          size={desktop ? 64 : 40}
                          tone={balance(group) > 0 ? C.pink : C.bg}
                        />
                      </View>
                      {desktop && (
                        <View style={{ width: 400 }}>{balancesPanel}</View>
                      )}
                    </View>
                  )}
                  <View
                    style={[
                      h.tabs,
                      !desktop && { gap: 14, flexWrap: "nowrap" },
                    ]}
                  >
                    {(
                      [
                        ["Expenses", "Expenses"],
                        ...(desktop ? [] : [["Balances", "Balances"]]),
                        ["Summary", "Totals"],
                        ["Search", "Search"],
                        ["People", "Members"],
                      ] as string[][]
                    ).map(([label, value]) => (
                      <Pressable
                        key={label}
                        accessibilityRole="tab"
                        accessibilityLabel={label}
                        accessibilityState={{ selected: section === value }}
                        onPress={() => setSection(value)}
                        style={[h.tab, active(value) && h.tabActive]}
                      >
                        <Text
                          style={{
                            fontSize: desktop ? 16 : 14,
                            fontWeight: "500",
                            color: active(value) ? C.bg : "#B4C4AE",
                          }}
                        >
                          {label}
                        </Text>
                      </Pressable>
                    ))}
                  </View>
                </View>
                <View
                  style={
                    desktop
                      ? {
                          flexDirection: "row",
                          alignItems: "flex-start",
                          gap: 56,
                          paddingHorizontal: gutter,
                        }
                      : undefined
                  }
                >
                  <View
                    style={[
                      { flex: 1, minWidth: 0 },
                      !desktop && { paddingHorizontal: 20 },
                    ]}
                  >
                    {section === "Expenses" && (
                      <>
                        {desktop && !!group.transfers.length && (
                          <View style={{ paddingTop: 36 }}>
                            {balancesPanel}
                          </View>
                        )}
                        {!group.expenses.some((e: any) => !e.voided_at) ? (
                          <Empty
                            iconName="file-text"
                            title={
                              group.members.length === 1
                                ? "Add your people"
                                : "No expenses here yet"
                            }
                            body={
                              group.members.length === 1
                                ? "Your group is ready. Add people by name or share an invitation to split expenses together."
                                : "Add an expense to start keeping track of who owes what."
                            }
                            action={
                              <View style={{ gap: 12 }}>
                                {group.members.length === 1 && (
                                  <Button
                                    label="Add people"
                                    onPress={() => setSection("Members")}
                                  />
                                )}
                                <Button
                                  secondary={group.members.length === 1}
                                  label="Add an expense"
                                  onPress={() => onOpen("Add expense")}
                                />
                              </View>
                            }
                          />
                        ) : (
                          group.expenses
                            .filter((e: any) => !e.voided_at)
                            .sort((a: any, b: any) =>
                              b.spent_on.localeCompare(a.spent_on),
                            )
                            .map((e: any, index: number, list: any[]) => {
                              const date = expenseDate(e.spent_on);
                              const month = date.toLocaleDateString("en-US", {
                                month: "long",
                                year: "numeric",
                              });
                              const prior = index
                                ? expenseDate(
                                    list[index - 1].spent_on,
                                  ).toLocaleDateString("en-US", {
                                    month: "long",
                                    year: "numeric",
                                  })
                                : "";
                              const net = expenseImpact(e, mine(group));
                              return (
                                <React.Fragment key={e.id}>
                                  {month !== prior && (
                                    <View style={h.monthRow}>
                                      <Text style={h.monthText}>{month}</Text>
                                    </View>
                                  )}
                                  <Pressable
                                    accessibilityRole="button"
                                    accessibilityLabel={`Expense: ${e.title}`}
                                    onPress={() =>
                                      onOpen("Expense details", { expense: e })
                                    }
                                    style={h.expenseRow}
                                  >
                                    <Text style={h.rowDate}>
                                      {date.toLocaleDateString("en-US", {
                                        month: "short",
                                        day: "numeric",
                                      })}
                                    </Text>
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                      <Text
                                        numberOfLines={1}
                                        style={h.rowTitle}
                                      >
                                        {e.title}
                                      </Text>
                                      <Text numberOfLines={1} style={h.small}>
                                        {e.paid_by === mine(group)
                                          ? "You"
                                          : memberName(e.paid_by)}{" "}
                                        paid{" "}
                                        {money(e.amount_minor, group.currency)}
                                      </Text>
                                    </View>
                                    <View style={h.expenseBalance}>
                                      {net !== 0 && (
                                        <Figure
                                          minor={net}
                                          currency={group.currency}
                                          size={18}
                                          signed
                                        />
                                      )}
                                      <Text style={h.small}>
                                        {net > 0
                                          ? "you lent"
                                          : net < 0
                                            ? "you borrowed"
                                            : "not involved"}
                                      </Text>
                                    </View>
                                  </Pressable>
                                </React.Fragment>
                              );
                            })
                        )}
                      </>
                    )}
                    {section === "Balances" && !desktop && (
                      <View style={h.section}>{balancesPanel}</View>
                    )}
                    {section === "Totals" && (
                      <View style={h.section}>
                        <ExpenseCharts group={group} />
                      </View>
                    )}
                    {section === "Search" && (
                      <View style={h.section}>
                        <ExpenseSearch
                          groups={[group]}
                          onOpen={(_g: any, e: any) =>
                            onOpen("Expense details", { expense: e })
                          }
                        />
                      </View>
                    )}
                    {section === "Members" && (
                      <View style={h.section}>
                        <Text style={h.sectionTitle}>People in this group</Text>
                        {group.members.map((m: any) => (
                          <View key={m.id} style={h.settingRow}>
                            <View style={h.friendAvatar}>
                              <Text style={{ fontSize: 18, color: C.green }}>
                                {m.name[0].toUpperCase()}
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={h.rowTitle}>
                                {m.name}
                                {m.user_id === user.id ? " (you)" : ""}
                              </Text>
                              <Text style={h.small}>
                                {m.user_id
                                  ? "Joined this group"
                                  : "Tracked by name, not joined"}
                              </Text>
                            </View>
                          </View>
                        ))}
                        {owner && (
                          <View style={{ gap: 12, marginVertical: 20 }}>
                            <Button
                              secondary
                              label="Add person by name"
                              onPress={() => onOpen("Add person")}
                            />
                            <Button
                              label="Share invitation"
                              onPress={onShareInvite}
                            />
                            <Button
                              secondary
                              label="Copy invite link"
                              onPress={onCopyInvite}
                            />
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => onOpen("Invitation link")}
                            >
                              <Text style={h.textAction}>
                                View invitation link
                              </Text>
                            </Pressable>
                            <Text style={h.small}>
                              An invitation creates the person’s own profile. A
                              person already tracked by name is not
                              automatically merged.
                            </Text>
                            <Pressable
                              accessibilityRole="button"
                              onPress={() => onOpen("Replace invitation link")}
                            >
                              <Text style={h.small}>
                                Replace invitation link
                              </Text>
                            </Pressable>
                          </View>
                        )}
                        <Text style={[h.sectionTitle, { marginTop: 24 }]}>
                          More
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setSection("Receipts")}
                          style={h.settingRow}
                        >
                          {icon("inbox", 20)}
                          <Text style={{ flex: 1 }}>Receipt inbox</Text>
                          <Text style={h.small}>
                            {
                              group.receipts.filter(
                                (r: any) => r.status === "pending",
                              ).length
                            }{" "}
                            pending
                          </Text>
                          {icon("chevron-right", 18)}
                        </Pressable>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => setSection("Agents")}
                          style={h.settingRow}
                        >
                          {icon("cpu", 20)}
                          <Text style={{ flex: 1 }}>Agent connections</Text>
                          {icon("chevron-right", 18)}
                        </Pressable>
                      </View>
                    )}
                    {section === "Receipts" && (
                      <View style={h.section}>
                        <View style={h.settingRow}>
                          <Text style={h.sectionTitle}>Receipt inbox</Text>
                          <Button
                            small
                            secondary
                            label="Add receipt"
                            onPress={() => onOpen("Submit receipt")}
                          />
                        </View>
                        <Text style={h.small}>
                          Approve drafts here, or tell your agent “submit it” to
                          save them as expenses.
                        </Text>
                        {!group.receipts.length && (
                          <Text style={{ color: C.muted, marginTop: 24 }}>
                            No receipt drafts.
                          </Text>
                        )}
                        {group.receipts.map((r: any) => (
                          <View key={r.id} style={h.receipt}>
                            <Text style={h.rowTitle}>{r.payload.title}</Text>
                            <Text style={h.small}>
                              {money(r.payload.amountMinor, group.currency)},{" "}
                              {r.status}
                            </Text>
                            {r.status === "pending" && (
                              <View
                                style={{
                                  flexDirection: "row",
                                  gap: 10,
                                  marginTop: 12,
                                }}
                              >
                                <Button
                                  small
                                  label="Review receipt"
                                  onPress={() => onReview(r)}
                                />
                                <Button
                                  small
                                  secondary
                                  label="Reject"
                                  onPress={() => onRejectReceipt(r)}
                                />
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    )}
                    {section === "Agents" && (
                      <View style={h.section}>
                        <Text style={h.railTitle}>Assistants</Text>
                        <Text
                          style={{
                            fontSize: 16,
                            lineHeight: 24,
                            color: C.ink,
                            maxWidth: 560,
                            marginTop: 16,
                            marginBottom: 20,
                          }}
                        >
                          Connect an AI assistant and it can draft expenses from
                          your receipts. Nothing posts until you say so.
                        </Text>
                        {owner && (
                          <View style={{ alignSelf: "flex-start" }}>
                            <Button
                              small
                              secondary
                              label="Connect an assistant"
                              accessibilityLabel="Set up an agent"
                              onPress={() => onOpen("Connect an agent")}
                            />
                          </View>
                        )}{" "}
                        {group.agents.map((a: any) => (
                          <View key={a.id} style={h.receipt}>
                            <Text style={h.rowTitle}>{a.name}</Text>
                            <Text style={h.small}>
                              {agentConnectionLabel(a)}
                            </Text>
                            {owner && !a.revoked_at && (
                              <View
                                style={{
                                  flexDirection: "row",
                                  gap: 10,
                                  marginTop: 12,
                                }}
                              >
                                <Button
                                  small
                                  secondary
                                  label="Setup"
                                  onPress={() =>
                                    onOpen(
                                      a.authorization_expires_at
                                        ? "Connect an agent"
                                        : "Set up agent",
                                      {
                                        agentId: a.id,
                                        name: a.name,
                                      },
                                    )
                                  }
                                />
                                <Button
                                  small
                                  secondary
                                  label="Revoke"
                                  onPress={() =>
                                    onOpen("Revoke agent", {
                                      id: a.id,
                                      name: a.name,
                                    })
                                  }
                                />
                              </View>
                            )}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              </>
            ) : nav === "Groups" ? (
              <>
                <View
                  style={
                    desktop
                      ? {
                          flexDirection: "row",
                          alignItems: "flex-start",
                          gap: 56,
                          paddingHorizontal: gutter,
                          paddingTop: 40,
                        }
                      : { paddingHorizontal: 20, paddingTop: 24 }
                  }
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={h.listHead}>
                      <Text
                        style={{
                          fontSize: 15,
                          fontWeight: "600",
                          color: C.ink,
                        }}
                      >
                        {onlyBalances ? "Groups with a balance" : "Groups"}
                      </Text>
                      {groups.length > 5 && (
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel={
                            onlyBalances
                              ? "Show all groups"
                              : "Show groups with balances"
                          }
                          onPress={() => setOnlyBalances(!onlyBalances)}
                        >
                          <Text style={h.linkish}>
                            {onlyBalances ? "Show all" : "Only unsettled"}
                          </Text>
                        </Pressable>
                      )}
                    </View>
                    {groupRows.map((g: any) => (
                      <Pressable
                        key={g.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Open ${g.name}`}
                        onPress={() => select(g.id)}
                        style={({ pressed }) => [
                          h.groupRow,
                          pressed && { backgroundColor: C.pale },
                        ]}
                      >
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={h.groupRowTitle} numberOfLines={1}>
                            {g.name}
                          </Text>
                          <Text style={[h.small, { marginTop: 2 }]}>
                            {listNames(
                              g.members
                                .filter((m: any) => m.id !== mine(g))
                                .map((m: any) => m.name),
                            )}
                          </Text>
                        </View>
                        <Balance
                          amount={balance(g)}
                          currency={g.currency}
                          large
                        />
                      </Pressable>
                    ))}
                    {!groups.length ? (
                      <Empty
                        title="Start with a group"
                        body="Create a group for a trip, home, or everyday expenses. Add your people, then your first expense."
                        action={
                          <Button
                            label="Create a group"
                            onPress={() => onOpen("New group")}
                          />
                        }
                      />
                    ) : !groupRows.length ? (
                      <Text style={{ paddingVertical: 24, color: C.muted }}>
                        No matching groups.
                      </Text>
                    ) : null}
                    {!!groups.length && (
                      <Pressable
                        accessibilityRole="button"
                        accessibilityLabel="Open an invitation link"
                        onPress={() => onOpen("Join a group")}
                        style={{ alignSelf: "flex-start", marginTop: 18 }}
                      >
                        <Text style={h.linkish}>
                          Join a group with an invitation link
                        </Text>
                      </Pressable>
                    )}
                    {!!activity.length && !!groupRows.length && (
                      <>
                        <View style={[h.listHead, { marginTop: 56 }]}>
                          <Text
                            style={{
                              fontSize: 15,
                              fontWeight: "600",
                              color: C.ink,
                            }}
                          >
                            Lately
                          </Text>
                        </View>
                        {[...activity]
                          .filter((a: any) => !a.item.voided_at)
                          .sort((a: any, b: any) =>
                            String(b.when || b.date).localeCompare(
                              String(a.when || a.date),
                            ),
                          )
                          .slice(0, 5)
                          .map((a: any) => {
                            const payer = a.g.members.find(
                              (m: any) => m.id === a.item.paid_by,
                            );
                            return (
                              <Pressable
                                key={a.item.id}
                                accessibilityRole="button"
                                onPress={() => select(a.g.id)}
                                style={h.expenseRow}
                              >
                                <Text style={h.rowDate}>
                                  {(a.kind === "expense"
                                    ? expenseDate(a.item.spent_on)
                                    : new Date(a.date)
                                  ).toLocaleDateString("en-US", {
                                    month: "short",
                                    day: "numeric",
                                  })}
                                </Text>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text style={h.rowTitle} numberOfLines={1}>
                                    {a.kind === "expense"
                                      ? a.item.title
                                      : "Payment"}
                                  </Text>
                                  <Text style={h.small} numberOfLines={1}>
                                    {a.g.name}
                                  </Text>
                                </View>
                                <Figure
                                  minor={a.item.amount_minor}
                                  currency={a.g.currency}
                                  size={19}
                                />
                              </Pressable>
                            );
                          })}
                      </>
                    )}
                  </View>
                </View>
              </>
            ) : nav === "Friends" ? (
              <>
                {!friends.length ? (
                  <Empty
                    title="Keep track with your people"
                    body="People in your groups will appear here. Open a group to add someone or share an invitation."
                    action={
                      <Button
                        label="View groups"
                        onPress={() => navigate("Groups")}
                      />
                    }
                  />
                ) : (
                  friends
                    .filter((f: any) =>
                      f.m.name.toLowerCase().includes(search.toLowerCase()),
                    )
                    .map((f: any) => (
                      <Pressable
                        key={f.g.id + f.m.id}
                        accessibilityRole="button"
                        onPress={() => select(f.g.id)}
                        style={h.groupRow}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={h.rowTitle}>{f.m.name}</Text>
                          <Text style={h.small}>{f.g.name}</Text>
                        </View>
                        <Balance amount={f.amount} currency={f.g.currency} />
                      </Pressable>
                    ))
                )}
                {!!friends.length && (
                  <Text
                    style={{
                      paddingVertical: 20,
                      color: C.muted,
                      fontSize: 13,
                      lineHeight: 19,
                    }}
                  >
                    Balances show suggested payments with you within each group.
                    Named profiles are kept separate.
                  </Text>
                )}
              </>
            ) : nav === "Activity" ? (
              <>
                {!activity.length ? (
                  <Empty
                    iconName="activity"
                    title="No activity yet"
                    body="Your group’s expenses and recorded payments will appear here."
                  />
                ) : (
                  activity
                    .filter((a: any) =>
                      (a.item.title || a.g.name)
                        .toLowerCase()
                        .includes(search.toLowerCase()),
                    )
                    .map((a: any) => {
                      const amount =
                        a.kind === "expense"
                          ? expenseImpact(a.item, mine(a.g))
                          : 0;
                      return (
                        <Pressable
                          key={a.item.id}
                          accessibilityRole="button"
                          onPress={() => select(a.g.id)}
                          style={h.activityRow}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={h.activityText}>
                              {a.kind === "expense" ? (
                                <>
                                  <Text style={{ fontWeight: "600" }}>
                                    {a.item.title}
                                  </Text>{" "}
                                  {a.item.voided_at
                                    ? "was removed"
                                    : "was added"}{" "}
                                  in{" "}
                                  <Text style={{ fontWeight: "600" }}>
                                    {a.g.name}
                                  </Text>
                                </>
                              ) : (
                                <>
                                  A payment of{" "}
                                  {money(a.item.amount_minor, a.g.currency)} was
                                  recorded in{" "}
                                  <Text style={{ fontWeight: "600" }}>
                                    {a.g.name}
                                  </Text>
                                </>
                              )}
                            </Text>
                            {amount !== 0 && (
                              <Text
                                style={{
                                  color: amount > 0 ? C.green : C.muted,
                                  fontSize: 14,
                                  marginTop: 4,
                                }}
                              >
                                {amount > 0 ? "You lent " : "You borrowed "}
                                {money(Math.abs(amount), a.g.currency)}
                              </Text>
                            )}
                            <Text style={[h.small, { marginTop: 5 }]}>
                              {new Date(a.date).toLocaleDateString("en-US", {
                                month: "short",
                                day: "numeric",
                              })}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })
                )}
              </>
            ) : (
              <View
                style={{
                  paddingHorizontal: gutter,
                  paddingTop: 28,
                }}
              >
                <Text style={[h.small, { marginBottom: 18 }]}>
                  Signed in as {user.name}.{" "}
                  {user.clerk_linked
                    ? "Sign in the same way on any device to reach this account."
                    : "Sign in with your phone number and password to reach this account from any device."}
                </Text>
                <View style={{ borderTopWidth: 1, borderColor: C.rule }} />
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Banks & private transactions"
                  onPress={() => onOpen("Banks")}
                  style={h.accountRow}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={h.groupRowTitle}>Bank transactions</Text>
                    <Text style={h.small}>
                      Split a card purchase without retyping it. Only you see
                      the list.
                    </Text>
                  </View>
                  <Text style={h.linkish}>Open</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Display name & workspace"
                  onPress={() => onOpen("Workspace")}
                  style={h.accountRow}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={h.groupRowTitle}>Display name</Text>
                    <Text style={h.small}>
                      How other people see you in groups.
                    </Text>
                  </View>
                  <Text style={h.linkish}>Open</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Sign out"
                  onPress={onSignOut}
                  style={{ alignSelf: "flex-start", marginTop: 26 }}
                >
                  <Text style={h.linkish}>Sign out</Text>
                </Pressable>
              </View>
            )}
          </Animated.ScrollView>
          {!desktop && (
            <View style={h.bottomNav}>
              {navItems.slice(0, 2).map(navButton)}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Add expense"
                onPress={addExpense}
                style={h.add}
              >
                {icon("plus", 30, "white")}
              </Pressable>
              {navItems.slice(2).map(navButton)}
            </View>
          )}
        </View>
      </View>
    </View>
  );
}
const h = StyleSheet.create({
  rowDate: { width: 64, fontSize: 14, color: C.muted },
  listHead: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
    borderBottomWidth: 1,
    borderColor: C.rule,
    paddingBottom: 10,
  },
  summary: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 56,
    paddingTop: 8,
    paddingBottom: 32,
  },
  linkish: {
    fontSize: 14,
    fontWeight: "600",
    color: C.ink,
    textDecorationLine: "underline",
  },
  railRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  railTitle: {
    fontSize: 15,
    fontWeight: "600",
    color: C.ink,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: C.rule,
  },
  rail: { width: 360, paddingTop: 28 },
  tabActive: { borderColor: C.pink },
  tab: {
    paddingVertical: 12,
    borderBottomWidth: 3,
    borderColor: "transparent",
    marginBottom: -1,
  },
  tabs: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 28,
    marginTop: 28,
    borderBottomWidth: 0,
  },
  heroLabel: { fontSize: 16, color: C.muted, marginBottom: 2 },
  hero: { marginTop: 28 },
  groupTitleRow: { flexDirection: "row", alignItems: "flex-end", gap: 16 },
  backLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    paddingVertical: 8,
    marginBottom: 12,
  },
  groupHead: {
    paddingHorizontal: 20,
    paddingTop: 20,
    backgroundColor: C.green,
  },
  userInitial: {
    width: 28,
    height: 28,
    backgroundColor: C.pale,
    borderWidth: 1,
    borderColor: C.rule,
    alignItems: "center",
    justifyContent: "center",
  },
  userChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    flexShrink: 1,
  },
  navLabel: {
    color: C.muted,
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 16,
  },
  welcome: {
    backgroundColor: C.green,
    marginHorizontal: 18,
    marginBottom: 8,
    borderRadius: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: 24,
  },
  welcomeTitle: {
    fontFamily: serif,
    fontWeight: "400",
    color: "#FAFCF5",
    letterSpacing: -0.8,
  },
  welcomeBody: {
    color: "#E0EAD5",
    lineHeight: 21,
    fontSize: 13,
    maxWidth: 340,
  },
  welcomeMark: {
    width: 96,
    height: 96,
    borderRadius: 0,
    backgroundColor: "#5B8050",
    alignItems: "center",
    justifyContent: "center",
    transform: [{ rotate: "-12deg" }],
  },
  groupCard: {
    borderWidth: 1,
    borderColor: C.line,
    marginHorizontal: 18,
    marginBottom: -1,
    backgroundColor: C.paper,
  },
  root: { flex: 1, backgroundColor: C.bg },
  app: { flex: 1, flexDirection: "row" },
  desktopBar: {
    minHeight: 68,
    backgroundColor: C.green,
    borderBottomWidth: 1,
    borderColor: "rgba(244,242,235,0.16)",
    justifyContent: "center",
  },
  topNav: {
    height: 68,
    justifyContent: "center",
    paddingTop: 2,
    borderBottomWidth: 2,
    borderColor: "transparent",
    marginBottom: -1,
  },
  slip: { backgroundColor: C.pink, padding: 28, paddingBottom: 24 },
  barInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 20,
    paddingHorizontal: 20,
    width: "100%",
  },
  barInnerWide: {
    maxWidth: 940,
    alignSelf: "center",
    paddingLeft: 32,
    paddingRight: 32,
  },
  brand: { fontSize: 25, fontWeight: "700", color: C.green, letterSpacing: -1 },
  topLabel: { color: C.muted, fontSize: 13 },
  sidebar: { width: 220, padding: 24, paddingTop: 28 },
  main: { flex: 1, backgroundColor: C.bg, minWidth: 0 },
  toolbar: {
    backgroundColor: C.green,
    minHeight: 72,
    paddingHorizontal: 20,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  screenName: {
    fontFamily: display,
    fontSize: 52,
    lineHeight: 58,
    fontWeight: "500",
    letterSpacing: -0.8,
    color: C.bg,
    flex: 1,
    paddingVertical: 20,
  },
  textAction: {
    color: C.ink,
    fontSize: 15,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  iconButton: { padding: 6 },
  search: {
    backgroundColor: C.pale,
    padding: 12,
    borderRadius: 0,
    fontSize: 16,
  },
  navItem: { flex: 1, alignItems: "center", gap: 5, paddingVertical: 10 },
  sideNavItem: {
    flex: 0,
    minHeight: 40,
    flexDirection: "row",
    justifyContent: "flex-start",
    gap: 14,
    padding: 13,
    paddingLeft: 14,
    borderLeftWidth: 2,
    borderColor: "transparent",
    marginBottom: 2,
  },
  bottomNav: {
    minHeight: 80,
    backgroundColor: C.paper,
    borderTopWidth: 1,
    borderColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingBottom: 4,
  },
  add: {
    width: 48,
    height: 48,
    borderRadius: 0,
    backgroundColor: C.ink,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 8,
  },
  overall: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: C.pink,
    marginHorizontal: 18,
    marginBottom: 14,
    paddingHorizontal: 24,
    paddingVertical: 26,
  },
  overallText: {
    fontFamily: display,
    fontSize: 30,
    lineHeight: 36,
    fontWeight: "600",
    letterSpacing: -0.4,
    color: C.ink,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  groupListAvatar: {
    width: 52,
    height: 52,
    borderRadius: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  groupRowTitle: { fontSize: 20, fontWeight: "600", color: C.ink },
  rowTitle: { fontSize: 17, fontWeight: "500", color: C.ink, lineHeight: 23 },
  small: { fontSize: 13, color: C.muted, lineHeight: 19 },
  friendAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: C.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  join: { padding: 25, alignItems: "center" },
  empty: { alignItems: "center", padding: 32, paddingTop: 60, gap: 17 },
  emptyIcon: {
    height: 82,
    width: 82,
    borderRadius: 0,
    backgroundColor: C.pale,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: {
    fontFamily: display,
    fontSize: 30,
    fontWeight: "600",
    letterSpacing: -0.4,
    color: C.ink,
    textAlign: "center",
  },
  emptyBody: {
    fontSize: 14,
    color: C.muted,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 300,
  },
  cover: { height: 96, backgroundColor: C.green, overflow: "hidden" },
  coverShape: {
    position: "absolute",
    width: 220,
    height: 220,
    backgroundColor: "#5C8251",
    transform: [{ rotate: "40deg" }],
    top: -100,
    left: 40,
  },
  coverToolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    padding: 16,
  },
  groupHeading: { paddingHorizontal: 24, paddingBottom: 16 },
  groupAvatar: {
    width: 66,
    height: 66,
    borderRadius: 0,
    backgroundColor: C.green,
    borderWidth: 4,
    borderColor: C.bg,
    marginTop: -35,
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  groupName: {
    fontFamily: display,
    fontSize: 44,
    lineHeight: 50,
    fontWeight: "600",
    letterSpacing: -0.5,
    color: C.bg,
  },
  balanceLine: {
    fontFamily: display,
    fontSize: 22,
    lineHeight: 28,
    fontWeight: "600",
    letterSpacing: -0.2,
    color: C.ink,
    marginBottom: 5,
  },
  actions: {
    alignItems: "flex-start",
    paddingHorizontal: 20,
    gap: 10,
    paddingBottom: 22,
  },
  action: {
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderWidth: 1.5,
    borderColor: C.rule,
  },
  month: {
    fontSize: 15,
    fontWeight: "600",
    color: C.ink,
    paddingTop: 28,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: C.rule,
  },
  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    gap: 16,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  date: { width: 29, alignItems: "center" },
  category: {
    width: 43,
    height: 43,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 0,
  },
  expenseBalance: { minWidth: 96, alignItems: "flex-end" },
  monthRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-end",
    paddingTop: 28,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderColor: C.rule,
  },
  monthText: { fontSize: 15, fontWeight: "600", color: C.ink },
  section: { paddingVertical: 22 },
  sectionTitle: {
    fontFamily: display,
    fontSize: 26,
    fontWeight: "600",
    letterSpacing: -0.2,
    color: C.ink,
    marginBottom: 8,
  },
  accountRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    paddingVertical: 17,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  receipt: { paddingVertical: 20, borderBottomWidth: 1, borderColor: C.line },
  sectionStrip: {
    fontSize: 12,
    color: C.muted,
    backgroundColor: C.pale,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 15,
    paddingVertical: 18,
    borderBottomWidth: 1,
    borderColor: C.line,
  },
  activityText: { fontSize: 15, color: C.ink, lineHeight: 22 },
  notice: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    backgroundColor: C.pale,
  },
  error: { color: C.red, padding: 16, backgroundColor: "#F8DAD4" },
});
