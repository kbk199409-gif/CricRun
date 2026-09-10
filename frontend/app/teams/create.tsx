import { View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView } from "react-native";
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
  saveBtn: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  saveText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 16 },
}));

export default function CreateTeam() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { apiFetch } = useAuth();
  const [name, setName] = useState("");
  const [short, setShort] = useState("");
  const [loading, setLoading] = useState(false);

  const save = async () => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const r = await apiFetch("/api/teams", { method: "POST", body: JSON.stringify({ name: name.trim(), short_name: short.trim().toUpperCase() || undefined }) });
      if (r.ok) {
        const d = await r.json();
        router.replace(`/teams/${d.team.team_id}`);
      }
    } catch {}
    setLoading(false);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="create-team-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.headerRow}>
          <Pressable style={styles.hbtn} onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
          <Text style={styles.htitle}>Create Team</Text>
          <View style={{ width: 32 }} />
        </View>
        <ScrollView>
          <View style={styles.form}>
            <Text style={styles.label}>Team Name</Text>
            <TextInput testID="team-name-input" style={styles.input} placeholder="Mumbai Warriors" placeholderTextColor={colors.muted} value={name} onChangeText={setName} />
            <Text style={styles.label}>Short Code (3 letters)</Text>
            <TextInput testID="team-short-input" style={styles.input} placeholder="MW" placeholderTextColor={colors.muted} value={short} onChangeText={(t) => setShort(t.toUpperCase().slice(0, 4))} maxLength={4} autoCapitalize="characters" />
            <Pressable testID="save-team-btn" style={styles.saveBtn} onPress={save} disabled={loading || !name.trim()}>
              {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveText}>Create Team</Text>}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
