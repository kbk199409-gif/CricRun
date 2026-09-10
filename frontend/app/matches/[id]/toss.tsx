import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface },
  hbtn: { padding: 6 },
  htitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: c.onSurface },
  banner: { backgroundColor: c.brandPrimary, padding: 20 },
  bannerTitle: { color: c.onBrandPrimary, fontSize: 22, fontWeight: "800" },
  bannerSub: { color: "#DBEAFE", fontSize: 13, marginTop: 4 },
  sectionHead: { fontSize: 12, fontWeight: "700", color: c.muted, letterSpacing: 1, marginHorizontal: 16, marginTop: 20, marginBottom: 8, textTransform: "uppercase" },
  row: { marginHorizontal: 16, marginBottom: 10, backgroundColor: c.surface, borderRadius: 12, padding: 16, borderWidth: 1.5, borderColor: c.border },
  rowActive: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  rowText: { color: c.onSurface, fontWeight: "700", fontSize: 16 },
  choiceRow: { flexDirection: "row", marginHorizontal: 16, gap: 10, marginTop: 4 },
  choice: { flex: 1, paddingVertical: 20, alignItems: "center", backgroundColor: c.surface, borderRadius: 14, borderWidth: 1.5, borderColor: c.border },
  choiceActive: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  choiceText: { color: c.onSurface, fontWeight: "800", fontSize: 16 },
  cta: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 16, alignItems: "center", margin: 16 },
  ctaText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  disabled: { opacity: 0.5 },
  err: { color: c.error, textAlign: "center", marginHorizontal: 16 },
}));

export default function TossScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { apiFetch } = useAuth();
  const [match, setMatch] = useState<any>(null);
  const [winner, setWinner] = useState<string>("");
  const [decision, setDecision] = useState<"bat" | "bowl" | "">("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState("");

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/matches/${id}`);
      if (r.ok) setMatch((await r.json()).match);
    } catch {}
  }, [apiFetch, id]);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (!winner || !decision) return;
    setSaving(true); setErr("");
    try {
      const r = await apiFetch(`/api/matches/${id}/toss`, { method: "POST", body: JSON.stringify({ toss_winner_team_id: winner, decision }) });
      if (r.ok) {
        const d = await r.json();
        const side = d.match.current_innings; // side of team that bats first
        router.replace(`/matches/${id}/setup?side=${side}`);
      } else {
        const j = await r.json().catch(() => ({}));
        setErr(j.detail || "Failed to save toss");
      }
    } catch { setErr("Network error"); }
    setSaving(false);
  };

  if (!match) return <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}><ActivityIndicator color={colors.brandPrimary} /></View>;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="toss-screen">
      <View style={styles.headerRow}>
        <Pressable style={styles.hbtn} onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
        <Text style={styles.htitle}>Toss</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView>
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>{match.team_a_name} vs {match.team_b_name}</Text>
          <Text style={styles.bannerSub}>{match.overs} overs</Text>
        </View>
        <Text style={styles.sectionHead}>Who won the toss?</Text>
        <Pressable testID={`toss-${match.team_a_id}`} style={[styles.row, winner === match.team_a_id && styles.rowActive]} onPress={() => setWinner(match.team_a_id)}>
          <Text style={styles.rowText}>{match.team_a_name}</Text>
        </Pressable>
        <Pressable testID={`toss-${match.team_b_id}`} style={[styles.row, winner === match.team_b_id && styles.rowActive]} onPress={() => setWinner(match.team_b_id)}>
          <Text style={styles.rowText}>{match.team_b_name}</Text>
        </Pressable>

        <Text style={styles.sectionHead}>They elected to</Text>
        <View style={styles.choiceRow}>
          <Pressable testID="decision-bat" style={[styles.choice, decision === "bat" && styles.choiceActive]} onPress={() => setDecision("bat")}>
            <Ionicons name="baseball" size={30} color={colors.brandPrimary} />
            <Text style={styles.choiceText}>Bat</Text>
          </Pressable>
          <Pressable testID="decision-bowl" style={[styles.choice, decision === "bowl" && styles.choiceActive]} onPress={() => setDecision("bowl")}>
            <Ionicons name="disc" size={30} color={colors.brandPrimary} />
            <Text style={styles.choiceText}>Bowl</Text>
          </Pressable>
        </View>

        {err ? <Text style={styles.err}>{err}</Text> : null}
        <Pressable testID="submit-toss-btn" style={[styles.cta, (!winner || !decision) && styles.disabled]} onPress={submit} disabled={!winner || !decision || saving}>
          {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.ctaText}>Continue to Openers</Text>}
        </Pressable>
      </ScrollView>
    </View>
  );
}
