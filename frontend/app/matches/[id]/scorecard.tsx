import { View, Text, Pressable, ScrollView, ActivityIndicator, Image } from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth, fileUrl } from "@/src/auth";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface },
  hbtn: { padding: 6 },
  htitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: c.onSurface },
  tabs: { flexDirection: "row", backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  tab: { flex: 1, paddingVertical: 14, alignItems: "center" },
  tabActive: { borderBottomWidth: 3, borderBottomColor: c.brandPrimary },
  tabText: { color: c.muted, fontWeight: "700", fontSize: 13 },
  tabTextActive: { color: c.brandPrimary },
  scoreCard: { padding: 16, backgroundColor: c.brandPrimary },
  scoreTeam: { color: "#DBEAFE", fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  scoreValue: { color: c.onBrandPrimary, fontSize: 32, fontWeight: "800", marginTop: 4 },
  scoreOvers: { color: "#DBEAFE", fontSize: 13, marginTop: 2 },
  tossLine: { color: "#DBEAFE", fontSize: 12, marginTop: 6 },

  tableHead: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 10, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  colBat: { flex: 3 },
  col: { flex: 1, textAlign: "right" },
  colWide: { flex: 1.2, textAlign: "right" },
  headText: { fontSize: 11, fontWeight: "700", color: c.muted, letterSpacing: 0.5, textTransform: "uppercase" },
  row: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, alignItems: "center", borderBottomWidth: 1, borderBottomColor: c.divider, backgroundColor: c.surface },
  rowText: { fontSize: 14, color: c.onSurface },
  rowTextBold: { fontWeight: "800" },
  batAvatar: { width: 32, height: 32, borderRadius: 999, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden", marginRight: 10 },
  batAvatarImg: { width: 32, height: 32, borderRadius: 999 },
  batAvatarText: { color: c.onBrandTertiary, fontWeight: "700", fontSize: 12 },
  batTop: { flexDirection: "row", alignItems: "center" },
  batName: { color: c.onSurface, fontWeight: "700", fontSize: 14 },
  outTag: { color: c.muted, fontSize: 11, marginTop: 2 },
  strikerBadge: { marginLeft: 6, color: c.brandPrimary, fontWeight: "900" },
  empty: { alignItems: "center", padding: 30 },
  emptyText: { color: c.muted, marginTop: 8 },
  extraLine: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.surface },
  extraText: { color: c.muted, fontSize: 13 },
  sectionHead: { fontSize: 12, fontWeight: "700", color: c.muted, letterSpacing: 1, marginHorizontal: 16, marginTop: 20, marginBottom: 8, textTransform: "uppercase" },
}));

export default function Scorecard() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { apiFetch, token } = useAuth();
  const [match, setMatch] = useState<any>(null);
  const [teamA, setTeamA] = useState<any>(null);
  const [teamB, setTeamB] = useState<any>(null);
  const [tab, setTab] = useState<"a" | "b">("a");

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/matches/${id}`);
      if (r.ok) {
        const d = await r.json();
        setMatch(d.match);
        const [rA, rB] = await Promise.all([apiFetch(`/api/teams/${d.match.team_a_id}`), apiFetch(`/api/teams/${d.match.team_b_id}`)]);
        if (rA.ok) setTeamA((await rA.json()).team);
        if (rB.ok) setTeamB((await rB.json()).team);
        if (d.match.current_innings) setTab(d.match.current_innings);
      }
    } catch {}
  }, [apiFetch, id]);
  useEffect(() => { load(); }, [load]);

  const inn = useMemo(() => (match ? (tab === "a" ? match.innings_a : match.innings_b) : null), [match, tab]);
  const batTeam = tab === "a" ? teamA : teamB;
  const bowlTeam = tab === "a" ? teamB : teamA;

  if (!match || !inn || !batTeam || !bowlTeam) {
    return <View style={[styles.root, { alignItems: "center", justifyContent: "center", paddingTop: insets.top }]}><ActivityIndicator color={colors.brandPrimary} /></View>;
  }

  const battersList = (batTeam.players || []).filter((p: any) => (inn.batters?.[p.player_id] || inn.batted_ids?.includes(p.player_id)));
  const bowlersList = (bowlTeam.players || []).filter((p: any) => inn.bowlers?.[p.player_id]);
  const currStriker = inn.striker_id;
  const currNonStriker = inn.non_striker_id;
  const overs = `${Math.floor((inn.balls || 0) / 6)}.${(inn.balls || 0) % 6}`;
  const tossLine = match.toss_winner_team_id ? `${match.toss_winner_team_id === match.team_a_id ? match.team_a_name : match.team_b_name} won the toss & elected to ${match.toss_decision}` : "";

  const dismissalText = (b: any): string => {
    if (!b.out_type) return "not out";
    const map: Record<string, string> = {
      bowled: "b", catch_out: "c", run_out: "run out", lbw: "lbw", stumped: "st", hit_wicket: "hit wicket", retired_hurt: "retired hurt",
    };
    const type = map[b.out_type] || b.out_type;
    const bowlerName = playerName(b.out_by);
    const fielderName = playerName(b.fielder_id);
    if (b.out_type === "catch_out") return `c ${fielderName} b ${bowlerName}`;
    if (b.out_type === "stumped") return `st ${fielderName} b ${bowlerName}`;
    if (b.out_type === "run_out") return `run out (${fielderName})`;
    if (b.out_type === "bowled" || b.out_type === "lbw") return `${type} ${bowlerName}`;
    return type;
  };

  function playerName(pid?: string | null): string {
    if (!pid) return "-";
    const all = [...(teamA?.players || []), ...(teamB?.players || [])];
    return all.find((p) => p.player_id === pid)?.name || "-";
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="scorecard-screen">
      <View style={styles.headerRow}>
        <Pressable style={styles.hbtn} onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
        <Text style={styles.htitle}>Scorecard</Text>
        <View style={{ width: 32 }} />
      </View>
      <View style={styles.tabs}>
        <Pressable testID="tab-a" style={[styles.tab, tab === "a" && styles.tabActive]} onPress={() => setTab("a")}>
          <Text style={[styles.tabText, tab === "a" && styles.tabTextActive]}>{match.team_a_short}</Text>
        </Pressable>
        <Pressable testID="tab-b" style={[styles.tab, tab === "b" && styles.tabActive]} onPress={() => setTab("b")}>
          <Text style={[styles.tabText, tab === "b" && styles.tabTextActive]}>{match.team_b_short}</Text>
        </Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.scoreCard}>
          <Text style={styles.scoreTeam}>{batTeam.name} batting</Text>
          <Text style={styles.scoreValue} testID="innings-total">{inn.runs}/{inn.wickets}</Text>
          <Text style={styles.scoreOvers}>{overs} / {match.overs} overs</Text>
          {(() => {
            const extras = Object.values(inn.bowlers || {}).reduce((a: number, b: any) => a + (b.extras || 0), 0);
            return <Text style={styles.tossLine}>Extras: {extras}</Text>;
          })()}
          {!!tossLine && <Text style={styles.tossLine} testID="toss-line">{tossLine}</Text>}
        </View>

        <View style={styles.tableHead}>
          <Text style={[styles.headText, styles.colBat]}>Batter</Text>
          <Text style={[styles.headText, styles.col]}>R</Text>
          <Text style={[styles.headText, styles.col]}>B</Text>
          <Text style={[styles.headText, styles.col]}>4s</Text>
          <Text style={[styles.headText, styles.col]}>6s</Text>
          <Text style={[styles.headText, styles.colWide]}>SR</Text>
        </View>
        {battersList.length === 0 ? <View style={styles.empty}><Text style={styles.emptyText}>No batting stats yet</Text></View> :
          battersList.map((p: any) => {
            const st = inn.batters?.[p.player_id] || { runs: 0, balls: 0, fours: 0, sixes: 0 };
            const sr = st.balls > 0 ? ((st.runs / st.balls) * 100).toFixed(1) : "0.0";
            const isStriker = p.player_id === currStriker;
            const isNonStriker = p.player_id === currNonStriker;
            const pic = p.profile_picture_path ? fileUrl(p.profile_picture_path, token) : p.picture;
            return (
              <View key={p.player_id} style={styles.row} testID={`batter-${p.player_id}`}>
                <View style={[styles.colBat, styles.batTop]}>
                  <View style={styles.batAvatar}>
                    {pic ? <Image source={{ uri: pic, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.batAvatarImg} /> :
                      <Text style={styles.batAvatarText}>{p.name?.[0]}</Text>}
                  </View>
                  <View style={{ flex: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center" }}>
                      <Text style={styles.batName}>{p.name}</Text>
                      {isStriker && <Text style={styles.strikerBadge} testID="striker-mark">*</Text>}
                      {isNonStriker && <Text style={[styles.strikerBadge, { color: colors.muted }]}>°</Text>}
                    </View>
                    <Text style={styles.outTag}>{dismissalText(st)}</Text>
                  </View>
                </View>
                <Text style={[styles.rowText, styles.col, styles.rowTextBold]}>{st.runs}</Text>
                <Text style={[styles.rowText, styles.col]}>{st.balls}</Text>
                <Text style={[styles.rowText, styles.col]}>{st.fours}</Text>
                <Text style={[styles.rowText, styles.col]}>{st.sixes}</Text>
                <Text style={[styles.rowText, styles.colWide]}>{sr}</Text>
              </View>
            );
          })
        }

        <View style={[styles.tableHead, { marginTop: 20 }]}>
          <Text style={[styles.headText, styles.colBat]}>Bowler</Text>
          <Text style={[styles.headText, styles.col]}>O</Text>
          <Text style={[styles.headText, styles.col]}>M</Text>
          <Text style={[styles.headText, styles.col]}>R</Text>
          <Text style={[styles.headText, styles.col]}>W</Text>
          <Text style={[styles.headText, styles.colWide]}>Econ</Text>
        </View>
        {bowlersList.length === 0 ? <View style={styles.empty}><Text style={styles.emptyText}>No bowling stats yet</Text></View> :
          bowlersList.map((p: any) => {
            const st = inn.bowlers?.[p.player_id] || { balls: 0, runs: 0, wickets: 0, maidens: 0 };
            const oversStr = `${Math.floor((st.balls || 0) / 6)}.${(st.balls || 0) % 6}`;
            const econ = st.balls > 0 ? ((st.runs / (st.balls / 6)) || 0).toFixed(2) : "0.00";
            const pic = p.profile_picture_path ? fileUrl(p.profile_picture_path, token) : p.picture;
            return (
              <View key={p.player_id} style={styles.row} testID={`bowler-${p.player_id}`}>
                <View style={[styles.colBat, styles.batTop]}>
                  <View style={styles.batAvatar}>
                    {pic ? <Image source={{ uri: pic, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.batAvatarImg} /> :
                      <Text style={styles.batAvatarText}>{p.name?.[0]}</Text>}
                  </View>
                  <Text style={styles.batName}>{p.name}</Text>
                </View>
                <Text style={[styles.rowText, styles.col]}>{oversStr}</Text>
                <Text style={[styles.rowText, styles.col]}>{st.maidens || 0}</Text>
                <Text style={[styles.rowText, styles.col]}>{st.runs}</Text>
                <Text style={[styles.rowText, styles.col, styles.rowTextBold]}>{st.wickets}</Text>
                <Text style={[styles.rowText, styles.colWide]}>{econ}</Text>
              </View>
            );
          })
        }
        {(() => {
          // Fall of wickets — derive from events
          const fow: Array<{ runs: number; wkt: number; balls: number; who: string }> = [];
          let runs = 0, wkt = 0, balls = 0;
          for (const ev of inn.events || []) {
            if (ev.extra_type === "wide" || ev.extra_type === "no_ball") {
              runs += (ev.runs || 0) + 1;
            } else {
              balls += 1;
              runs += (ev.runs || 0);
            }
            if (ev.wicket) {
              wkt += 1;
              fow.push({ runs, wkt, balls, who: playerName(ev.out_batsman_id) });
            }
          }
          if (fow.length === 0) return null;
          return (
            <View>
              <Text style={styles.sectionHead}>Fall of Wickets</Text>
              {fow.map((f, i) => (
                <View key={i} style={styles.row}>
                  <Text style={[styles.rowText, { flex: 3, fontWeight: "700" }]}>{f.runs}-{f.wkt} ({f.who})</Text>
                  <Text style={[styles.rowText, styles.col]}>{Math.floor(f.balls / 6)}.{f.balls % 6}</Text>
                </View>
              ))}
            </View>
          );
        })()}
        <View style={{ height: 32 + insets.bottom }} />
      </ScrollView>
    </View>
  );
}
