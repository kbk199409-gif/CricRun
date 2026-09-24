import { View, Text, ScrollView, ActivityIndicator, Image, Pressable, Animated, Easing } from "react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { makeStyles, useTheme } from "@/src/theme";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: { padding: 16, backgroundColor: c.surfaceInverse },
  liveTag: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", backgroundColor: "#FFFFFF20", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginBottom: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#EF4444", marginRight: 6 },
  liveText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  title: { color: "#FFFFFF", fontSize: 20, fontWeight: "800" },
  meta: { color: "#94A3B8", fontSize: 12, marginTop: 4 },

  tabsRow: { flexDirection: "row", backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  tabBtn: { flex: 1, paddingVertical: 14, alignItems: "center" },
  tabBtnActive: { borderBottomWidth: 3, borderBottomColor: c.brandPrimary },
  tabText: { color: c.muted, fontWeight: "700", fontSize: 13 },
  tabTextActive: { color: c.brandPrimary },

  teamsRow: { flexDirection: "row", padding: 16, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  teamCol: { flex: 1, alignItems: "center" },
  teamName: { color: c.onSurface, fontSize: 13, fontWeight: "700", textTransform: "uppercase" },
  teamScore: { color: c.onSurface, fontSize: 26, fontWeight: "800", marginTop: 4, fontVariant: ["tabular-nums"] },
  teamOvers: { color: c.muted, fontSize: 11, marginTop: 2 },
  battingBadge: { fontSize: 9, color: c.brandPrimary, fontWeight: "800", marginTop: 4, letterSpacing: 0.5 },
  divider: { width: 1, backgroundColor: c.border, marginHorizontal: 8 },

  chase: { padding: 12, backgroundColor: c.brandTertiary, marginHorizontal: 16, borderRadius: 10, marginTop: 12 },
  chaseText: { color: c.onBrandTertiary, fontWeight: "700", textAlign: "center" },
  rrrLine: { color: c.onBrandTertiary, textAlign: "center", marginTop: 2, fontSize: 12 },
  resultTxt: { color: c.success, fontSize: 15, marginHorizontal: 16, marginTop: 10, textAlign: "center", fontWeight: "800" },
  inningsEnd: { padding: 14, backgroundColor: c.warning, marginHorizontal: 16, borderRadius: 10, marginTop: 12, alignItems: "center" },
  inningsEndText: { color: c.onWarning, fontWeight: "800" },

  sectionHead: { fontSize: 12, fontWeight: "700", color: c.muted, letterSpacing: 1, marginHorizontal: 16, marginTop: 20, marginBottom: 8, textTransform: "uppercase" },
  card: { marginHorizontal: 16, marginBottom: 8, backgroundColor: c.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 10 },
  avatar: { width: 36, height: 36, borderRadius: 999, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: 36, height: 36, borderRadius: 999 },
  avatarText: { color: c.onBrandTertiary, fontWeight: "700" },
  name: { flex: 1, color: c.onSurface, fontWeight: "700", fontSize: 14 },
  meta2: { color: c.muted, fontSize: 11, marginTop: 2 },
  stats: { color: c.onSurface, fontWeight: "800", fontSize: 13, fontVariant: ["tabular-nums"] },
  linkable: { color: c.brandPrimary, textDecorationLine: "underline" },

  event: { flexDirection: "row", marginHorizontal: 16, marginBottom: 8, backgroundColor: c.surface, borderRadius: 10, padding: 10, alignItems: "center", gap: 10, borderWidth: 1, borderColor: c.border },
  eventDot: { width: 34, height: 34, borderRadius: 999, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary },
  eventDotWicket: { backgroundColor: c.error },
  eventDotBoundary: { backgroundColor: c.brandPrimary },
  eventDotText: { color: c.onSurface, fontWeight: "800", fontSize: 14 },
  eventDotTextInv: { color: "#FFFFFF" },
  eventText: { color: c.onSurface, fontSize: 13, flex: 1 },
  eventMeta: { color: c.muted, fontSize: 11 },

  hint: { color: c.muted, textAlign: "center", padding: 16, fontSize: 11 },

  // Scorecard tab
  scoreBanner: { padding: 16, backgroundColor: c.brandPrimary },
  scoreBannerTeam: { color: "#DBEAFE", fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  scoreBannerValue: { color: c.onBrandPrimary, fontSize: 32, fontWeight: "800", marginTop: 4 },
  scoreBannerOvers: { color: "#DBEAFE", fontSize: 13, marginTop: 2 },
  scoreInningsTabs: { flexDirection: "row", backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
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
  extraLine: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.surface },
  extraText: { color: c.muted, fontSize: 13 },
  empty: { alignItems: "center", padding: 24 },
  emptyText: { color: c.muted, marginTop: 8 },

  // Celebration overlay
  celebOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", zIndex: 30 },
  celebBadge: { width: 220, height: 220, borderRadius: 999, alignItems: "center", justifyContent: "center" },
  celebFour: { backgroundColor: c.brandPrimary },
  celebSix: { backgroundColor: "#FBBF24" },
  celebWicket: { backgroundColor: c.error },
  celebBig: { color: "#FFFFFF", fontSize: 96, fontWeight: "900", letterSpacing: -3 },
  celebSmall: { color: "#FFFFFF", fontSize: 28, fontWeight: "800", marginTop: 4, letterSpacing: 2 },

  // New player card
  npOverlay: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.55)", alignItems: "center", justifyContent: "center", padding: 24, zIndex: 25 },
  npCard: { backgroundColor: c.surface, borderRadius: 20, padding: 20, width: "100%", maxWidth: 380, alignItems: "center" },
  npTag: { color: c.brandPrimary, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  npAvatar: { width: 72, height: 72, borderRadius: 999, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden", marginTop: 8 },
  npAvatarImg: { width: 72, height: 72, borderRadius: 999 },
  npAvatarText: { color: c.onBrandTertiary, fontWeight: "800", fontSize: 24 },
  npName: { color: c.onSurface, fontSize: 20, fontWeight: "800", marginTop: 8 },
  npStyle: { color: c.muted, fontSize: 13, marginTop: 2 },
  npStatsRow: { flexDirection: "row", marginTop: 14, width: "100%", justifyContent: "space-around" },
  npStatCol: { alignItems: "center" },
  npStatLbl: { color: c.muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  npStatVal: { color: c.onSurface, fontSize: 18, fontWeight: "800", marginTop: 2 },

  // Captains
  captains: { flexDirection: "row", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  captLine: { color: c.muted, fontSize: 11, flex: 1 },
  captLineB: { textAlign: "right" },
  captBold: { color: c.onSurface, fontWeight: "700" },
}));

function pubImage(path?: string | null): string | undefined {
  if (!path) return undefined;
  return `${API}/api/public/files/${path}`;
}

function eventLabel(ev: any, playerName: (pid: string | null) => string): string {
  if (ev.wicket) {
    const bat = playerName(ev.out_batsman_id) || "batsman";
    const bowlerName = playerName(ev.bowler_at_ball);
    const fielderName = playerName(ev.fielder_id);
    const ot = ev.out_type;
    if (ot === "bowled") return `WICKET — ${bat} b ${bowlerName}`;
    if (ot === "lbw") return `WICKET — ${bat} lbw ${bowlerName}`;
    if (ot === "catch_out") return `WICKET — ${bat} c ${fielderName} b ${bowlerName}`;
    if (ot === "stumped") return `WICKET — ${bat} st ${fielderName} b ${bowlerName}`;
    if (ot === "run_out") return `WICKET — ${bat} run out (${fielderName})`;
    if (ot === "hit_wicket") return `WICKET — ${bat} hit wicket`;
    if (ot === "retired_hurt") return `${bat} retired hurt`;
    return "WICKET";
  }
  const runs = ev.runs || 0;
  const et = ev.extra_type;
  if (et === "wide") return runs > 0 ? `Wide + ${runs} run${runs > 1 ? "s" : ""}` : "Wide";
  if (et === "no_ball") return runs > 0 ? `No ball + ${runs} run${runs > 1 ? "s" : ""}` : "No ball";
  if (et === "bye") return `${runs} bye${runs !== 1 ? "s" : ""}`;
  if (et === "leg_bye") return `${runs} leg bye${runs !== 1 ? "s" : ""}`;
  if (runs === 0) return "Dot ball";
  if (runs === 4) return "FOUR";
  if (runs === 6) return "SIX";
  return `${runs} run${runs > 1 ? "s" : ""}`;
}

function eventDotContent(ev: any) {
  if (ev.wicket) return "W";
  const runs = ev.runs || 0;
  const et = ev.extra_type;
  if (et === "wide") return "Wd";
  if (et === "no_ball") return "Nb";
  if (et === "bye") return "B";
  if (et === "leg_bye") return "Lb";
  return String(runs);
}

export default function PublicShare() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [data, setData] = useState<any>(null);
  const [events, setEvents] = useState<any[]>([]);
  const [view, setView] = useState<"live" | "scorecard">("live");
  const [scTab, setScTab] = useState<"a" | "b">("a");
  const [celeb, setCeleb] = useState<null | "four" | "six" | "wicket">(null);
  const celebAnim = useRef(new Animated.Value(0)).current;
  const seenIndex = useRef<number | null>(null);
  // Info card for new batsman / bowler
  const [npCard, setNpCard] = useState<null | { kind: "batsman" | "bowler"; player: any; stats: any | null }>(null);
  const prevStrikerRef = useRef<string | null>(null);
  const prevBowlerRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [r1, r2] = await Promise.all([
        fetch(`${API}/api/public/matches/${token}`),
        fetch(`${API}/api/public/matches/${token}/events?limit=40`),
      ]);
      if (r1.ok) setData(await r1.json());
      if (r2.ok) setEvents(((await r2.json()).events) || []);
    } catch {}
  }, [token]);

  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [load]);

  // Detect NEW event → celebration overlay for 4/6/W
  useEffect(() => {
    if (!events.length) { seenIndex.current = null; return; }
    // events are newest-first; the LATEST event is index 0
    const latest = events[0];
    const key = `${latest.at}-${latest.side}-${latest.ball_index}`;
    if (seenIndex.current === key) return;
    const wasFirstLoad = seenIndex.current === null;
    seenIndex.current = key;
    if (wasFirstLoad) return; // don't celebrate stale events on first mount
    let type: "four" | "six" | "wicket" | null = null;
    if (latest.wicket) type = "wicket";
    else if (latest.extra_type === "none" && latest.runs === 4) type = "four";
    else if (latest.extra_type === "none" && latest.runs === 6) type = "six";
    if (type) {
      setCeleb(type);
      celebAnim.setValue(0);
      Animated.sequence([
        Animated.timing(celebAnim, { toValue: 1, duration: 200, useNativeDriver: true, easing: Easing.out(Easing.back(2)) }),
        Animated.delay(1300),
        Animated.timing(celebAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
      ]).start(() => setCeleb(null));
    }
  }, [events, celebAnim]);

  const teams = useMemo(() => data ? { a: data.team_a, b: data.team_b } : { a: null, b: null }, [data]);
  const playerName = useCallback((pid?: string | null): string => {
    if (!pid || !teams.a || !teams.b) return "-";
    const all = [...(teams.a.players || []), ...(teams.b.players || [])];
    return all.find((p: any) => p.player_id === pid)?.name || "-";
  }, [teams]);
  const playerObj = useCallback((pid?: string | null) => {
    if (!pid || !teams.a || !teams.b) return null;
    const all = [...(teams.a.players || []), ...(teams.b.players || [])];
    return all.find((p: any) => p.player_id === pid) || null;
  }, [teams]);
  const openPlayer = useCallback((pid?: string | null) => {
    const p = playerObj(pid);
    if (!p || !p.user_id) return;
    router.push(`/player/${p.user_id}?public=1`);
  }, [playerObj, router]);

  // Fetch mini stats for a player (public endpoint)
  const showPlayerCard = useCallback(async (p: any, kind: "batsman" | "bowler") => {
    setNpCard({ kind, player: p, stats: null });
    setTimeout(() => setNpCard((prev) => (prev && prev.player?.player_id === p.player_id ? prev : prev)), 0);
    if (p?.user_id) {
      try {
        const r = await fetch(`${API}/api/public/players/${p.user_id}/mini`);
        if (r.ok) {
          const d = await r.json();
          setNpCard((prev) => (prev && prev.player?.player_id === p.player_id ? { ...prev, stats: d } : prev));
        }
      } catch {}
    }
    // Auto-dismiss after 5 seconds
    setTimeout(() => setNpCard((prev) => (prev && prev.player?.player_id === p.player_id ? null : prev)), 5000);
  }, []);

  // Detect NEW batsman on strike / NEW bowler and show info card
  useEffect(() => {
    if (!data) return;
    const m = data.match;
    const inn = m.current_innings === "a" ? m.innings_a : m.innings_b;
    if (!inn || inn.completed || m.status === "completed") return;
    const striker = inn.striker_id;
    const bowler = inn.bowler_id;
    // First-time init: don't celebrate initial openers
    if (prevStrikerRef.current === null) { prevStrikerRef.current = striker; prevBowlerRef.current = bowler; return; }
    if (striker && striker !== prevStrikerRef.current) {
      const p = playerObj(striker);
      if (p) showPlayerCard(p, "batsman");
      prevStrikerRef.current = striker;
    }
    if (bowler && bowler !== prevBowlerRef.current) {
      const p = playerObj(bowler);
      if (p) showPlayerCard(p, "bowler");
      prevBowlerRef.current = bowler;
    }
  }, [data, playerObj, showPlayerCard]);

  if (!data) return <View style={[styles.root, { alignItems: "center", justifyContent: "center", paddingTop: insets.top }]}><ActivityIndicator color={colors.brandPrimary} /></View>;

  const m = data.match;
  const inn = m.current_innings === "a" ? m.innings_a : m.innings_b;
  const otherInn = m.current_innings === "a" ? m.innings_b : m.innings_a;
  const batTeam = m.current_innings === "a" ? teams.a : teams.b;
  const bowlTeam = m.current_innings === "a" ? teams.b : teams.a;
  const isCompleted = m.status === "completed";
  const isLive = m.status === "live";
  const oversStr = `${Math.floor((inn.balls || 0) / 6)}.${(inn.balls || 0) % 6}`;
  const crr = inn.balls > 0 ? (inn.runs / (inn.balls / 6)).toFixed(2) : "0.00";
  const maxBalls = m.overs * 6;

  let chaseText = ""; let rrrLine = "";
  if (otherInn?.started && otherInn?.completed && !isCompleted) {
    const target = otherInn.runs + 1;
    const need = target - inn.runs;
    const ballsLeft = maxBalls - inn.balls;
    if (need > 0 && ballsLeft > 0) {
      chaseText = `Need ${need} runs from ${ballsLeft} balls (target ${target})`;
      rrrLine = `RRR: ${((need * 6) / ballsLeft).toFixed(2)} • CRR: ${crr}`;
    }
  }

  const isInningsEnded = !isCompleted && inn.completed;

  const battersOnField = (batTeam?.players || []).filter((p: any) => p.player_id === inn.striker_id || p.player_id === inn.non_striker_id);
  const currentBowler = (bowlTeam?.players || []).find((p: any) => p.player_id === inn.bowler_id);
  const tossLine = m.toss_winner_team_id ? `${m.toss_winner_team_id === m.team_a_id ? m.team_a_name : m.team_b_name} chose to ${m.toss_decision}` : "";

  // Scorecard tab data — RENDER IN BATTING ORDER via batted_ids
  const scInn = scTab === "a" ? m.innings_a : m.innings_b;
  const scBatTeam = scTab === "a" ? teams.a : teams.b;
  const scBowlTeam = scTab === "a" ? teams.b : teams.a;
  const scBatTeamPlayers: any[] = scBatTeam?.players || [];
  const scBattedOrder: string[] = scInn?.batted_ids || [];
  const scBattersList: any[] = scBattedOrder
    .map((pid) => scBatTeamPlayers.find((p) => p.player_id === pid))
    .filter(Boolean) as any[];
  const scBowlersList = (scBowlTeam?.players || []).filter((p: any) => scInn?.bowlers?.[p.player_id]);
  const scOvers = `${Math.floor((scInn?.balls || 0) / 6)}.${(scInn?.balls || 0) % 6}`;
  const scExtras = Object.values(scInn?.bowlers || {}).reduce((a: number, b: any) => a + (b.extras || 0), 0);

  // Captains
  const captA = m.captain_a_id ? (teams.a?.players || []).find((p: any) => p.player_id === m.captain_a_id) : null;
  const captB = m.captain_b_id ? (teams.b?.players || []).find((p: any) => p.player_id === m.captain_b_id) : null;

  // Awards
  const bestBat = m.best_batter_id ? playerObj(m.best_batter_id) : null;
  const bestBowl = m.best_bowler_id ? playerObj(m.best_bowler_id) : null;
  const momPlayer = m.man_of_the_match_id ? playerObj(m.man_of_the_match_id) : null;

  const dismissalText = (b: any): string => {
    if (!b?.out_type) return "not out";
    const type = b.out_type;
    const bowlerName = playerName(b.out_by);
    const fielderName = playerName(b.fielder_id);
    if (type === "catch_out") return `c ${fielderName} b ${bowlerName}`;
    if (type === "stumped") return `st ${fielderName} b ${bowlerName}`;
    if (type === "run_out") return `run out (${fielderName})`;
    if (type === "bowled") return `b ${bowlerName}`;
    if (type === "lbw") return `lbw ${bowlerName}`;
    if (type === "hit_wicket") return "hit wicket";
    if (type === "retired_hurt") return "retired hurt";
    return type;
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="public-share-screen">
      <ScrollView>
        <View style={styles.header}>
          <View style={styles.liveTag}>
            {isLive && <View style={styles.liveDot} />}
            <Text style={styles.liveText}>{isLive ? "LIVE" : isCompleted ? "COMPLETED" : "UPCOMING"}</Text>
          </View>
          <Text style={styles.title}>{m.team_a_name} vs {m.team_b_name}</Text>
          <Text style={styles.meta}>{m.overs} overs{tossLine ? ` • ${tossLine}` : ""}</Text>
        </View>

        <View style={styles.tabsRow}>
          <Pressable testID="tab-live" style={[styles.tabBtn, view === "live" && styles.tabBtnActive]} onPress={() => setView("live")}>
            <Text style={[styles.tabText, view === "live" && styles.tabTextActive]}>LIVE</Text>
          </Pressable>
          <Pressable testID="tab-scorecard" style={[styles.tabBtn, view === "scorecard" && styles.tabBtnActive]} onPress={() => setView("scorecard")}>
            <Text style={[styles.tabText, view === "scorecard" && styles.tabTextActive]}>SCORECARD</Text>
          </Pressable>
        </View>

        {(captA || captB) && (
          <View style={styles.captains}>
            <Text style={styles.captLine}>© <Text style={styles.captBold}>{captA?.name || "-"}</Text> · {m.team_a_short}</Text>
            <Text style={[styles.captLine, styles.captLineB]}>{m.team_b_short} · <Text style={styles.captBold}>{captB?.name || "-"}</Text> ©</Text>
          </View>
        )}

        {isCompleted && (bestBat || bestBowl || momPlayer) && (
          <View style={{ paddingHorizontal: 16, paddingTop: 16 }} testID="public-awards">
            <Text style={[styles.sectionHead, { marginLeft: 0, marginTop: 0 }]}>Awards</Text>
            {momPlayer && (
              <Pressable style={styles.card} onPress={() => openPlayer(momPlayer.player_id)}>
                <View style={[styles.avatar, { backgroundColor: "#FBBF2440" }]}>{(momPlayer.profile_picture_path ? <Image source={{ uri: pubImage(momPlayer.profile_picture_path) }} style={styles.avatarImg} /> : momPlayer.picture ? <Image source={{ uri: momPlayer.picture }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{momPlayer.name?.[0]}</Text>)}</View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, styles.linkable]}>🏅 {momPlayer.name} · Man of the Match</Text>
                  {m.man_of_the_match_summary && <Text style={styles.meta2}>{m.man_of_the_match_summary}</Text>}
                </View>
              </Pressable>
            )}
            {bestBat && (
              <Pressable style={styles.card} onPress={() => openPlayer(bestBat.player_id)}>
                <View style={styles.avatar}>{(bestBat.profile_picture_path ? <Image source={{ uri: pubImage(bestBat.profile_picture_path) }} style={styles.avatarImg} /> : bestBat.picture ? <Image source={{ uri: bestBat.picture }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{bestBat.name?.[0]}</Text>)}</View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, styles.linkable]}>🏏 {bestBat.name} · Best Batter</Text>
                  {m.best_batter_summary && <Text style={styles.meta2}>{m.best_batter_summary}</Text>}
                </View>
              </Pressable>
            )}
            {bestBowl && (
              <Pressable style={styles.card} onPress={() => openPlayer(bestBowl.player_id)}>
                <View style={[styles.avatar, { backgroundColor: "#EF444440" }]}>{(bestBowl.profile_picture_path ? <Image source={{ uri: pubImage(bestBowl.profile_picture_path) }} style={styles.avatarImg} /> : bestBowl.picture ? <Image source={{ uri: bestBowl.picture }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{bestBowl.name?.[0]}</Text>)}</View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.name, styles.linkable]}>🎯 {bestBowl.name} · Best Bowler</Text>
                  {m.best_bowler_summary && <Text style={styles.meta2}>{m.best_bowler_summary}</Text>}
                </View>
              </Pressable>
            )}
          </View>
        )}

        {view === "live" && (
          <>
            <View style={styles.teamsRow}>
              <View style={styles.teamCol}>
                <Text style={styles.teamName}>{m.team_a_name}</Text>
                <Text style={styles.teamScore} testID="team-a-score">{m.innings_a.runs}/{m.innings_a.wickets}</Text>
                <Text style={styles.teamOvers}>{Math.floor((m.innings_a.balls || 0) / 6)}.{(m.innings_a.balls || 0) % 6} ov</Text>
                {m.current_innings === "a" && !isCompleted && <Text style={styles.battingBadge}>BATTING</Text>}
              </View>
              <View style={styles.divider} />
              <View style={styles.teamCol}>
                <Text style={styles.teamName}>{m.team_b_name}</Text>
                <Text style={styles.teamScore} testID="team-b-score">{m.innings_b.runs}/{m.innings_b.wickets}</Text>
                <Text style={styles.teamOvers}>{Math.floor((m.innings_b.balls || 0) / 6)}.{(m.innings_b.balls || 0) % 6} ov</Text>
                {m.current_innings === "b" && !isCompleted && <Text style={styles.battingBadge}>BATTING</Text>}
              </View>
            </View>

            {isCompleted && m.result_text ? <Text style={styles.resultTxt} testID="public-result">🏆 {m.result_text}</Text> : null}

            {chaseText ? (
              <View style={styles.chase} testID="chase-info">
                <Text style={styles.chaseText}>{chaseText}</Text>
                <Text style={styles.rrrLine}>{rrrLine}</Text>
              </View>
            ) : (
              !isCompleted && inn.balls > 0 && <View style={styles.chase}><Text style={styles.chaseText}>CRR: {crr}</Text></View>
            )}

            {isInningsEnded && (
              <View style={styles.inningsEnd} testID="public-innings-end">
                <Text style={styles.inningsEndText}>INNINGS END</Text>
                <Text style={{ color: colors.onWarning, marginTop: 4 }}>{batTeam?.name} finished at {inn.runs}/{inn.wickets}</Text>
              </View>
            )}

            {!isInningsEnded && !isCompleted && inn.started && (
              <>
                <Text style={styles.sectionHead}>Batting</Text>
                {battersOnField.length === 0 ? (
                  <View style={{ padding: 12, alignItems: "center" }}><Text style={{ color: colors.muted }}>Waiting for openers...</Text></View>
                ) : battersOnField.map((p: any) => {
                  const st = inn.batters?.[p.player_id] || { runs: 0, balls: 0, fours: 0, sixes: 0 };
                  const isStriker = p.player_id === inn.striker_id;
                  const sr = st.balls > 0 ? ((st.runs / st.balls) * 100).toFixed(1) : "-";
                  const pic = p.profile_picture_path ? pubImage(p.profile_picture_path) : p.picture;
                  const canOpen = !!p.user_id;
                  return (
                    <Pressable key={p.player_id} testID={`live-bat-${p.player_id}`} style={styles.card} onPress={() => canOpen && openPlayer(p.player_id)} disabled={!canOpen}>
                      <View style={styles.avatar}>{pic ? <Image source={{ uri: pic }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{p.name?.[0]}</Text>}</View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.name, canOpen && styles.linkable]}>{p.name}{isStriker ? " *" : ""}</Text>
                        <Text style={styles.meta2}>{st.fours} 4s • {st.sixes} 6s • SR {sr}</Text>
                      </View>
                      <Text style={styles.stats}>{st.runs} ({st.balls})</Text>
                    </Pressable>
                  );
                })}

                <Text style={styles.sectionHead}>Bowling</Text>
                {currentBowler ? (() => {
                  const st = inn.bowlers?.[currentBowler.player_id] || { balls: 0, runs: 0, wickets: 0, maidens: 0 };
                  const oStr = `${Math.floor((st.balls || 0) / 6)}.${(st.balls || 0) % 6}`;
                  const econ = st.balls > 0 ? ((st.runs / (st.balls / 6)) || 0).toFixed(2) : "-";
                  const pic = currentBowler.profile_picture_path ? pubImage(currentBowler.profile_picture_path) : currentBowler.picture;
                  const canOpen = !!currentBowler.user_id;
                  return (
                    <Pressable style={styles.card} testID={`live-bowl-${currentBowler.player_id}`} onPress={() => canOpen && openPlayer(currentBowler.player_id)} disabled={!canOpen}>
                      <View style={styles.avatar}>{pic ? <Image source={{ uri: pic }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{currentBowler.name?.[0]}</Text>}</View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.name, canOpen && styles.linkable]}>{currentBowler.name}</Text>
                        <Text style={styles.meta2}>{oStr} - {st.maidens || 0}M - {st.runs}R - {st.wickets}W • Econ {econ}</Text>
                      </View>
                    </Pressable>
                  );
                })() : <View style={{ padding: 12, alignItems: "center" }}><Text style={{ color: colors.muted }}>Waiting for bowler...</Text></View>}
              </>
            )}

            <Text style={styles.sectionHead}>Ball by Ball</Text>
            {events.length === 0 ? (
              <View style={{ padding: 16, alignItems: "center" }}><Text style={{ color: colors.muted }}>No balls yet</Text></View>
            ) : events.map((ev, i) => {
              const dot = eventDotContent(ev);
              const isWicket = !!ev.wicket;
              const isBoundary = !isWicket && (ev.runs === 4 || ev.runs === 6);
              return (
                <View key={`${ev.at}-${i}`} style={styles.event}>
                  <View style={[styles.eventDot, isWicket && styles.eventDotWicket, isBoundary && styles.eventDotBoundary]}>
                    <Text style={[styles.eventDotText, (isWicket || isBoundary) && styles.eventDotTextInv]}>{dot}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.eventText}>{eventLabel(ev, playerName)}</Text>
                    <Text style={styles.eventMeta}>Innings {ev.side === "a" ? m.team_a_short : m.team_b_short}</Text>
                  </View>
                </View>
              );
            })}
          </>
        )}

        {view === "scorecard" && (
          <>
            <View style={styles.scoreInningsTabs}>
              <Pressable testID="sc-tab-a" style={[styles.tabBtn, scTab === "a" && styles.tabBtnActive]} onPress={() => setScTab("a")}>
                <Text style={[styles.tabText, scTab === "a" && styles.tabTextActive]}>{m.team_a_short}</Text>
              </Pressable>
              <Pressable testID="sc-tab-b" style={[styles.tabBtn, scTab === "b" && styles.tabBtnActive]} onPress={() => setScTab("b")}>
                <Text style={[styles.tabText, scTab === "b" && styles.tabTextActive]}>{m.team_b_short}</Text>
              </Pressable>
            </View>
            <View style={styles.scoreBanner}>
              <Text style={styles.scoreBannerTeam}>{scBatTeam?.name} batting</Text>
              <Text style={styles.scoreBannerValue} testID="sc-innings-total">{scInn?.runs || 0}/{scInn?.wickets || 0}</Text>
              <Text style={styles.scoreBannerOvers}>{scOvers} / {m.overs} overs • Extras: {scExtras}</Text>
            </View>

            <View style={styles.tableHead}>
              <Text style={[styles.headText, styles.colBat]}>Batter</Text>
              <Text style={[styles.headText, styles.col]}>R</Text>
              <Text style={[styles.headText, styles.col]}>B</Text>
              <Text style={[styles.headText, styles.col]}>4s</Text>
              <Text style={[styles.headText, styles.col]}>6s</Text>
              <Text style={[styles.headText, styles.colWide]}>SR</Text>
            </View>
            {scBattersList.length === 0 ? <View style={styles.empty}><Text style={styles.emptyText}>No batting yet</Text></View> :
              scBattersList.map((p: any) => {
                const st = scInn?.batters?.[p.player_id] || { runs: 0, balls: 0, fours: 0, sixes: 0 };
                const sr = st.balls > 0 ? ((st.runs / st.balls) * 100).toFixed(1) : "0.0";
                const pic = p.profile_picture_path ? pubImage(p.profile_picture_path) : p.picture;
                const canOpen = !!p.user_id;
                const isStriker = p.player_id === scInn?.striker_id;
                const isNonStriker = p.player_id === scInn?.non_striker_id;
                return (
                  <Pressable key={p.player_id} style={styles.row} onPress={() => canOpen && openPlayer(p.player_id)} disabled={!canOpen} testID={`sc-bat-${p.player_id}`}>
                    <View style={[styles.colBat, styles.batTop]}>
                      <View style={styles.batAvatar}>{pic ? <Image source={{ uri: pic }} style={styles.batAvatarImg} /> : <Text style={styles.batAvatarText}>{p.name?.[0]}</Text>}</View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: "row", alignItems: "center" }}>
                          <Text style={[styles.batName, canOpen && styles.linkable]}>{p.name}</Text>
                          {isStriker && <Text style={styles.strikerBadge}>*</Text>}
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
                  </Pressable>
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
            {scBowlersList.length === 0 ? <View style={styles.empty}><Text style={styles.emptyText}>No bowling yet</Text></View> :
              scBowlersList.map((p: any) => {
                const st = scInn?.bowlers?.[p.player_id] || { balls: 0, runs: 0, wickets: 0, maidens: 0 };
                const oStr = `${Math.floor((st.balls || 0) / 6)}.${(st.balls || 0) % 6}`;
                const econ = st.balls > 0 ? ((st.runs / (st.balls / 6)) || 0).toFixed(2) : "0.00";
                const pic = p.profile_picture_path ? pubImage(p.profile_picture_path) : p.picture;
                const canOpen = !!p.user_id;
                return (
                  <Pressable key={p.player_id} style={styles.row} onPress={() => canOpen && openPlayer(p.player_id)} disabled={!canOpen} testID={`sc-bowl-${p.player_id}`}>
                    <View style={[styles.colBat, styles.batTop]}>
                      <View style={styles.batAvatar}>{pic ? <Image source={{ uri: pic }} style={styles.batAvatarImg} /> : <Text style={styles.batAvatarText}>{p.name?.[0]}</Text>}</View>
                      <Text style={[styles.batName, canOpen && styles.linkable]}>{p.name}</Text>
                    </View>
                    <Text style={[styles.rowText, styles.col]}>{oStr}</Text>
                    <Text style={[styles.rowText, styles.col]}>{st.maidens || 0}</Text>
                    <Text style={[styles.rowText, styles.col]}>{st.runs}</Text>
                    <Text style={[styles.rowText, styles.col, styles.rowTextBold]}>{st.wickets}</Text>
                    <Text style={[styles.rowText, styles.colWide]}>{econ}</Text>
                  </Pressable>
                );
              })
            }
          </>
        )}

        <Text style={styles.hint}>Live updates every 3 seconds • Powered by CricTrack</Text>
        <View style={{ height: 32 + insets.bottom }} />
      </ScrollView>

      {/* NEW BATSMAN / BOWLER INFO CARD */}
      {npCard && (
        <Pressable style={styles.npOverlay} testID="np-info-card" onPress={() => setNpCard(null)}>
          <View style={styles.npCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.npTag}>NEW {npCard.kind === "batsman" ? "BATTER" : "BOWLER"}</Text>
            <View style={styles.npAvatar}>
              {npCard.player?.profile_picture_path || npCard.player?.picture ?
                <Image source={{ uri: npCard.player?.profile_picture_path ? pubImage(npCard.player.profile_picture_path) : npCard.player.picture }} style={styles.npAvatarImg} /> :
                <Text style={styles.npAvatarText}>{npCard.player?.name?.[0]}</Text>}
            </View>
            <Text style={styles.npName}>{npCard.player?.name}</Text>
            <Text style={styles.npStyle}>{npCard.kind === "batsman" ? (npCard.player?.batting_style || "Batter") : (npCard.player?.bowling_style || "Bowler")}</Text>
            {npCard.stats ? (
              npCard.kind === "batsman" ? (
                <View style={styles.npStatsRow}>
                  <View style={styles.npStatCol}><Text style={styles.npStatLbl}>Matches</Text><Text style={styles.npStatVal}>{npCard.stats.matches}</Text></View>
                  <View style={styles.npStatCol}><Text style={styles.npStatLbl}>Runs</Text><Text style={styles.npStatVal}>{npCard.stats.batting.runs}</Text></View>
                  <View style={styles.npStatCol}><Text style={styles.npStatLbl}>Best</Text><Text style={styles.npStatVal}>{npCard.stats.batting.highest}</Text></View>
                  <View style={styles.npStatCol}><Text style={styles.npStatLbl}>Avg</Text><Text style={styles.npStatVal}>{Number(npCard.stats.batting.average || 0).toFixed(1)}</Text></View>
                  <View style={styles.npStatCol}><Text style={styles.npStatLbl}>SR</Text><Text style={styles.npStatVal}>{Number(npCard.stats.batting.strike_rate || 0).toFixed(1)}</Text></View>
                </View>
              ) : (
                <View style={styles.npStatsRow}>
                  <View style={styles.npStatCol}><Text style={styles.npStatLbl}>Matches</Text><Text style={styles.npStatVal}>{npCard.stats.matches}</Text></View>
                  <View style={styles.npStatCol}><Text style={styles.npStatLbl}>Wkts</Text><Text style={styles.npStatVal}>{npCard.stats.bowling.wickets}</Text></View>
                  <View style={styles.npStatCol}><Text style={styles.npStatLbl}>Best</Text><Text style={styles.npStatVal}>{npCard.stats.bowling.best || "-"}</Text></View>
                  <View style={styles.npStatCol}><Text style={styles.npStatLbl}>Econ</Text><Text style={styles.npStatVal}>{Number(npCard.stats.bowling.economy || 0).toFixed(1)}</Text></View>
                </View>
              )
            ) : (
              <Text style={[styles.hint, { marginTop: 12 }]}>{npCard.player?.user_id ? "Loading career stats…" : "Guest player"}</Text>
            )}
          </View>
        </Pressable>
      )}

      {/* CELEBRATION OVERLAY (auto-dismiss ~1.8s) */}
      {celeb && (
        <View style={styles.celebOverlay} pointerEvents="none" testID={`celeb-${celeb}`}>
          <Animated.View style={[
            styles.celebBadge,
            celeb === "four" ? styles.celebFour : celeb === "six" ? styles.celebSix : styles.celebWicket,
            { transform: [{ scale: celebAnim }, { rotate: celebAnim.interpolate({ inputRange: [0, 1], outputRange: ["-10deg", "0deg"] }) }] },
          ]}>
            <Text style={styles.celebBig}>{celeb === "four" ? "4" : celeb === "six" ? "6" : "W"}</Text>
            <Text style={styles.celebSmall}>{celeb === "four" ? "FOUR!" : celeb === "six" ? "SIX!" : "WICKET!"}</Text>
          </Animated.View>
        </View>
      )}
    </View>
  );
}
