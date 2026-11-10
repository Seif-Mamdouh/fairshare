import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Pressable,
  ScrollView,
  TextInput,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import { C, icon, Button } from "./components";
import { ExpenseCharts, ExpenseSearch } from "./ExpenseInsights";
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
const colors = ["#DEF0E5", "#E8DFF2", "#F7E4D8", "#DFE9F3", "#F1DCE3"];
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
      <Text
        style={{
          fontSize: 12,
          color: amount > 0 ? C.green : amount < 0 ? C.red : C.muted,
        }}
      >
        {amount > 0 ? "you are owed" : amount < 0 ? "you owe" : "settled up"}
      </Text>
      {amount !== 0 && (
        <Text
          style={{
            fontSize: large ? 24 : 18,
            color: amount > 0 ? C.green : C.red,
            marginTop: 2,
          }}
        >
          {money(Math.abs(amount), currency)}
        </Text>
      )}
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
    ["Friends", "users"],
    ["Groups", "grid"],
    ["Activity", "activity"],
    ["Workspace", "user"],
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
        nav === item[0] && desktop && { backgroundColor: C.pale },
      ]}
    >
      {icon(item[1], desktop ? 21 : 24, nav === item[0] ? C.ink : "#93999B")}
      <Text
        style={{
          fontSize: desktop ? 15 : 10,
          color: nav === item[0] ? C.ink : "#93999B",
          fontWeight: nav === item[0] ? "600" : "400",
        }}
      >
        {item[0]}
      </Text>
    </Pressable>
  );
  const groupRows = groups.filter(
    (g: any) =>
      g.name.toLowerCase().includes(search.toLowerCase()) &&
      (!onlyBalances || balance(g) !== 0),
  );
  return (
    <View style={h.root}>
      {desktop && (
        <View style={h.desktopBar}>
          <Text style={h.brand}>fairshare</Text>
          <Text style={h.topLabel}>Shared expenses</Text>
          <Text style={{ marginLeft: "auto", color: C.muted }}>
            {user.name}
          </Text>
        </View>
      )}
      <View
        style={[
          h.app,
          desktop && { maxWidth: 1000, alignSelf: "center", width: "100%" },
        ]}
      >
        {desktop && (
          <View style={h.sidebar}>
            {navItems.map(navButton)}
            <View style={{ marginTop: 24 }}>
              <Button label="+ Add expense" onPress={addExpense} />
            </View>
          </View>
        )}
        <View
          style={[
            h.main,
            desktop && {
              borderLeftWidth: 1,
              borderRightWidth: 1,
              borderColor: C.line,
            },
          ]}
        >
          {!current && (
            <View style={h.toolbar}>
              <IconButton
                name="search"
                label="Search"
                onPress={() => setSearching(!searching)}
              />
              <Text style={h.screenName}>
                {nav === "Activity" ? "Recent activity" : nav}
              </Text>
              {nav === "Groups" ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onOpen("New group")}
                >
                  <Text style={h.textAction}>Create group</Text>
                </Pressable>
              ) : nav === "Friends" ? (
                <Pressable
                  accessibilityRole="button"
                  onPress={() =>
                    onOpen(groups.length ? "Choose group" : "New group", {
                      intent: "people",
                    })
                  }
                >
                  <Text style={h.textAction}>Add people</Text>
                </Pressable>
              ) : (
                <View style={{ width: 32 }} />
              )}
            </View>
          )}
          {searching && !current && (
            <View style={{ paddingHorizontal: 20, paddingBottom: 10 }}>
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
          <ScrollView
            contentContainerStyle={{ paddingBottom: 100, flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
          >
            {current ? (
              <>
                <View style={h.cover}>
                  <View style={h.coverShape} />
                  <View
                    style={[
                      h.coverShape,
                      {
                        left: "60%",
                        top: 15,
                        backgroundColor: "#228B7B",
                        transform: [{ rotate: "-35deg" }],
                      },
                    ]}
                  />
                  <View style={h.coverToolbar}>
                    <IconButton
                      name="arrow-left"
                      label="Back to groups"
                      onPress={onBack}
                      color="white"
                    />
                    <IconButton
                      name="settings"
                      label="Group settings"
                      onPress={() => setSection("Members")}
                      color="white"
                    />
                  </View>
                </View>
                <View style={h.groupHeading}>
                  <View style={h.groupAvatar}>
                    {icon("users", 34, "white")}
                  </View>
                  <Text style={h.groupName}>{group.name}</Text>
                  <Text style={h.balanceLine}>
                    {balance(group) === 0
                      ? "You are all settled up."
                      : balance(group) > 0
                        ? "You are owed "
                        : "You owe "}
                    <Text
                      style={{ color: balance(group) > 0 ? C.green : C.red }}
                    >
                      {balance(group) !== 0
                        ? money(Math.abs(balance(group)), group.currency)
                        : ""}
                    </Text>
                  </Text>
                  <Text style={h.small}>
                    {group.members.length}{" "}
                    {group.members.length === 1 ? "person" : "people"} ·{" "}
                    {group.currency}
                  </Text>
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ height: 64, flexGrow: 0 }}
                  contentContainerStyle={h.actions}
                >
                  {[
                    ["Settle up", "Balances"],
                    ["Expenses", "Expenses"],
                    ["Balances", "Balances"],
                    ["Charts", "Totals"],
                    ["Search", "Search"],
                  ].map(([label, value], i) => (
                    <Pressable
                      key={label}
                      accessibilityRole="button"
                      accessibilityLabel={label}
                      onPress={() => setSection(value)}
                      style={[
                        h.action,
                        i === 0 && {
                          backgroundColor: C.red,
                          borderColor: C.red,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 15,
                          color: i === 0 ? "white" : C.ink,
                        }}
                      >
                        {label}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
                {section === "Expenses" && (
                  <>
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
                                <Text style={h.month}>{month}</Text>
                              )}
                              <Pressable
                                accessibilityRole="button"
                                accessibilityLabel={`Expense: ${e.title}`}
                                onPress={() =>
                                  onOpen("Expense details", { expense: e })
                                }
                                style={h.expenseRow}
                              >
                                <View style={h.date}>
                                  <Text style={h.small}>
                                    {date.toLocaleDateString("en-US", {
                                      month: "short",
                                    })}
                                  </Text>
                                  <Text
                                    style={{ fontSize: 19, color: C.muted }}
                                  >
                                    {date.getDate()}
                                  </Text>
                                </View>
                                <View
                                  style={[
                                    h.category,
                                    {
                                      backgroundColor:
                                        colors[index % colors.length],
                                    },
                                  ]}
                                >
                                  {icon(
                                    categoryIcons[e.category] || "file-text",
                                    25,
                                    "#5A6666",
                                  )}
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text numberOfLines={1} style={h.rowTitle}>
                                    {e.title}
                                  </Text>
                                  <Text numberOfLines={1} style={h.small}>
                                    {e.paid_by === mine(group)
                                      ? "You"
                                      : memberName(e.paid_by)}{" "}
                                    paid {money(e.amount_minor, group.currency)}
                                  </Text>
                                </View>
                                <View style={h.expenseBalance}>
                                  <Text
                                    style={{
                                      fontSize: 11,
                                      color:
                                        net > 0
                                          ? C.green
                                          : net < 0
                                            ? C.red
                                            : C.muted,
                                    }}
                                  >
                                    {net > 0
                                      ? "you lent"
                                      : net < 0
                                        ? "you borrowed"
                                        : "not involved"}
                                  </Text>
                                  {net !== 0 && (
                                    <Text
                                      style={{
                                        fontSize: 17,
                                        color: net > 0 ? C.green : C.red,
                                      }}
                                    >
                                      {money(Math.abs(net), group.currency)}
                                    </Text>
                                  )}
                                </View>
                              </Pressable>
                            </React.Fragment>
                          );
                        })
                    )}
                  </>
                )}
                {section === "Balances" && (
                  <View style={h.section}>
                    <Text style={h.sectionTitle}>Group balances</Text>
                    {group.members.map((m: any) => (
                      <View key={m.id} style={h.settingRow}>
                        <Text style={h.rowTitle}>
                          {m.id === mine(group) ? "You" : m.name}
                        </Text>
                        <Text
                          style={{
                            color: group.balances[m.id] >= 0 ? C.green : C.red,
                          }}
                        >
                          {group.balances[m.id] >= 0
                            ? m.id === mine(group)
                              ? "are owed "
                              : "is owed "
                            : m.id === mine(group)
                              ? "owe "
                              : "owes "}
                          {money(
                            Math.abs(group.balances[m.id]),
                            group.currency,
                          )}
                        </Text>
                      </View>
                    ))}
                    <Text style={[h.sectionTitle, { marginTop: 28 }]}>
                      Settle up
                    </Text>
                    {!group.transfers.length ? (
                      <Text style={h.small}>No payments needed.</Text>
                    ) : (
                      group.transfers.map((t: any, i: number) => (
                        <Pressable
                          key={i}
                          accessibilityRole="button"
                          accessibilityLabel={`Record payment from ${memberName(t.from)} to ${memberName(t.to)}`}
                          onPress={() =>
                            onOpen("Record payment", {
                              from: t.from,
                              to: t.to,
                              amount: (t.amountMinor / 100).toFixed(2),
                            })
                          }
                          style={h.settingRow}
                        >
                          <View style={{ flex: 1 }}>
                            <Text style={h.rowTitle}>
                              {memberName(t.from)} → {memberName(t.to)}
                            </Text>
                            <Text style={h.small}>
                              Record an external payment
                            </Text>
                          </View>
                          <Text style={{ color: C.green, fontWeight: "600" }}>
                            {money(t.amountMinor, group.currency)}
                          </Text>
                          {icon("chevron-right", 18)}
                        </Pressable>
                      ))
                    )}
                    <Text style={[h.small, { marginTop: 18 }]}>
                      Payments happen outside Fairshare. Recording one updates
                      the balances.
                    </Text>
                  </View>
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
                              : "Tracked by name · not joined"}
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
                          <Text style={h.textAction}>View invitation link</Text>
                        </Pressable>
                        <Text style={h.small}>
                          An invitation creates the person’s own profile. A
                          person already tracked by name is not automatically
                          merged.
                        </Text>
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => onOpen("Replace invitation link")}
                        >
                          <Text style={h.small}>Replace invitation link</Text>
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
                          {money(r.payload.amountMinor, group.currency)} ·{" "}
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
                    <Text style={h.sectionTitle}>Agent connections</Text>
                    <Text style={[h.small, { marginBottom: 20 }]}>
                      Optional assistants can prepare drafts and post them as
                      expenses when you ask. They can also correct or void their
                      own posted expenses and reject unwanted drafts.
                    </Text>
                    {owner && (
                      <Button
                        label="Set up an agent"
                        onPress={() => onOpen("Connect an agent")}
                      />
                    )}{" "}
                    {group.agents.map((a: any) => (
                      <View key={a.id} style={h.receipt}>
                        <Text style={h.rowTitle}>{a.name}</Text>
                        <Text style={h.small}>{agentConnectionLabel(a)}</Text>
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
              </>
            ) : nav === "Groups" ? (
              <>
                <View style={h.overall}>
                  <View style={{ flex: 1 }}>
                    {Object.entries(totals).length ? (
                      Object.entries(totals).map(([currency, amount]) => (
                        <Text key={currency} style={h.overallText}>
                          Overall,{" "}
                          {amount === 0
                            ? "you are settled up"
                            : amount > 0
                              ? "you are owed "
                              : "you owe "}
                          <Text style={{ color: amount > 0 ? C.green : C.red }}>
                            {amount !== 0
                              ? money(Math.abs(amount), currency)
                              : ""}
                          </Text>
                        </Text>
                      ))
                    ) : (
                      <Text style={h.overallText}>Your groups</Text>
                    )}
                  </View>
                  <IconButton
                    name="sliders"
                    label={
                      onlyBalances
                        ? "Show all groups"
                        : "Show groups with balances"
                    }
                    onPress={() => setOnlyBalances(!onlyBalances)}
                  />
                </View>
                {onlyBalances && (
                  <Text
                    style={[
                      h.small,
                      { paddingHorizontal: 20, paddingBottom: 12 },
                    ]}
                  >
                    Showing groups with a balance
                  </Text>
                )}
                {groupRows.map((g: any, i: number) => (
                  <Pressable
                    key={g.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Open ${g.name}`}
                    onPress={() => select(g.id)}
                    style={h.groupRow}
                  >
                    <View
                      style={[
                        h.groupListAvatar,
                        {
                          backgroundColor: ["#397C76", "#7C5164", "#466C87"][
                            i % 3
                          ],
                        },
                      ]}
                    >
                      {icon("users", 27, "white")}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={h.groupRowTitle} numberOfLines={1}>
                        {g.name}
                      </Text>
                      <Text style={[h.small, { marginTop: 5 }]}>
                        {g.members.length}{" "}
                        {g.members.length === 1 ? "person" : "people"} ·{" "}
                        {g.expenses.filter((e: any) => !e.voided_at).length}{" "}
                        expenses
                      </Text>
                    </View>
                    <Balance amount={balance(g)} currency={g.currency} />
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
                  <Text style={{ padding: 24, color: C.muted }}>
                    No matching groups.
                  </Text>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onOpen("Join a group")}
                  style={h.join}
                >
                  <Text style={h.textAction}>Open an invitation link</Text>
                </Pressable>
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
                        <View style={h.friendAvatar}>
                          <Text style={{ fontSize: 22, color: C.green }}>
                            {f.m.name[0].toUpperCase()}
                          </Text>
                        </View>
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
                      padding: 20,
                      color: C.muted,
                      fontSize: 12,
                      lineHeight: 18,
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
                          <View
                            style={[h.category, { backgroundColor: "#E3EDE7" }]}
                          >
                            {icon(
                              a.kind === "expense"
                                ? "file-text"
                                : "check-circle",
                              25,
                            )}
                          </View>
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
                                  color: amount > 0 ? C.green : C.red,
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
              <View>
                <View style={[h.groupRow, { paddingVertical: 26 }]}>
                  <View style={h.friendAvatar}>
                    {icon("user", 28, C.green)}
                  </View>
                  <View>
                    <Text style={h.groupRowTitle}>{user.name}</Text>
                    <Text style={h.small}>Private account</Text>
                  </View>
                </View>
                <Text style={h.sectionStrip}>WORKSPACE</Text>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onOpen("Search expenses")}
                  style={[h.settingRow, { paddingHorizontal: 20 }]}
                >
                  {icon("search", 22)}
                  <Text style={{ flex: 1, fontSize: 16 }}>
                    Search all expenses
                  </Text>
                  {icon("chevron-right", 18)}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onOpen("Banks")}
                  style={[h.settingRow, { paddingHorizontal: 20 }]}
                >
                  {icon("credit-card", 22)}
                  <Text style={{ flex: 1, fontSize: 16 }}>
                    Banks & private transactions
                  </Text>
                  {icon("chevron-right", 18)}
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => onOpen("Workspace")}
                  style={[h.settingRow, { paddingHorizontal: 20 }]}
                >
                  {icon("smartphone", 22)}
                  <Text style={{ flex: 1, fontSize: 16 }}>
                    Display name & workspace
                  </Text>
                  {icon("chevron-right", 18)}
                </Pressable>
                <Text
                  style={{
                    padding: 20,
                    color: C.muted,
                    fontSize: 13,
                    lineHeight: 21,
                  }}
                >
                  Sign in with your phone number and password to access the same
                  private account from any device.
                </Text>
                <Text style={{ padding: 20, color: C.muted, fontSize: 12 }}>
                  Fairshare · shared expenses for your people
                </Text>
              </View>
            )}
          </ScrollView>
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
  root: { flex: 1, backgroundColor: "#FAFBFB" },
  app: { flex: 1, flexDirection: "row" },
  desktopBar: {
    height: 58,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderColor: C.line,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 32,
    gap: 24,
  },
  brand: { fontSize: 25, fontWeight: "700", color: C.green, letterSpacing: -1 },
  topLabel: { color: C.muted, fontSize: 13 },
  sidebar: { width: 215, padding: 20 },
  main: { flex: 1, backgroundColor: "white", minWidth: 0 },
  toolbar: {
    height: 72,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  screenName: { fontSize: 24, fontWeight: "600", color: C.ink, flex: 1 },
  textAction: { color: C.green, fontSize: 15, fontWeight: "600" },
  iconButton: { padding: 6 },
  search: {
    backgroundColor: "#F1F4F3",
    padding: 12,
    borderRadius: 5,
    fontSize: 16,
  },
  navItem: { flex: 1, alignItems: "center", gap: 5, paddingVertical: 10 },
  sideNavItem: {
    flex: 0,
    minHeight: 48,
    flexDirection: "row",
    justifyContent: "flex-start",
    gap: 14,
    padding: 13,
    borderRadius: 5,
    marginBottom: 6,
  },
  bottomNav: {
    height: 74,
    backgroundColor: "#fff",
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
    borderRadius: 24,
    backgroundColor: "#1CB99A",
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 8,
  },
  overall: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 23,
  },
  overallText: {
    fontSize: 18,
    fontWeight: "600",
    color: C.ink,
    lineHeight: 26,
  },
  groupRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    paddingHorizontal: 22,
    paddingVertical: 18,
  },
  groupListAvatar: {
    width: 52,
    height: 52,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  groupRowTitle: { fontSize: 18, color: C.ink },
  rowTitle: { fontSize: 16, color: C.ink, lineHeight: 23 },
  small: { fontSize: 12, color: C.muted, lineHeight: 18 },
  friendAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#E4F0EC",
    alignItems: "center",
    justifyContent: "center",
  },
  join: { padding: 25, alignItems: "center" },
  empty: { alignItems: "center", padding: 32, paddingTop: 60, gap: 17 },
  emptyIcon: {
    height: 82,
    width: 82,
    borderRadius: 41,
    backgroundColor: "#ECF5F1",
    alignItems: "center",
    justifyContent: "center",
  },
  emptyTitle: { fontSize: 21, color: C.ink, textAlign: "center" },
  emptyBody: {
    fontSize: 14,
    color: C.muted,
    textAlign: "center",
    lineHeight: 22,
    maxWidth: 300,
  },
  cover: { height: 120, backgroundColor: "#37766F", overflow: "hidden" },
  coverShape: {
    position: "absolute",
    width: 220,
    height: 220,
    backgroundColor: "#438F81",
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
    borderRadius: 9,
    backgroundColor: "#226B62",
    borderWidth: 4,
    borderColor: "white",
    marginTop: -35,
    marginBottom: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  groupName: { fontSize: 28, color: C.ink, marginBottom: 8 },
  balanceLine: { fontSize: 16, color: C.ink, marginBottom: 5 },
  actions: {
    alignItems: "flex-start",
    paddingHorizontal: 20,
    gap: 10,
    paddingBottom: 22,
  },
  action: {
    paddingHorizontal: 15,
    paddingVertical: 10,
    borderWidth: 1,
    borderBottomWidth: 2,
    borderColor: "#E5E7E6",
    borderRadius: 5,
  },
  month: {
    fontSize: 13,
    fontWeight: "600",
    color: C.ink,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 9,
  },
  expenseRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 18,
    gap: 12,
  },
  date: { width: 29, alignItems: "center" },
  category: {
    width: 43,
    height: 43,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 2,
  },
  expenseBalance: { width: 82, alignItems: "flex-end" },
  section: { padding: 22 },
  sectionTitle: {
    fontSize: 18,
    color: C.ink,
    fontWeight: "600",
    marginBottom: 8,
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
    backgroundColor: "#F0F2F2",
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  activityRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 15,
    padding: 20,
    borderBottomWidth: 1,
    borderColor: "#F0F2F2",
  },
  activityText: { fontSize: 15, color: C.ink, lineHeight: 22 },
  notice: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    backgroundColor: C.pale,
  },
  error: { color: C.red, padding: 16, backgroundColor: "#FFF1E8" },
});
