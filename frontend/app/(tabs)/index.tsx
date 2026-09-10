import { View, Text, Pressable, ScrollView, RefreshControl, ActivityIndicator, Image } from "react-native";
import { useEffect, useState, useCallback } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  title: { fontSize: 28, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  sub: { fontSize: 14, color: c.muted, marginTop: 4 },
  actionRow: { flexDirection: "row", gap: 12, paddingHorizontal: 20, paddingTop: 16 },
  actionCard: { flex: 1, backgroundColor: c.brandPrimary, borderRadius: 16, padding: 16, minHeight: 92 },
  actionCardSec: { flex: 1, backgroundColor: c.surface, borderRadius: 16, padding: 16, minHeight: 92, borderWidth: 1, borderColor: c.border },
  actionTitle: { color: c.onBrandPrimary, fontSize: 16, fontWeight: "700", marginTop: 8 },
  actionTitleSec: { color: c.onSurface, fontSize: 16, fontWeight: "700", marginTop: 8 },
  actionSub: { color: "#DBEAFE", fontSize: 12, marginTop: 2 },
  actionSubSec: { color: c.muted, fontSize: 12, marginTop: 2 },
  sectionHead: { fontSize: 12, fontWeight: "700", color: c.muted, letterSpacing: 1, marginTop: 24, marginHorizontal: 20, marginBottom: 8, textTransform: "uppercase" },
  matchCard: { marginHorizontal: 20, marginBottom: 10, backgroundColor: c.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border },
  matchHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 8 },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: c.error, marginRight: 6 },
  liveBadge: { flexDirection: "row", alignItems: "center", backgroundColor: c.brandTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  liveText: { color: c.error, fontSize: 11, fontWeight: "700" },
  completedBadge: { backgroundColor: c.surfaceTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  completedText: { color: c.muted, fontSize: 11, fontWeight: "600" },
  venue: { color: c.muted, fontSize: 11 },
  teamRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 6 },
  teamName: { color: c.onSurface, fontSize: 15, fontWeight: "600" },
  score: { color: c.onSurface, fontSize: 18, fontWeight: "800", fontVariant: ["tabular-nums"] },
  scoreLoss: { color: c.muted },
  winner: { color: c.success, marginTop: 8, fontSize: 12, fontWeight: "700" },
  empty: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 20 },
  emptyText: { color: c.muted, marginTop: 12, fontSize: 14, textAlign: "center" },
}));

type Match = {
  match_id: string; team_a_name: string; team_b_name: string;
  team_a_short: string; team_b_short: string;
  team_a_id: string; team_b_id: string;
  status: string; overs: number; venue?: string;
  innings_a: { runs: number; wickets: number; overs: number };
  innings_b: { runs: number; wickets: number; overs: number };
  winner_team_id?: string | null;
};

export default function MatchesTab() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { apiFetch, user } = useAuth();
  const [matches, setMatches] = useState<Match[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch("/api/matches");
      if (r.ok) {
        const data = await r.json();
        setMatches(data.matches || []);
      }
    } catch {}
    setLoading(false); setRefreshing(false);
  }, [apiFetch]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const onRefresh = () => { setRefreshing(true); load(); };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="matches-tab">
      <View style={styles.header}>
        <Text style={styles.title}>Hey, {user?.name?.split(" ")[0] || "Player"} 👋</Text>
        <Text style={styles.sub}>Your matches at a glance</Text>
      </View>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.brandPrimary} />}
      >
        <View style={styles.actionRow}>
          <Pressable testID="new-match-btn" style={styles.actionCard} onPress={() => router.push("/matches/create")}>
            <Ionicons name="add-circle" size={28} color={colors.onBrandPrimary} />
            <Text style={styles.actionTitle}>New Match</Text>
            <Text style={styles.actionSub}>Start live scoring</Text>
          </Pressable>
          <Pressable testID="new-team-btn" style={styles.actionCardSec} onPress={() => router.push("/teams/create")}>
            <Ionicons name="people" size={28} color={colors.brandPrimary} />
            <Text style={styles.actionTitleSec}>New Team</Text>
            <Text style={styles.actionSubSec}>Add players</Text>
          </Pressable>
        </View>

        <Text style={styles.sectionHead}>Recent Matches</Text>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.brandPrimary} />
        ) : matches.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="baseball-outline" size={56} color={colors.muted} />
            <Text style={styles.emptyText}>No matches yet.{"\n"}Create a team and start your first match!</Text>
          </View>
        ) : (
          matches.map((m) => {
            const isLive = m.status === "live";
            const winA = m.winner_team_id === m.team_a_id;
            const winB = m.winner_team_id === m.team_b_id;
            return (
              <Pressable key={m.match_id} testID={`match-${m.match_id}`} style={styles.matchCard} onPress={() => router.push(`/matches/${m.match_id}`)}>
                <View style={styles.matchHead}>
                  {isLive ? (
                    <View style={styles.liveBadge}>
                      <View style={styles.liveDot} />
                      <Text style={styles.liveText}>LIVE</Text>
                    </View>
                  ) : (
                    <View style={styles.completedBadge}><Text style={styles.completedText}>COMPLETED</Text></View>
                  )}
                  <Text style={styles.venue}>{m.overs} overs</Text>
                </View>
                <View style={styles.teamRow}>
                  <Text style={[styles.teamName, winB && styles.scoreLoss]}>{m.team_a_name}</Text>
                  <Text style={[styles.score, winB && styles.scoreLoss]}>{m.innings_a.runs}/{m.innings_a.wickets} ({Math.floor((m.innings_a.balls || 0) / 6)}.{(m.innings_a.balls || 0) % 6})</Text>
                </View>
                <View style={styles.teamRow}>
                  <Text style={[styles.teamName, winA && styles.scoreLoss]}>{m.team_b_name}</Text>
                  <Text style={[styles.score, winA && styles.scoreLoss]}>{m.innings_b.runs}/{m.innings_b.wickets} ({Math.floor((m.innings_b.balls || 0) / 6)}.{(m.innings_b.balls || 0) % 6})</Text>
                </View>
                {!isLive && m.winner_team_id && (
                  <Text style={styles.winner}>🏆 {winA ? m.team_a_name : m.team_b_name} won</Text>
                )}
              </Pressable>
            );
          })
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}
