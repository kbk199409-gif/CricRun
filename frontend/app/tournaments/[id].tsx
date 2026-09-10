import { View, Text, Pressable, ScrollView, ActivityIndicator, Image } from "react-native";
import { useCallback, useState } from "react";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { LinearGradient } from "expo-linear-gradient";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  headerRow: { position: "absolute", top: 0, left: 0, right: 0, flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingBottom: 8, zIndex: 10 },
  hbtn: { padding: 6, backgroundColor: "#FFFFFF33", borderRadius: 999, width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  htitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: "#FFFFFF" },
  hero: { height: 220, position: "relative" },
  heroImg: { width: "100%", height: "100%", position: "absolute" },
  scrim: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0 },
  heroContent: { position: "absolute", bottom: 16, left: 20, right: 20 },
  heroTitle: { color: "#FFFFFF", fontSize: 24, fontWeight: "800" },
  heroMeta: { color: "#DBEAFE", fontSize: 13, marginTop: 4 },
  tabs: { flexDirection: "row", backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  tab: { flex: 1, alignItems: "center", paddingVertical: 14 },
  tabActive: { borderBottomWidth: 3, borderBottomColor: c.brandPrimary },
  tabText: { color: c.muted, fontWeight: "700", fontSize: 13 },
  tabTextActive: { color: c.brandPrimary },

  actionsRow: { flexDirection: "row", padding: 16, gap: 10 },
  actionBtn: { flex: 1, backgroundColor: c.brandPrimary, paddingVertical: 12, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 },
  actionBtnSec: { flex: 1, backgroundColor: c.surface, paddingVertical: 12, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: c.border },
  actionText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 13 },
  actionTextSec: { color: c.onSurface, fontWeight: "700", fontSize: 13 },

  card: { marginHorizontal: 16, marginBottom: 10, backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border },
  teamRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  teamLogo: { width: 40, height: 40, borderRadius: 10, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  teamLogoText: { color: c.onBrandPrimary, fontWeight: "800" },
  teamName: { flex: 1, color: c.onSurface, fontWeight: "700", fontSize: 15 },

  matchCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border },
  matchHead: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
  liveBadge: { flexDirection: "row", alignItems: "center", backgroundColor: c.brandTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: c.error, marginRight: 4 },
  liveText: { color: c.error, fontSize: 10, fontWeight: "700" },
  completedBadge: { backgroundColor: c.surfaceTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  completedText: { color: c.muted, fontSize: 10, fontWeight: "700" },
  scoreLine: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  smallTeam: { color: c.onSurface, fontSize: 14, fontWeight: "600" },
  smallScore: { color: c.onSurface, fontSize: 14, fontWeight: "700", fontVariant: ["tabular-nums"] },

  tableHead: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  tableRow: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, alignItems: "center", borderBottomWidth: 1, borderBottomColor: c.divider, backgroundColor: c.surface },
  colTeam: { flex: 3, flexDirection: "row", alignItems: "center", gap: 8 },
  col: { flex: 1, textAlign: "center" },
  colWide: { flex: 1.4, textAlign: "center" },
  headText: { fontSize: 11, fontWeight: "700", color: c.muted, letterSpacing: 0.5, textTransform: "uppercase" },
  rowText: { fontSize: 14, color: c.onSurface, fontVariant: ["tabular-nums"] },
  rowTextBold: { fontWeight: "800" },
  miniLogo: { width: 24, height: 24, borderRadius: 6, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  miniLogoText: { color: c.onBrandPrimary, fontSize: 10, fontWeight: "800" },

  empty: { alignItems: "center", padding: 40 },
  emptyText: { color: c.muted, marginTop: 8 },
}));

export default function TournamentDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { apiFetch } = useAuth();
  const [data, setData] = useState<any>(null);
  const [tab, setTab] = useState<"matches" | "teams" | "points">("points");
  const [addingTeam, setAddingTeam] = useState(false);
  const [myTeams, setMyTeams] = useState<any[]>([]);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/tournaments/${id}`);
      if (r.ok) setData(await r.json());
      const t = await apiFetch("/api/teams");
      if (t.ok) { const d = await t.json(); setMyTeams(d.teams || []); }
    } catch {}
  }, [apiFetch, id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addTeam = async (team_id: string) => {
    setAddingTeam(true);
    try {
      await apiFetch(`/api/tournaments/${id}/teams/${team_id}`, { method: "POST" });
      await load();
    } catch {}
    setAddingTeam(false);
  };

  if (!data) {
    return <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}><ActivityIndicator color={colors.brandPrimary} /></View>;
  }
  const trn = data.tournament;
  const teams: any[] = data.teams || [];
  const matches: any[] = data.matches || [];
  const points: any[] = data.points_table || [];
  const inTournament = new Set(teams.map((t) => t.team_id));
  const availableTeams = myTeams.filter((t) => !inTournament.has(t.team_id));

  return (
    <View style={styles.root} testID="tournament-detail-screen">
      <View style={styles.hero}>
        <Image source={{ uri: "https://images.unsplash.com/photo-1637635753380-20bf6f46ede0?crop=entropy&cs=srgb&fm=jpg&w=1080&q=80" }} style={styles.heroImg} />
        <LinearGradient colors={["rgba(15,23,42,0.5)", "rgba(15,23,42,0.9)"]} style={styles.scrim} />
        <View style={[styles.headerRow, { paddingTop: insets.top + 4 }]}>
          <Pressable style={styles.hbtn} onPress={() => router.back()}><Ionicons name="chevron-back" size={22} color="#FFFFFF" /></Pressable>
          <Text style={styles.htitle}>{trn.overs} overs per match</Text>
          <View style={{ width: 36 }} />
        </View>
        <View style={styles.heroContent}>
          <Text style={styles.heroTitle}>{trn.name}</Text>
          <Text style={styles.heroMeta}>{teams.length} teams • {matches.length} matches{trn.location ? ` • ${trn.location}` : ""}</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        {(["points", "matches", "teams"] as const).map((t) => (
          <Pressable key={t} testID={`tab-${t}`} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t === "points" ? "Points Table" : t === "matches" ? "Matches" : "Teams"}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.actionsRow}>
        <Pressable testID="add-match-btn" style={styles.actionBtn} onPress={() => router.push({ pathname: "/matches/create", params: { tournament_id: id } })}>
          <Ionicons name="add" size={18} color={colors.onBrandPrimary} />
          <Text style={styles.actionText}>New Match</Text>
        </Pressable>
        <Pressable testID="add-team-tournament-btn" style={styles.actionBtnSec} onPress={() => setTab("teams")}>
          <Ionicons name="people" size={18} color={colors.onSurface} />
          <Text style={styles.actionTextSec}>Manage Teams</Text>
        </Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {tab === "points" && (
          <View>
            <View style={styles.tableHead}>
              <View style={styles.colTeam}><Text style={styles.headText}>Team</Text></View>
              <Text style={[styles.headText, styles.col]}>P</Text>
              <Text style={[styles.headText, styles.col]}>W</Text>
              <Text style={[styles.headText, styles.col]}>L</Text>
              <Text style={[styles.headText, styles.col]}>Pts</Text>
              <Text style={[styles.headText, styles.colWide]}>NRR</Text>
            </View>
            {points.length === 0 ? (
              <View style={styles.empty}><Text style={styles.emptyText}>No teams yet. Add teams to start.</Text></View>
            ) : points.map((p) => (
              <View key={p.team_id} style={styles.tableRow} testID={`pt-${p.team_id}`}>
                <View style={styles.colTeam}>
                  <View style={styles.miniLogo}><Text style={styles.miniLogoText}>{p.short_name}</Text></View>
                  <Text style={[styles.rowText, styles.rowTextBold]}>{p.name}</Text>
                </View>
                <Text style={[styles.rowText, styles.col]}>{p.P}</Text>
                <Text style={[styles.rowText, styles.col]}>{p.W}</Text>
                <Text style={[styles.rowText, styles.col]}>{p.L}</Text>
                <Text style={[styles.rowText, styles.col, styles.rowTextBold]}>{p.Pts}</Text>
                <Text style={[styles.rowText, styles.colWide, { color: p.NRR >= 0 ? colors.success : colors.error }]}>
                  {p.NRR >= 0 ? "+" : ""}{Number(p.NRR).toFixed(3)}
                </Text>
              </View>
            ))}
          </View>
        )}
        {tab === "matches" && (
          matches.length === 0 ? (
            <View style={styles.empty}><Ionicons name="baseball-outline" size={40} color={colors.muted} /><Text style={styles.emptyText}>No matches yet</Text></View>
          ) : matches.map((m) => (
            <Pressable key={m.match_id} style={styles.matchCard} onPress={() => router.push(`/matches/${m.match_id}`)}>
              <View style={styles.matchHead}>
                {m.status === "live" ? (
                  <View style={styles.liveBadge}><View style={styles.liveDot} /><Text style={styles.liveText}>LIVE</Text></View>
                ) : <View style={styles.completedBadge}><Text style={styles.completedText}>COMPLETED</Text></View>}
              </View>
              <View style={styles.scoreLine}>
                <Text style={styles.smallTeam}>{m.team_a_name}</Text>
                <Text style={styles.smallScore}>{m.innings_a.runs}/{m.innings_a.wickets} ({Math.floor((m.innings_a.balls || 0) / 6)}.{(m.innings_a.balls || 0) % 6})</Text>
              </View>
              <View style={styles.scoreLine}>
                <Text style={styles.smallTeam}>{m.team_b_name}</Text>
                <Text style={styles.smallScore}>{m.innings_b.runs}/{m.innings_b.wickets} ({Math.floor((m.innings_b.balls || 0) / 6)}.{(m.innings_b.balls || 0) % 6})</Text>
              </View>
            </Pressable>
          ))
        )}
        {tab === "teams" && (
          <View style={{ paddingTop: 4 }}>
            {teams.length === 0 && <View style={styles.empty}><Text style={styles.emptyText}>No teams added yet</Text></View>}
            {teams.map((t) => (
              <View key={t.team_id} style={styles.card}>
                <View style={styles.teamRow}>
                  <View style={styles.teamLogo}><Text style={styles.teamLogoText}>{t.short_name}</Text></View>
                  <Text style={styles.teamName}>{t.name}</Text>
                  <Ionicons name="checkmark-circle" size={22} color={colors.success} />
                </View>
              </View>
            ))}
            {availableTeams.length > 0 && (
              <>
                <Text style={[styles.emptyText, { marginLeft: 16, marginTop: 16, marginBottom: 4 }]}>Add from your teams:</Text>
                {availableTeams.map((t) => (
                  <Pressable key={t.team_id} testID={`add-${t.team_id}`} style={styles.card} onPress={() => addTeam(t.team_id)} disabled={addingTeam}>
                    <View style={styles.teamRow}>
                      <View style={[styles.teamLogo, { backgroundColor: colors.surfaceTertiary }]}><Text style={[styles.teamLogoText, { color: colors.onSurface }]}>{t.short_name}</Text></View>
                      <Text style={styles.teamName}>{t.name}</Text>
                      <Ionicons name="add-circle" size={22} color={colors.brandPrimary} />
                    </View>
                  </Pressable>
                ))}
              </>
            )}
          </View>
        )}
        <View style={{ height: 24 + insets.bottom }} />
      </ScrollView>
    </View>
  );
}
