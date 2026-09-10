import { View, Text, Pressable, TextInput, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth";

const OVERS_PRESETS = [5, 6, 8, 10, 12, 15, 20];

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  hbtn: { padding: 6 },
  htitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: c.onSurface },
  form: { padding: 20 },
  label: { fontSize: 13, fontWeight: "700", color: c.onSurface, marginBottom: 8, textTransform: "uppercase", letterSpacing: 0.5 },
  teamCard: { flexDirection: "row", alignItems: "center", padding: 14, backgroundColor: c.surfaceTertiary, borderRadius: 12, borderWidth: 1.5, borderColor: c.border, marginBottom: 10 },
  teamCardActive: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  teamAvatar: { width: 40, height: 40, borderRadius: 10, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", marginRight: 12 },
  teamAvatarText: { color: c.onBrandPrimary, fontWeight: "800" },
  teamName: { flex: 1, color: c.onSurface, fontWeight: "600", fontSize: 15 },
  teamMeta: { color: c.muted, fontSize: 12 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 12 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceTertiary },
  chipActive: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  chipText: { color: c.onSurfaceTertiary, fontWeight: "600", fontSize: 14 },
  chipTextActive: { color: c.onBrandTertiary },
  input: { backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: c.onSurface, marginBottom: 12 },
  saveBtn: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  saveText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  hint: { color: c.muted, fontSize: 13, marginBottom: 12 },
  warning: { color: c.warning, fontSize: 13, marginBottom: 12, fontWeight: "600" },
}));

export default function CreateMatch() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { tournament_id } = useLocalSearchParams<{ tournament_id?: string }>();
  const { apiFetch } = useAuth();
  const [teams, setTeams] = useState<any[]>([]);
  const [teamA, setTeamA] = useState<string>("");
  const [teamB, setTeamB] = useState<string>("");
  const [overs, setOvers] = useState<number>(20);
  const [customOvers, setCustomOvers] = useState("");
  const [tournamentOvers, setTournamentOvers] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      if (tournament_id) {
        const r = await apiFetch(`/api/tournaments/${tournament_id}`);
        if (r.ok) {
          const d = await r.json();
          setTeams(d.teams || []);
          setTournamentOvers(d.tournament.overs);
          setOvers(d.tournament.overs);
          return;
        }
      }
      const r = await apiFetch("/api/teams");
      if (r.ok) { const d = await r.json(); setTeams(d.teams || []); }
    } catch {}
  }, [apiFetch, tournament_id]);
  useEffect(() => { load(); }, [load]);

  const chosenOvers = customOvers ? parseInt(customOvers) || 0 : overs;

  const create = async () => {
    if (!teamA || !teamB || teamA === teamB || chosenOvers < 1) return;
    // Validate teams have at least 2 players each (for openers)
    const tA = teams.find((t) => t.team_id === teamA);
    const tB = teams.find((t) => t.team_id === teamB);
    if ((tA?.players?.length || 0) < 2 || (tB?.players?.length || 0) < 2) {
      alert("Both teams need at least 2 players (opener + non-striker) before you can start scoring.");
      return;
    }
    setLoading(true);
    try {
      const r = await apiFetch("/api/matches", {
        method: "POST",
        body: JSON.stringify({ team_a_id: teamA, team_b_id: teamB, overs: chosenOvers, tournament_id: tournament_id || null }),
      });
      if (r.ok) {
        const d = await r.json();
        router.replace(`/matches/${d.match.match_id}/toss`);
      }
    } catch {}
    setLoading(false);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="create-match-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.headerRow}>
          <Pressable style={styles.hbtn} onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
          <Text style={styles.htitle}>New Match</Text>
          <View style={{ width: 32 }} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={styles.form}>
            {teams.length < 2 && (
              <Text style={styles.warning}>You need at least 2 teams. Create teams and add players first.</Text>
            )}
            <Text style={styles.label}>Team A</Text>
            {teams.map((t) => (
              <Pressable key={`a-${t.team_id}`} testID={`teamA-${t.team_id}`} style={[styles.teamCard, teamA === t.team_id && styles.teamCardActive]} onPress={() => setTeamA(t.team_id)}>
                <View style={styles.teamAvatar}><Text style={styles.teamAvatarText}>{t.short_name}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.teamName}>{t.name}</Text>
                  <Text style={styles.teamMeta}>{(t.players || []).length} players</Text>
                </View>
                {teamA === t.team_id && <Ionicons name="checkmark-circle" size={22} color={colors.brandPrimary} />}
              </Pressable>
            ))}
            <Text style={[styles.label, { marginTop: 12 }]}>Team B</Text>
            {teams.filter((t) => t.team_id !== teamA).map((t) => (
              <Pressable key={`b-${t.team_id}`} testID={`teamB-${t.team_id}`} style={[styles.teamCard, teamB === t.team_id && styles.teamCardActive]} onPress={() => setTeamB(t.team_id)}>
                <View style={styles.teamAvatar}><Text style={styles.teamAvatarText}>{t.short_name}</Text></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.teamName}>{t.name}</Text>
                  <Text style={styles.teamMeta}>{(t.players || []).length} players</Text>
                </View>
                {teamB === t.team_id && <Ionicons name="checkmark-circle" size={22} color={colors.brandPrimary} />}
              </Pressable>
            ))}

            <Text style={[styles.label, { marginTop: 12 }]}>Overs</Text>
            {tournamentOvers ? (
              <Text style={styles.hint}>Fixed by tournament: {tournamentOvers} overs</Text>
            ) : (
              <>
                <View style={styles.chipsRow}>
                  {OVERS_PRESETS.map((n) => (
                    <Pressable key={n} testID={`overs-${n}`} style={[styles.chip, !customOvers && overs === n && styles.chipActive]} onPress={() => { setOvers(n); setCustomOvers(""); }}>
                      <Text style={[styles.chipText, !customOvers && overs === n && styles.chipTextActive]}>{n} overs</Text>
                    </Pressable>
                  ))}
                </View>
                <TextInput testID="overs-custom" style={styles.input} placeholder="Custom overs..." placeholderTextColor={colors.muted} keyboardType="number-pad" value={customOvers} onChangeText={setCustomOvers} />
              </>
            )}

            <Pressable testID="start-match-btn" style={styles.saveBtn} onPress={create} disabled={loading || !teamA || !teamB || chosenOvers < 1}>
              {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveText}>Confirm & Do the Toss</Text>}
            </Pressable>
          </View>
          <View style={{ height: 32 + insets.bottom }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
