import { View, Text, ScrollView, ActivityIndicator, Image } from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: { padding: 16, backgroundColor: c.surfaceInverse },
  liveTag: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", backgroundColor: "#FFFFFF20", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginBottom: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#EF4444", marginRight: 6 },
  liveText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  title: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  toss: { color: "#94A3B8", fontSize: 12, marginTop: 4 },
  score: { color: "#FFFFFF", fontSize: 44, fontWeight: "800", marginTop: 12 },
  overs: { color: "#94A3B8", fontSize: 14, marginTop: 4 },
  batTeam: { color: "#94A3B8", fontSize: 13, marginTop: 8, textTransform: "uppercase", fontWeight: "700", letterSpacing: 0.5 },
  result: { color: "#4ADE80", fontSize: 14, marginTop: 8, fontWeight: "800" },
  sectionHead: { fontSize: 12, fontWeight: "700", color: c.muted, letterSpacing: 1, marginHorizontal: 16, marginTop: 20, marginBottom: 8, textTransform: "uppercase" },
  card: { marginHorizontal: 16, marginBottom: 8, backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 999, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: 40, height: 40, borderRadius: 999 },
  avatarText: { color: c.onBrandTertiary, fontWeight: "700" },
  name: { flex: 1, color: c.onSurface, fontWeight: "700", fontSize: 15 },
  metaText: { color: c.muted, fontSize: 12, marginTop: 2 },
  stats: { color: c.onSurface, fontVariant: ["tabular-nums"], fontWeight: "700", fontSize: 13 },
  banner: { padding: 16, backgroundColor: c.brandTertiary, marginHorizontal: 16, borderRadius: 12, marginTop: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  bannerText: { flex: 1, color: c.onBrandTertiary, fontSize: 12, fontWeight: "600" },
}));

function pubImageUrl(path?: string | null): string | undefined {
  if (!path) return undefined;
  return `${API}/api/public/files/${path}`;
}

export default function PublicShare() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { token } = useLocalSearchParams<{ token: string }>();
  const [data, setData] = useState<any>(null);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/public/matches/${token}`);
      if (r.ok) setData(await r.json());
    } catch {}
  }, [token]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  const teams = useMemo(() => {
    if (!data) return { a: null, b: null };
    return { a: data.team_a, b: data.team_b };
  }, [data]);

  const playerName = (pid?: string | null) => {
    if (!pid || !teams.a || !teams.b) return "-";
    const all = [...(teams.a.players || []), ...(teams.b.players || [])];
    return all.find((p: any) => p.player_id === pid)?.name || "-";
  };

  if (!data) return <View style={[styles.root, { alignItems: "center", justifyContent: "center", paddingTop: insets.top }]}><ActivityIndicator color={colors.brandPrimary} /></View>;

  const m = data.match;
  const inn = m.current_innings === "a" ? m.innings_a : m.innings_b;
  const batTeam = m.current_innings === "a" ? teams.a : teams.b;
  const bowlTeam = m.current_innings === "a" ? teams.b : teams.a;
  const isLive = m.status === "live";
  const overs = `${Math.floor((inn.balls || 0) / 6)}.${(inn.balls || 0) % 6}`;
  const battersOnField = (batTeam?.players || []).filter((p: any) => p.player_id === inn.striker_id || p.player_id === inn.non_striker_id);
  const currentBowler = (bowlTeam?.players || []).find((p: any) => p.player_id === inn.bowler_id);
  const tossLine = m.toss_winner_team_id ? `${m.toss_winner_team_id === m.team_a_id ? m.team_a_name : m.team_b_name} chose to ${m.toss_decision}` : "";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="public-share-screen">
      <ScrollView>
        <View style={styles.header}>
          <View style={styles.liveTag}>
            {isLive && <View style={styles.liveDot} />}
            <Text style={styles.liveText}>{isLive ? "LIVE" : m.status === "completed" ? "COMPLETED" : "UPCOMING"}</Text>
          </View>
          <Text style={styles.title}>{m.team_a_name} vs {m.team_b_name}</Text>
          <Text style={styles.toss}>{m.overs} overs{tossLine ? ` • ${tossLine}` : ""}</Text>
          <Text style={styles.batTeam}>{batTeam?.name} batting</Text>
          <Text style={styles.score} testID="public-score">{inn.runs}/{inn.wickets}</Text>
          <Text style={styles.overs}>{overs} overs</Text>
          {m.status === "completed" && m.result_text && <Text style={styles.result}>🏆 {m.result_text}</Text>}
        </View>

        <Text style={styles.sectionHead}>Batting</Text>
        {battersOnField.length === 0 ? (
          <View style={{ padding: 16, alignItems: "center" }}><Text style={{ color: colors.muted }}>Waiting for openers...</Text></View>
        ) : battersOnField.map((p: any) => {
          const st = inn.batters?.[p.player_id] || { runs: 0, balls: 0, fours: 0, sixes: 0 };
          const isStriker = p.player_id === inn.striker_id;
          const sr = st.balls > 0 ? ((st.runs / st.balls) * 100).toFixed(1) : "-";
          return (
            <View key={p.player_id} style={styles.card}>
              <View style={styles.avatar}>
                {p.profile_picture_path || p.picture ? <Image source={{ uri: pubImageUrl(p.profile_picture_path) || p.picture }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{p.name?.[0]}</Text>}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{p.name}{isStriker ? " *" : ""}</Text>
                <Text style={styles.metaText}>{st.balls} balls • SR {sr}</Text>
              </View>
              <Text style={styles.stats}>{st.runs} ({st.balls})</Text>
            </View>
          );
        })}

        <Text style={styles.sectionHead}>Bowling</Text>
        {currentBowler ? (
          <View style={styles.card}>
            <View style={styles.avatar}>
              {currentBowler.profile_picture_path || currentBowler.picture ? <Image source={{ uri: pubImageUrl(currentBowler.profile_picture_path) || currentBowler.picture }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{currentBowler.name?.[0]}</Text>}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{currentBowler.name}</Text>
              {(() => {
                const st = inn.bowlers?.[currentBowler.player_id] || { balls: 0, runs: 0, wickets: 0 };
                const oversStr = `${Math.floor((st.balls || 0) / 6)}.${(st.balls || 0) % 6}`;
                const econ = st.balls > 0 ? ((st.runs / (st.balls / 6)) || 0).toFixed(2) : "-";
                return <Text style={styles.metaText}>{oversStr} - {st.runs} - {st.wickets} • Econ {econ}</Text>;
              })()}
            </View>
          </View>
        ) : <View style={{ padding: 16, alignItems: "center" }}><Text style={{ color: colors.muted }}>Waiting for bowler...</Text></View>}

        <View style={styles.banner} testID="public-hint">
          <Ionicons name="information-circle" size={18} color={colors.onBrandTertiary} />
          <Text style={styles.bannerText}>Live updates every 5 seconds. Sign in to score your own match!</Text>
        </View>
        <View style={{ height: 32 + insets.bottom }} />
      </ScrollView>
    </View>
  );
}
