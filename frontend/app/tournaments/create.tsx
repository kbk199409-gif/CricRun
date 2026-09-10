import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
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
  input: { backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: c.onSurface, marginBottom: 20 },
  chipsRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 20 },
  chip: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceTertiary },
  chipActive: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  chipText: { color: c.onSurfaceTertiary, fontWeight: "600", fontSize: 14 },
  chipTextActive: { color: c.onBrandTertiary },
  row: { flexDirection: "row", gap: 12 },
  half: { flex: 1 },
  saveBtn: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 8 },
  saveText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  hint: { color: c.muted, fontSize: 12, marginTop: -12, marginBottom: 16 },
}));

export default function CreateTournament() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { apiFetch } = useAuth();
  const [name, setName] = useState("");
  const [loc, setLoc] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [overs, setOvers] = useState<number>(20);
  const [customOvers, setCustomOvers] = useState("");
  const [loading, setLoading] = useState(false);

  const chosenOvers = customOvers ? parseInt(customOvers) || 0 : overs;

  const save = async () => {
    if (!name.trim() || chosenOvers < 1) return;
    setLoading(true);
    try {
      const r = await apiFetch("/api/tournaments", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          location: loc.trim() || null,
          overs: chosenOvers,
          start_date: startDate || null,
          end_date: endDate || null,
        }),
      });
      if (r.ok) {
        const d = await r.json();
        router.replace(`/tournaments/${d.tournament.tournament_id}`);
      }
    } catch {}
    setLoading(false);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="create-tournament-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.headerRow}>
          <Pressable style={styles.hbtn} onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
          <Text style={styles.htitle}>New Tournament</Text>
          <View style={{ width: 32 }} />
        </View>
        <ScrollView keyboardShouldPersistTaps="handled">
          <View style={styles.form}>
            <Text style={styles.label}>Tournament Name</Text>
            <TextInput testID="trn-name-input" style={styles.input} placeholder="Summer Cup 2026" placeholderTextColor={colors.muted} value={name} onChangeText={setName} />

            <Text style={styles.label}>Location (optional)</Text>
            <TextInput testID="trn-loc-input" style={styles.input} placeholder="Mumbai" placeholderTextColor={colors.muted} value={loc} onChangeText={setLoc} />

            <View style={styles.row}>
              <View style={styles.half}>
                <Text style={styles.label}>Start Date</Text>
                <TextInput testID="trn-start-input" style={styles.input} placeholder="2026-03-01" placeholderTextColor={colors.muted} value={startDate} onChangeText={setStartDate} />
              </View>
              <View style={styles.half}>
                <Text style={styles.label}>End Date (optional)</Text>
                <TextInput testID="trn-end-input" style={styles.input} placeholder="2026-03-15" placeholderTextColor={colors.muted} value={endDate} onChangeText={setEndDate} />
              </View>
            </View>

            <Text style={styles.label}>Overs per match</Text>
            <View style={styles.chipsRow}>
              {OVERS_PRESETS.map((n) => (
                <Pressable
                  key={n}
                  testID={`overs-${n}`}
                  style={[styles.chip, !customOvers && overs === n && styles.chipActive]}
                  onPress={() => { setOvers(n); setCustomOvers(""); }}
                >
                  <Text style={[styles.chipText, !customOvers && overs === n && styles.chipTextActive]}>{n} overs</Text>
                </Pressable>
              ))}
            </View>
            <TextInput
              testID="trn-custom-overs"
              style={styles.input}
              placeholder="Or enter custom overs..."
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              value={customOvers}
              onChangeText={setCustomOvers}
            />
            <Text style={styles.hint}>Selected: {chosenOvers} overs per match</Text>

            <Pressable testID="save-trn-btn" style={styles.saveBtn} onPress={save} disabled={loading || !name.trim() || chosenOvers < 1}>
              {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveText}>Create Tournament</Text>}
            </Pressable>
          </View>
          <View style={{ height: 32 + insets.bottom }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
