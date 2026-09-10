import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useCallback, useState } from "react";
import { useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border, flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { fontSize: 28, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  addBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  card: { marginHorizontal: 20, marginTop: 12, backgroundColor: c.surface, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: c.border },
  cardTitle: { fontSize: 18, fontWeight: "700", color: c.onSurface },
  cardMeta: { color: c.muted, fontSize: 13, marginTop: 4 },
  chip: { alignSelf: "flex-start", backgroundColor: c.brandTertiary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 8 },
  chipText: { color: c.onBrandTertiary, fontSize: 11, fontWeight: "700" },
  empty: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 20 },
  emptyText: { color: c.muted, marginTop: 12, fontSize: 14, textAlign: "center" },
}));

type Trn = { tournament_id: string; name: string; format: string; overs: number; location?: string; team_ids: string[] };

export default function TournamentsTab() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { apiFetch } = useAuth();
  const [trns, setTrns] = useState<Trn[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/api/tournaments");
      if (r.ok) { const d = await r.json(); setTrns(d.tournaments || []); }
    } catch {}
    setLoading(false);
  }, [apiFetch]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="tournaments-tab">
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>Tournaments</Text>
        </View>
        <Pressable testID="new-tournament-btn" style={styles.addBtn} onPress={() => router.push("/tournaments/create")}>
          <Ionicons name="add" size={26} color={colors.onBrandPrimary} />
        </Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.brandPrimary} />
        ) : trns.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="trophy-outline" size={56} color={colors.muted} />
            <Text style={styles.emptyText}>No tournaments yet.{"\n"}Create your first tournament!</Text>
          </View>
        ) : (
          trns.map((t) => (
            <Pressable key={t.tournament_id} testID={`trn-${t.tournament_id}`} style={styles.card} onPress={() => router.push(`/tournaments/${t.tournament_id}`)}>
              <Text style={styles.cardTitle}>{t.name}</Text>
              <Text style={styles.cardMeta}>{t.overs} overs • {(t.team_ids || []).length} teams{t.location ? ` • ${t.location}` : ""}</Text>
              <View style={styles.chip}><Text style={styles.chipText}>Manage</Text></View>
            </Pressable>
          ))
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}
