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
  card: { marginHorizontal: 20, marginTop: 12, backgroundColor: c.surface, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 14 },
  avatar: { width: 48, height: 48, borderRadius: 12, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  avatarText: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 16 },
  cardTitle: { fontSize: 16, fontWeight: "700", color: c.onSurface },
  cardMeta: { color: c.muted, fontSize: 12, marginTop: 2 },
  empty: { alignItems: "center", paddingVertical: 60, paddingHorizontal: 20 },
  emptyText: { color: c.muted, marginTop: 12, fontSize: 14, textAlign: "center" },
}));

type Team = { team_id: string; name: string; short_name: string; players: any[] };

export default function TeamsTab() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { apiFetch } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await apiFetch("/api/teams");
      if (r.ok) { const d = await r.json(); setTeams(d.teams || []); }
    } catch {}
    setLoading(false);
  }, [apiFetch]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="teams-tab">
      <View style={styles.header}>
        <Text style={styles.title}>My Teams</Text>
        <Pressable testID="add-team-btn" style={styles.addBtn} onPress={() => router.push("/teams/create")}>
          <Ionicons name="add" size={26} color={colors.onBrandPrimary} />
        </Pressable>
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color={colors.brandPrimary} />
        ) : teams.length === 0 ? (
          <View style={styles.empty}>
            <Ionicons name="people-outline" size={56} color={colors.muted} />
            <Text style={styles.emptyText}>No teams yet.{"\n"}Create your first team!</Text>
          </View>
        ) : (
          teams.map((t) => (
            <Pressable key={t.team_id} testID={`team-${t.team_id}`} style={styles.card} onPress={() => router.push(`/teams/${t.team_id}`)}>
              <View style={styles.avatar}><Text style={styles.avatarText}>{t.short_name}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.cardTitle}>{t.name}</Text>
                <Text style={styles.cardMeta}>{(t.players || []).length} players</Text>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.muted} />
            </Pressable>
          ))
        )}
        <View style={{ height: 24 }} />
      </ScrollView>
    </View>
  );
}
