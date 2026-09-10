import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useCallback, useState } from "react";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface },
  hbtn: { padding: 6 },
  htitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: c.onSurface },
  hero: { backgroundColor: c.brandPrimary, padding: 24, alignItems: "center" },
  logo: { width: 72, height: 72, borderRadius: 16, backgroundColor: "#FFFFFF33", alignItems: "center", justifyContent: "center" },
  logoText: { color: "#FFFFFF", fontSize: 22, fontWeight: "800" },
  teamName: { color: "#FFFFFF", fontSize: 22, fontWeight: "800", marginTop: 12 },
  playerCount: { color: "#DBEAFE", fontSize: 13, marginTop: 4 },
  addRow: { flexDirection: "row", padding: 20, gap: 10 },
  input: { flex: 1, backgroundColor: c.surface, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.onSurface },
  addBtn: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  playerRow: { marginHorizontal: 20, marginBottom: 8, backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 },
  playerAvatar: { width: 36, height: 36, borderRadius: 999, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  playerAvatarText: { color: c.onBrandTertiary, fontWeight: "700" },
  playerName: { flex: 1, color: c.onSurface, fontWeight: "600", fontSize: 15 },
  sectionHead: { fontSize: 12, fontWeight: "700", color: c.muted, letterSpacing: 1, marginHorizontal: 20, marginTop: 8, marginBottom: 8, textTransform: "uppercase" },
  empty: { alignItems: "center", padding: 30 },
  emptyText: { color: c.muted, marginTop: 8, fontSize: 14 },
}));

export default function TeamDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { apiFetch } = useAuth();
  const [team, setTeam] = useState<any>(null);
  const [playerName, setPlayerName] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/teams/${id}`);
      if (r.ok) { const d = await r.json(); setTeam(d.team); }
    } catch {}
  }, [apiFetch, id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const addPlayer = async () => {
    if (!playerName.trim()) return;
    setAdding(true);
    try {
      await apiFetch(`/api/teams/${id}/players`, { method: "POST", body: JSON.stringify({ name: playerName.trim() }) });
      setPlayerName("");
      await load();
    } catch {}
    setAdding(false);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="team-detail-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.headerRow}>
          <Pressable style={styles.hbtn} onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
          <Text style={styles.htitle}>Team Details</Text>
          <View style={{ width: 32 }} />
        </View>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <View style={styles.logo}><Text style={styles.logoText}>{team?.short_name || "..."}</Text></View>
            <Text style={styles.teamName}>{team?.name || "Loading..."}</Text>
            <Text style={styles.playerCount}>{(team?.players || []).length} players</Text>
          </View>

          <View style={styles.addRow}>
            <TextInput testID="player-name-input" style={styles.input} placeholder="Add player name" placeholderTextColor={colors.muted} value={playerName} onChangeText={setPlayerName} />
            <Pressable testID="add-player-btn" style={styles.addBtn} onPress={addPlayer} disabled={adding || !playerName.trim()}>
              {adding ? <ActivityIndicator color="#FFF" /> : <Ionicons name="add" size={22} color="#FFF" />}
            </Pressable>
          </View>

          <Text style={styles.sectionHead}>Squad</Text>
          {(team?.players || []).length === 0 ? (
            <View style={styles.empty}><Ionicons name="person-add-outline" size={40} color={colors.muted} /><Text style={styles.emptyText}>No players yet</Text></View>
          ) : (
            (team.players).map((p: any, i: number) => (
              <View key={p.player_id} style={styles.playerRow} testID={`player-${p.player_id}`}>
                <View style={styles.playerAvatar}><Text style={styles.playerAvatarText}>{i + 1}</Text></View>
                <Text style={styles.playerName}>{p.name}</Text>
              </View>
            ))
          )}
          <View style={{ height: 32 + insets.bottom }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
