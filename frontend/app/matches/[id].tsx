import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useCallback, useState } from "react";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: c.border },
  hbtn: { padding: 6 },
  htitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: c.onSurface },
  scoreboard: { backgroundColor: c.surfaceInverse, padding: 20 },
  liveTag: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", backgroundColor: "#FFFFFF20", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginBottom: 8 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#EF4444", marginRight: 6 },
  liveText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  battingLbl: { color: "#94A3B8", fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  battingTeam: { color: "#FFFFFF", fontSize: 24, fontWeight: "800", marginTop: 2 },
  bigScore: { color: "#FFFFFF", fontSize: 56, fontWeight: "800", letterSpacing: -2, fontVariant: ["tabular-nums"], marginTop: 8 },
  scoreMeta: { flexDirection: "row", gap: 24, marginTop: 4 },
  metaBlock: { flex: 0 },
  metaLbl: { color: "#94A3B8", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  metaVal: { color: "#FFFFFF", fontSize: 20, fontWeight: "700", fontVariant: ["tabular-nums"] },
  opponent: { color: "#94A3B8", fontSize: 13, marginTop: 12 },
  toggleRow: { flexDirection: "row", padding: 12, gap: 8 },
  toggleBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: "center", backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border },
  toggleBtnActive: { backgroundColor: c.brandTertiary, borderColor: c.brandPrimary },
  toggleText: { color: c.onSurfaceTertiary, fontWeight: "700", fontSize: 13 },
  toggleTextActive: { color: c.onBrandTertiary },
  runsGrid: { flexDirection: "row", flexWrap: "wrap", padding: 16, gap: 10, justifyContent: "space-between" },
  runBtn: { width: "30%", aspectRatio: 1.6, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border },
  runBtnPrimary: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  runBtnDanger: { backgroundColor: c.error, borderColor: c.error },
  runText: { fontSize: 28, fontWeight: "800", color: c.onSurface, fontVariant: ["tabular-nums"] },
  runTextInv: { color: "#FFFFFF" },
  runLbl: { fontSize: 11, color: c.muted, fontWeight: "600", marginTop: 2 },
  runLblInv: { color: "#FFFFFF" },
  actionBar: { flexDirection: "row", paddingHorizontal: 16, gap: 10 },
  actionBtn: { flex: 1, backgroundColor: c.surfaceTertiary, borderRadius: 12, paddingVertical: 12, alignItems: "center", borderWidth: 1, borderColor: c.border },
  actionText: { color: c.onSurface, fontWeight: "700", fontSize: 13 },
  primaryBtn: { margin: 16, backgroundColor: c.success, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  primaryBtnText: { color: c.onSuccess, fontWeight: "700", fontSize: 15 },
  target: { color: c.warning, fontSize: 13, marginTop: 8, fontWeight: "700" },
}));

type Match = {
  match_id: string; team_a_name: string; team_b_name: string;
  team_a_short: string; team_b_short: string;
  team_a_id: string; team_b_id: string;
  overs: number; status: string; current_innings: "a" | "b";
  innings_a: { runs: number; wickets: number; overs: number };
  innings_b: { runs: number; wickets: number; overs: number };
  winner_team_id?: string | null;
};

function nextOvers(cur: number): number {
  // 12.3 -> 12.4 ; 12.5 -> 13.0
  const whole = Math.floor(cur + 1e-9);
  const balls = Math.round((cur - whole) * 10);
  if (balls >= 5) return whole + 1;
  return parseFloat((whole + (balls + 1) / 10).toFixed(1));
}

export default function LiveMatch() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { apiFetch } = useAuth();
  const [match, setMatch] = useState<Match | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/matches/${id}`);
      if (r.ok) { const d = await r.json(); setMatch(d.match); }
    } catch {}
  }, [apiFetch, id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const update = async (patch: { runs?: number; wickets?: number; advanceBall?: boolean }, side?: "a" | "b") => {
    if (!match || match.status === "completed") return;
    const s = side || match.current_innings;
    const cur = s === "a" ? match.innings_a : match.innings_b;
    const runs = cur.runs + (patch.runs || 0);
    const wickets = Math.min(10, cur.wickets + (patch.wickets || 0));
    const overs = patch.advanceBall ? nextOvers(cur.overs) : cur.overs;
    setSaving(true);
    try {
      Haptics.selectionAsync().catch(() => {});
      const r = await apiFetch(`/api/matches/${match.match_id}/innings/${s}`, {
        method: "PUT",
        body: JSON.stringify({ runs, wickets, overs }),
      });
      if (r.ok) { const d = await r.json(); setMatch(d.match); }
    } catch {}
    setSaving(false);
  };

  const switchInnings = async (side: "a" | "b") => {
    if (!match) return;
    setSaving(true);
    try {
      const cur = side === "a" ? match.innings_a : match.innings_b;
      await apiFetch(`/api/matches/${match.match_id}/innings/${side}`, {
        method: "PUT",
        body: JSON.stringify({ runs: cur.runs, wickets: cur.wickets, overs: cur.overs }),
      });
      await load();
    } catch {}
    setSaving(false);
  };

  const endMatch = async () => {
    if (!match) return;
    setSaving(true);
    try {
      const r = await apiFetch(`/api/matches/${match.match_id}/complete`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      if (r.ok) { const d = await r.json(); setMatch(d.match); }
    } catch {}
    setSaving(false);
  };

  if (!match) {
    return (
      <View style={[styles.root, { paddingTop: insets.top, alignItems: "center", justifyContent: "center" }]}>
        <ActivityIndicator color={colors.brandPrimary} />
      </View>
    );
  }

  const isA = match.current_innings === "a";
  const inn = isA ? match.innings_a : match.innings_b;
  const other = isA ? match.innings_b : match.innings_a;
  const battingName = isA ? match.team_a_name : match.team_b_name;
  const otherName = isA ? match.team_b_name : match.team_a_name;
  const target = other.runs > 0 ? other.runs + 1 : 0;
  const isCompleted = match.status === "completed";
  const winner = match.winner_team_id === match.team_a_id ? match.team_a_name : match.winner_team_id === match.team_b_id ? match.team_b_name : null;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="live-match-screen">
      <View style={styles.headerRow}>
        <Pressable style={styles.hbtn} onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
        <Text style={styles.htitle}>{match.team_a_short} vs {match.team_b_short}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.scoreboard}>
          <View style={styles.liveTag}>
            {!isCompleted && <View style={styles.liveDot} />}
            <Text style={styles.liveText}>{isCompleted ? "COMPLETED" : "LIVE"}</Text>
          </View>
          <Text style={styles.battingLbl}>Batting</Text>
          <Text style={styles.battingTeam}>{battingName}</Text>
          <Text style={styles.bigScore}>{inn.runs}<Text style={{ fontSize: 32 }}>/{inn.wickets}</Text></Text>
          <View style={styles.scoreMeta}>
            <View style={styles.metaBlock}>
              <Text style={styles.metaLbl}>Overs</Text>
              <Text style={styles.metaVal}>{inn.overs.toFixed(1)}/{match.overs}</Text>
            </View>
            <View style={styles.metaBlock}>
              <Text style={styles.metaLbl}>CRR</Text>
              <Text style={styles.metaVal}>{inn.overs > 0 ? (inn.runs / inn.overs).toFixed(2) : "0.00"}</Text>
            </View>
          </View>
          {other.runs > 0 && (
            <Text style={styles.target}>Target: {target} • {otherName}: {other.runs}/{other.wickets} ({other.overs})</Text>
          )}
          {isCompleted && winner && (
            <Text style={[styles.target, { color: "#4ADE80" }]}>🏆 {winner} won the match</Text>
          )}
        </View>

        {!isCompleted && (
          <>
            <View style={styles.toggleRow}>
              <Pressable testID="innings-a-btn" style={[styles.toggleBtn, isA && styles.toggleBtnActive]} onPress={() => switchInnings("a")}>
                <Text style={[styles.toggleText, isA && styles.toggleTextActive]}>{match.team_a_short} bats</Text>
              </Pressable>
              <Pressable testID="innings-b-btn" style={[styles.toggleBtn, !isA && styles.toggleBtnActive]} onPress={() => switchInnings("b")}>
                <Text style={[styles.toggleText, !isA && styles.toggleTextActive]}>{match.team_b_short} bats</Text>
              </Pressable>
            </View>

            <View style={styles.runsGrid}>
              {[0, 1, 2, 3, 4, 6].map((n) => (
                <Pressable key={n} testID={`run-${n}`} style={[styles.runBtn, n === 4 || n === 6 ? styles.runBtnPrimary : null]} onPress={() => update({ runs: n, advanceBall: true })} disabled={saving}>
                  <Text style={[styles.runText, (n === 4 || n === 6) && styles.runTextInv]}>{n}</Text>
                  <Text style={[styles.runLbl, (n === 4 || n === 6) && styles.runLblInv]}>{n === 4 ? "FOUR" : n === 6 ? "SIX" : n === 0 ? "DOT" : `RUN${n > 1 ? "S" : ""}`}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.actionBar}>
              <Pressable testID="wicket-btn" style={[styles.runBtn, styles.runBtnDanger, { flex: 1, width: undefined, aspectRatio: undefined, paddingVertical: 14 }]} onPress={() => update({ wickets: 1, advanceBall: true })} disabled={saving}>
                <Text style={[styles.runText, styles.runTextInv, { fontSize: 20 }]}>WICKET</Text>
              </Pressable>
              <Pressable testID="extra-btn" style={styles.actionBtn} onPress={() => update({ runs: 1 })} disabled={saving}>
                <Text style={styles.actionText}>+1 Extra</Text>
              </Pressable>
              <Pressable testID="undo-ball-btn" style={styles.actionBtn} onPress={() => update({ advanceBall: true })} disabled={saving}>
                <Text style={styles.actionText}>Next Ball</Text>
              </Pressable>
            </View>

            <Pressable testID="end-match-btn" style={styles.primaryBtn} onPress={endMatch} disabled={saving}>
              <Text style={styles.primaryBtnText}>End Match</Text>
            </Pressable>
          </>
        )}
        <View style={{ height: 16 + insets.bottom }} />
      </ScrollView>
    </View>
  );
}
