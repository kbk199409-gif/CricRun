import { View, Text, TextInput, Pressable, ScrollView, ActivityIndicator, Image } from "react-native";
import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth, fileUrl } from "@/src/auth";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  header: { padding: 16, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  title: { fontSize: 24, fontWeight: "800", color: c.onSurface, marginBottom: 12 },
  searchWrap: { flexDirection: "row", alignItems: "center", backgroundColor: c.surfaceTertiary, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 12 },
  searchInput: { flex: 1, paddingVertical: 12, marginLeft: 8, fontSize: 15, color: c.onSurface },
  sectionHead: { fontSize: 11, fontWeight: "700", color: c.muted, letterSpacing: 1, marginHorizontal: 16, marginTop: 20, marginBottom: 8, textTransform: "uppercase" },
  card: { marginHorizontal: 16, marginBottom: 8, backgroundColor: c.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 40, height: 40, borderRadius: 999, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: 40, height: 40, borderRadius: 999 },
  avatarText: { color: c.onBrandTertiary, fontWeight: "700" },
  logo: { width: 40, height: 40, borderRadius: 10, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center" },
  logoText: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 12 },
  name: { flex: 1, color: c.onSurface, fontWeight: "700", fontSize: 14 },
  meta: { color: c.muted, fontSize: 12, marginTop: 2 },
  empty: { padding: 40, alignItems: "center" },
  emptyText: { color: c.muted, marginTop: 8, textAlign: "center" },
}));

export default function SearchTab() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { apiFetch, token } = useAuth();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<{ users: any[]; matches: any[]; tournaments: any[] }>({ users: [], matches: [], tournaments: [] });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (q.trim().length < 2) { setResults({ users: [], matches: [], tournaments: [] }); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await apiFetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
        if (r.ok && !cancelled) setResults(await r.json());
      } catch {}
      if (!cancelled) setLoading(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, apiFetch]);

  const total = results.users.length + results.matches.length + results.tournaments.length;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="search-tab">
      <View style={styles.header}>
        <Text style={styles.title}>Search</Text>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            testID="search-input"
            style={styles.searchInput}
            placeholder="Search players, matches, tournaments..."
            placeholderTextColor={colors.muted}
            value={q}
            onChangeText={setQ}
            autoCapitalize="none"
          />
        </View>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled">
        {loading && <ActivityIndicator style={{ marginTop: 30 }} color={colors.brandPrimary} />}

        {q.trim().length >= 2 && total === 0 && !loading && (
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={44} color={colors.muted} />
            <Text style={styles.emptyText}>No results for "{q}"</Text>
          </View>
        )}

        {results.users.length > 0 && <Text style={styles.sectionHead}>Players</Text>}
        {results.users.map((u) => {
          const pic = u.profile_picture_path ? fileUrl(u.profile_picture_path, token) : u.picture;
          return (
            <Pressable key={u.user_id} testID={`sr-user-${u.user_id}`} style={styles.card} onPress={() => router.push(`/player/${u.user_id}`)}>
              <View style={styles.avatar}>{pic ? <Image source={{ uri: pic, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{u.name?.[0]}</Text>}</View>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{u.name}</Text>
                <Text style={styles.meta}>{u.phone || u.email || ""}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </Pressable>
          );
        })}

        {results.matches.length > 0 && <Text style={styles.sectionHead}>Matches</Text>}
        {results.matches.map((m) => (
          <Pressable key={m.match_id} testID={`sr-match-${m.match_id}`} style={styles.card} onPress={() => router.push(`/matches/${m.match_id}`)}>
            <View style={styles.logo}><Text style={styles.logoText}>{m.team_a_short}v{m.team_b_short}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{m.team_a_name} vs {m.team_b_name}</Text>
              <Text style={styles.meta}>{m.overs} overs • {m.status}{m.result_text ? ` • ${m.result_text}` : ""}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ))}

        {results.tournaments.length > 0 && <Text style={styles.sectionHead}>Tournaments</Text>}
        {results.tournaments.map((t) => (
          <Pressable key={t.tournament_id} testID={`sr-trn-${t.tournament_id}`} style={styles.card} onPress={() => router.push(`/tournaments/${t.tournament_id}`)}>
            <View style={styles.logo}><Ionicons name="trophy" size={20} color={colors.onBrandPrimary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{t.name}</Text>
              <Text style={styles.meta}>{t.overs} overs{t.location ? ` • ${t.location}` : ""}</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        ))}
        <View style={{ height: 32 + insets.bottom }} />
      </ScrollView>
    </View>
  );
}
