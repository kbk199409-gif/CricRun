import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { useState } from "react";
import { useRouter } from "expo-router";
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
  input: { backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: c.onSurface, marginBottom: 20 },
  pillRow: { flexDirection: "row", gap: 10, marginBottom: 20 },
  pill: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceTertiary },
  pillActive: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  pillText: { color: c.onSurfaceTertiary, fontWeight: "600", fontSize: 14 },
  pillTextActive: { color: c.onBrandTertiary },
  saveBtn: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  saveText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 16 },
}));

export default function CreateTournament() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { apiFetch } = useAuth();
  const [name, setName] = useState("");
  const [loc, setLoc] = useState("");
  const [fmt, setFmt] = useState("T20");
  const [overs, setOvers] = useState("20");
  const [loading, setLoading] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const r = await apiFetch("/api/tournaments", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), location: loc.trim(), format: fmt, overs: parseInt(overs) || 20 }),
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
        <ScrollView>
          <View style={styles.form}>
            <Text style={styles.label}>Tournament Name</Text>
            <TextInput testID="trn-name-input" style={styles.input} placeholder="Summer Cup 2026" placeholderTextColor={colors.muted} value={name} onChangeText={setName} />
            <Text style={styles.label}>Location</Text>
            <TextInput testID="trn-loc-input" style={styles.input} placeholder="Mumbai" placeholderTextColor={colors.muted} value={loc} onChangeText={setLoc} />
            <Text style={styles.label}>Format</Text>
            <View style={styles.pillRow}>
              {["T20", "ODI", "T10"].map((f) => (
                <Pressable key={f} testID={`fmt-${f}`} style={[styles.pill, fmt === f && styles.pillActive]} onPress={() => { setFmt(f); setOvers(f === "T20" ? "20" : f === "ODI" ? "50" : "10"); }}>
                  <Text style={[styles.pillText, fmt === f && styles.pillTextActive]}>{f}</Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.label}>Overs per innings</Text>
            <TextInput testID="trn-overs-input" style={styles.input} keyboardType="number-pad" value={overs} onChangeText={setOvers} />
            <Pressable testID="save-trn-btn" style={styles.saveBtn} onPress={save} disabled={loading || !name.trim()}>
              {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveText}>Create Tournament</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
