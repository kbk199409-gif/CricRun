import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Image, Modal } from "react-native";
import { useCallback, useState, useEffect } from "react";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth, fileUrl } from "@/src/auth";

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
  actionsRow: { flexDirection: "row", padding: 16, gap: 10 },
  actionBtn: { flex: 1, backgroundColor: c.brandPrimary, paddingVertical: 12, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6 },
  actionBtnSec: { flex: 1, backgroundColor: c.surface, paddingVertical: 12, borderRadius: 12, alignItems: "center", flexDirection: "row", justifyContent: "center", gap: 6, borderWidth: 1, borderColor: c.border },
  actionText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 13 },
  actionTextSec: { color: c.onSurface, fontWeight: "700", fontSize: 13 },
  playerRow: { marginHorizontal: 16, marginBottom: 8, backgroundColor: c.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 },
  playerAvatar: { width: 40, height: 40, borderRadius: 999, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  playerAvatarImg: { width: 40, height: 40, borderRadius: 999 },
  playerAvatarText: { color: c.onBrandTertiary, fontWeight: "700" },
  playerName: { flex: 1, color: c.onSurface, fontWeight: "600", fontSize: 15 },
  playerTag: { fontSize: 11, color: c.muted, marginTop: 2 },
  linkedBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: c.brandTertiary, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: "flex-start", marginTop: 4 },
  linkedText: { fontSize: 10, color: c.onBrandTertiary, fontWeight: "700" },
  removeBtn: { padding: 8 },
  sectionHead: { fontSize: 12, fontWeight: "700", color: c.muted, letterSpacing: 1, marginHorizontal: 16, marginTop: 8, marginBottom: 8, textTransform: "uppercase" },
  empty: { alignItems: "center", padding: 30 },
  emptyText: { color: c.muted, marginTop: 8, fontSize: 14 },

  // Modal
  modalRoot: { flex: 1, backgroundColor: c.surface },
  modalHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  modalTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: c.onSurface },
  modalTabs: { flexDirection: "row", padding: 16, gap: 8 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border },
  tabBtnActive: { backgroundColor: c.brandTertiary, borderColor: c.brandPrimary },
  tabText: { color: c.onSurface, fontWeight: "700", fontSize: 13 },
  tabTextActive: { color: c.onBrandTertiary },
  searchInput: { marginHorizontal: 16, marginBottom: 8, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.onSurface },
  resultRow: { marginHorizontal: 16, marginBottom: 8, backgroundColor: c.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 },
  addBtn: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 14, alignItems: "center", margin: 16 },
  addBtnText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 15 },
  helperText: { color: c.muted, fontSize: 13, marginHorizontal: 16, marginTop: 4 },
}));

export default function TeamDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { apiFetch, token, user: currentUser } = useAuth();
  const [team, setTeam] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [mode, setMode] = useState<"search" | "guest">("search");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/teams/${id}`);
      if (r.ok) { const d = await r.json(); setTeam(d.team); }
    } catch {}
  }, [apiFetch, id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (mode !== "search") return;
    if (q.trim().length < 2) { setResults([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await apiFetch(`/api/users/search?q=${encodeURIComponent(q.trim())}`);
        if (r.ok && !cancelled) {
          const d = await r.json();
          setResults(d.users || []);
        }
      } catch {}
      if (!cancelled) setSearching(false);
    }, 300);
    return () => { cancelled = true; clearTimeout(t); };
  }, [q, mode, apiFetch]);

  const takenUserIds = new Set<string>((team?.players || []).map((p: any) => p.user_id).filter(Boolean));

  const addRegistered = async (uid: string) => {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/teams/${id}/players`, { method: "POST", body: JSON.stringify({ user_id: uid }) });
      if (r.ok) {
        setShowAdd(false); setQ(""); setResults([]);
        await load();
      }
    } catch {}
    setBusy(false);
  };

  const addGuest = async () => {
    if (!guestName.trim()) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/api/teams/${id}/players`, { method: "POST", body: JSON.stringify({ name: guestName.trim() }) });
      if (r.ok) { setGuestName(""); setShowAdd(false); await load(); }
    } catch {}
    setBusy(false);
  };

  const removePlayer = async (player_id: string) => {
    setBusy(true);
    try { await apiFetch(`/api/teams/${id}/players/${player_id}`, { method: "DELETE" }); await load(); } catch {}
    setBusy(false);
  };

  const isOwner = team && currentUser && team.owner_id === currentUser.user_id;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="team-detail-screen">
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

        {isOwner && (
          <View style={styles.actionsRow}>
            <Pressable testID="open-add-player-btn" style={styles.actionBtn} onPress={() => { setShowAdd(true); setMode("search"); }}>
              <Ionicons name="person-add" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.actionText}>Add Player</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.sectionHead}>Squad</Text>
        {(team?.players || []).length === 0 ? (
          <View style={styles.empty}><Ionicons name="person-add-outline" size={40} color={colors.muted} /><Text style={styles.emptyText}>No players yet — add real teammates or guest players</Text></View>
        ) : (
          (team.players).map((p: any, i: number) => {
            const pic = p.profile_picture_path ? fileUrl(p.profile_picture_path, token) : p.picture;
            return (
              <View key={p.player_id} style={styles.playerRow} testID={`player-${p.player_id}`}>
                <View style={styles.playerAvatar}>
                  {pic ? <Image source={{ uri: pic, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.playerAvatarImg} /> : (
                    <Text style={styles.playerAvatarText}>{i + 1}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.playerName}>{p.name}</Text>
                  {p.user_id ? (
                    <View style={styles.linkedBadge}>
                      <Ionicons name="checkmark-circle" size={12} color={colors.onBrandTertiary} />
                      <Text style={styles.linkedText}>REGISTERED</Text>
                    </View>
                  ) : (
                    <Text style={styles.playerTag}>Guest</Text>
                  )}
                </View>
                {isOwner && (
                  <Pressable testID={`remove-${p.player_id}`} style={styles.removeBtn} onPress={() => removePlayer(p.player_id)}>
                    <Ionicons name="close-circle" size={22} color={colors.error} />
                  </Pressable>
                )}
              </View>
            );
          })
        )}
        <View style={{ height: 24 + insets.bottom }} />
      </ScrollView>

      <Modal visible={showAdd} animationType="slide" onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View style={[styles.modalRoot, { paddingTop: insets.top }]} testID="add-player-modal">
            <View style={styles.modalHead}>
              <Pressable style={styles.hbtn} onPress={() => setShowAdd(false)}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
              <Text style={styles.modalTitle}>Add Player</Text>
              <View style={{ width: 32 }} />
            </View>
            <View style={styles.modalTabs}>
              <Pressable testID="mode-search" style={[styles.tabBtn, mode === "search" && styles.tabBtnActive]} onPress={() => setMode("search")}>
                <Text style={[styles.tabText, mode === "search" && styles.tabTextActive]}>Registered User</Text>
              </Pressable>
              <Pressable testID="mode-guest" style={[styles.tabBtn, mode === "guest" && styles.tabBtnActive]} onPress={() => setMode("guest")}>
                <Text style={[styles.tabText, mode === "guest" && styles.tabTextActive]}>Guest</Text>
              </Pressable>
            </View>
            {mode === "search" ? (
              <>
                <TextInput
                  testID="user-search-input"
                  style={styles.searchInput}
                  placeholder="Search by name, phone, or email"
                  placeholderTextColor={colors.muted}
                  value={q}
                  onChangeText={setQ}
                  autoCapitalize="none"
                />
                {q.trim().length < 2 && <Text style={styles.helperText}>Type at least 2 characters to search</Text>}
                <ScrollView keyboardShouldPersistTaps="handled">
                  {searching ? <ActivityIndicator style={{ marginTop: 20 }} color={colors.brandPrimary} /> :
                    results.length === 0 && q.trim().length >= 2 ? <Text style={styles.helperText}>No matching users</Text> :
                    results.map((u) => {
                      const already = takenUserIds.has(u.user_id);
                      const pic = u.profile_picture_path ? fileUrl(u.profile_picture_path, token) : u.picture;
                      return (
                        <Pressable
                          key={u.user_id}
                          testID={`search-user-${u.user_id}`}
                          style={[styles.resultRow, already && { opacity: 0.5 }]}
                          onPress={() => !already && !busy && addRegistered(u.user_id)}
                          disabled={already || busy}
                        >
                          <View style={styles.playerAvatar}>
                            {pic ? <Image source={{ uri: pic, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.playerAvatarImg} /> :
                              <Ionicons name="person" size={20} color={colors.muted} />}
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.playerName}>{u.name}</Text>
                            <Text style={styles.playerTag}>{u.phone || u.email || ""}</Text>
                          </View>
                          {already ? <Text style={{ color: colors.muted, fontSize: 12 }}>Added</Text> :
                            <Ionicons name="add-circle" size={22} color={colors.brandPrimary} />}
                        </Pressable>
                      );
                    })
                  }
                </ScrollView>
              </>
            ) : (
              <>
                <Text style={styles.helperText}>Add a guest player who isn't on CricTrack yet. Their stats won't roll up to a user profile.</Text>
                <TextInput
                  testID="guest-name-input"
                  style={[styles.searchInput, { marginTop: 12 }]}
                  placeholder="Guest player name"
                  placeholderTextColor={colors.muted}
                  value={guestName}
                  onChangeText={setGuestName}
                />
                <Pressable testID="add-guest-btn" style={styles.addBtn} onPress={addGuest} disabled={busy || !guestName.trim()}>
                  {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.addBtnText}>Add Guest Player</Text>}
                </Pressable>
              </>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}
