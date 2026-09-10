import { View, Text, Pressable, TextInput, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth";

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
  input: { backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: c.onSurface, marginBottom: 20 },
  saveBtn: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  saveText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  hint: { color: c.muted, fontSize: 13, marginBottom: 12 },
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
  const [overs, setOvers] = useState<string>("20");
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    try {
      if (tournament_id) {
        const r = await apiFetch(`/api/tournaments/${tournament_id}`);
        if (r.ok) { const d = await r.json(); setTeams(d.teams || []); return; }
      }
      const r = await apiFetch("/api/teams");
      if (r.ok) { const d = await r.json(); setTeams(d.teams || []); }
    } catch {}
  }, [apiFetch, tournament_id]);
  useEffect(() => { load(); }, [load]);

  const create = async () => {
    if (!teamA || !teamB || teamA === teamB) return;
    setLoading(true);
    try {
      const r = await apiFetch("/api/matches", {
        method: "POST",
        body: JSON.stringify({ team_a_id: teamA, team_b_id: teamB, overs: parseInt(overs) || 20, tournament_id: tournament_id || null }),
      });
      if (r.ok) {
        const d = await r.json();
        router.replace(`/matches/${d.match.match_id}`);
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
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.form}>
            {teams.length < 2 && (
              <Text style={styles.hint}>You need at least 2 teams. Create teams first.</Text>
            )}
            <Text style={styles.label}>Team A</Text>
            {teams.map((t) => (
              <Pressable key={`a-${t.team_id}`} testID={`teamA-${t.team_id}`} style={[styles.teamCard, teamA === t.team_id && styles.teamCardActive]} onPress={() => setTeamA(t.team_id)}>
                <View style={styles.teamAvatar}><Text style={styles.teamAvatarText}>{t.short_name}</Text></View>
                <Text style={styles.teamName}>{t.name}</Text>
                {teamA === t.team_id && <Ionicons name="checkmark-circle" size={22} color={colors.brandPrimary} />}
              </Pressable>
            ))}
            <Text style={[styles.label, { marginTop: 12 }]}>Team B</Text>
            {teams.filter((t) => t.team_id !== teamA).map((t) => (
              <Pressable key={`b-${t.team_id}`} testID={`teamB-${t.team_id}`} style={[styles.teamCard, teamB === t.team_id && styles.teamCardActive]} onPress={() => setTeamB(t.team_id)}>
                <View style={styles.teamAvatar}><Text style={styles.teamAvatarText}>{t.short_name}</Text></View>
                <Text style={styles.teamName}>{t.name}</Text>
                {teamB === t.team_id && <Ionicons name="checkmark-circle" size={22} color={colors.brandPrimary} />}
              </Pressable>
            ))}

            <Text style={[styles.label, { marginTop: 12 }]}>Overs</Text>
            <TextInput testID="overs-input" style={styles.input} placeholder="20" placeholderTextColor={colors.muted} keyboardType="number-pad" value={overs} onChangeText={setOvers} />

            <Pressable testID="start-match-btn" style={styles.saveBtn} onPress={create} disabled={loading || !teamA || !teamB}>
              {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveText}>Start Match</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
