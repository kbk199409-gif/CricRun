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
  banner: { backgroundColor: c.brandPrimary, paddingVertical: 20, paddingHorizontal: 20 },
  bannerTitle: { color: c.onBrandPrimary, fontSize: 22, fontWeight: "800" },
  bannerSub: { color: "#DBEAFE", fontSize: 13, marginTop: 4 },
  sectionHead: { fontSize: 12, fontWeight: "700", color: c.muted, letterSpacing: 1, marginHorizontal: 16, marginTop: 20, marginBottom: 8, textTransform: "uppercase" },
  playerRow: { marginHorizontal: 16, marginBottom: 8, backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 },
  playerRowActive: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  avatar: { width: 40, height: 40, borderRadius: 999, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: c.onBrandTertiary, fontWeight: "700" },
  name: { flex: 1, color: c.onSurface, fontWeight: "600", fontSize: 15 },
  hint: { fontSize: 12, color: c.muted, marginTop: 2 },
  goBtn: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 16, alignItems: "center", margin: 16 },
  goBtnText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  disabled: { opacity: 0.5 },
  err: { color: c.error, textAlign: "center", marginHorizontal: 16, marginTop: 8 },
}));

export default function MatchSetup() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, side } = useLocalSearchParams<{ id: string; side?: string }>();
  const { apiFetch } = useAuth();
  const [match, setMatch] = useState<any>(null);
  const [batTeam, setBatTeam] = useState<any>(null);
  const [bowlTeam, setBowlTeam] = useState<any>(null);
  const [striker, setStriker] = useState<string>("");
  const [nonStriker, setNonStriker] = useState<string>("");
  const [bowler, setBowler] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const S = side === "b" ? "b" : "a";

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/matches/${id}`);
      if (r.ok) {
        const d = await r.json();
        const m = d.match;
        setMatch(m);
        const batId = S === "a" ? m.team_a_id : m.team_b_id;
        const bowlId = S === "a" ? m.team_b_id : m.team_a_id;
        const [rBat, rBowl] = await Promise.all([
          apiFetch(`/api/teams/${batId}`),
          apiFetch(`/api/teams/${bowlId}`),
        ]);
        if (rBat.ok) setBatTeam((await rBat.json()).team);
        if (rBowl.ok) setBowlTeam((await rBowl.json()).team);
      }
    } catch {}
  }, [apiFetch, id, S]);
  useEffect(() => { load(); }, [load]);

  const start = async () => {
    if (!striker || !nonStriker || !bowler) return;
    if (striker === nonStriker) { setErr("Striker and non-striker must be different"); return; }
    setLoading(true); setErr("");
    try {
      const r = await apiFetch(`/api/matches/${id}/innings/${S}/start`, {
        method: "POST",
        body: JSON.stringify({ striker_id: striker, non_striker_id: nonStriker, bowler_id: bowler }),
      });
      if (r.ok) {
        router.replace(`/matches/${id}`);
      } else {
        const j = await r.json().catch(() => ({}));
        setErr(j.detail || "Failed to start innings");
      }
    } catch { setErr("Network error"); }
    setLoading(false);
  };

  if (!match || !batTeam || !bowlTeam) {
    return <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}><ActivityIndicator color={colors.brandPrimary} /></View>;
  }

  const batPlayers: any[] = batTeam.players || [];
  const bowlPlayers: any[] = bowlTeam.players || [];

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="match-setup-screen">
      <View style={styles.headerRow}>
        <Pressable style={styles.hbtn} onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
        <Text style={styles.htitle}>Set Openers</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>{S === "a" ? "Innings 1" : "Innings 2"}: {batTeam.name} batting</Text>
          <Text style={styles.bannerSub}>vs {bowlTeam.name} • {match.overs} overs</Text>
        </View>

        <Text style={styles.sectionHead}>Striker</Text>
        {batPlayers.map((p) => (
          <Pressable
            key={`s-${p.player_id}`}
            testID={`striker-${p.player_id}`}
            style={[styles.playerRow, striker === p.player_id && styles.playerRowActive, nonStriker === p.player_id && styles.disabled]}
            onPress={() => nonStriker !== p.player_id && setStriker(p.player_id)}
            disabled={nonStriker === p.player_id}
          >
            <View style={styles.avatar}><Text style={styles.avatarText}>{p.name?.[0] || "?"}</Text></View>
            <Text style={styles.name}>{p.name}{p.user_id ? "" : " (guest)"}</Text>
            {striker === p.player_id && <Ionicons name="checkmark-circle" size={22} color={colors.brandPrimary} />}
          </Pressable>
        ))}

        <Text style={styles.sectionHead}>Non-striker</Text>
        {batPlayers.map((p) => (
          <Pressable
            key={`n-${p.player_id}`}
            testID={`nonstriker-${p.player_id}`}
            style={[styles.playerRow, nonStriker === p.player_id && styles.playerRowActive, striker === p.player_id && styles.disabled]}
            onPress={() => striker !== p.player_id && setNonStriker(p.player_id)}
            disabled={striker === p.player_id}
          >
            <View style={styles.avatar}><Text style={styles.avatarText}>{p.name?.[0] || "?"}</Text></View>
            <Text style={styles.name}>{p.name}{p.user_id ? "" : " (guest)"}</Text>
            {nonStriker === p.player_id && <Ionicons name="checkmark-circle" size={22} color={colors.brandPrimary} />}
          </Pressable>
        ))}

        <Text style={styles.sectionHead}>Opening bowler</Text>
        {bowlPlayers.map((p) => (
          <Pressable
            key={`b-${p.player_id}`}
            testID={`bowler-${p.player_id}`}
            style={[styles.playerRow, bowler === p.player_id && styles.playerRowActive]}
            onPress={() => setBowler(p.player_id)}
          >
            <View style={styles.avatar}><Text style={styles.avatarText}>{p.name?.[0] || "?"}</Text></View>
            <Text style={styles.name}>{p.name}{p.user_id ? "" : " (guest)"}</Text>
            {bowler === p.player_id && <Ionicons name="checkmark-circle" size={22} color={colors.brandPrimary} />}
          </Pressable>
        ))}

        {err ? <Text testID="setup-error" style={styles.err}>{err}</Text> : null}
        <Pressable
          testID="start-innings-btn"
          style={[styles.goBtn, (!striker || !nonStriker || !bowler) && styles.disabled]}
          onPress={start}
          disabled={!striker || !nonStriker || !bowler || loading}
        >
          {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.goBtnText}>Start Innings</Text>}
        </Pressable>
        <View style={{ height: 24 + insets.bottom }} />
      </ScrollView>
    </View>
  );
}
