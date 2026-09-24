import { View, Text, TextInput, Pressable, ActivityIndicator, ScrollView, KeyboardAvoidingView, Platform, Image, Modal, Share, Alert } from "react-native";
import { useCallback, useState, useEffect, useMemo } from "react";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth, fileUrl } from "@/src/auth";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

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
  captainPill: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: "#FFFFFF22", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 8 },
  captainPillText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
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
  captBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: c.warning, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, alignSelf: "flex-start", marginTop: 4 },
  captBadgeText: { fontSize: 10, color: c.onWarning, fontWeight: "800" },
  removeBtn: { padding: 8 },
  sectionHead: { fontSize: 12, fontWeight: "700", color: c.muted, letterSpacing: 1, marginHorizontal: 16, marginTop: 16, marginBottom: 8, textTransform: "uppercase" },
  empty: { alignItems: "center", padding: 30 },
  emptyText: { color: c.muted, marginTop: 8, fontSize: 14 },
  matchCard: { marginHorizontal: 16, marginBottom: 8, backgroundColor: c.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: c.border },
  matchTop: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
  matchTeams: { color: c.onSurface, fontWeight: "700", fontSize: 14 },
  matchStatusLive: { backgroundColor: c.error, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  matchStatusUp: { backgroundColor: c.surfaceTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  matchStatusDone: { backgroundColor: c.brandTertiary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999 },
  matchStatusText: { color: "#FFFFFF", fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  matchStatusTextDim: { color: c.onSurface, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  matchResult: { color: c.muted, fontSize: 12, marginTop: 2 },
  invitePending: { marginHorizontal: 16, marginBottom: 8, backgroundColor: c.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 },
  inviteExpired: { opacity: 0.6 },
  inviteName: { flex: 1, color: c.onSurface, fontWeight: "600", fontSize: 14 },
  inviteMeta: { color: c.muted, fontSize: 11, marginTop: 2 },
  inviteShareBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: c.brandTertiary, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  inviteShareTxt: { color: c.onBrandTertiary, fontWeight: "800", fontSize: 12 },

  // Modal
  modalRoot: { flex: 1, backgroundColor: c.surface },
  modalHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  modalTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: c.onSurface },
  modalTabs: { flexDirection: "row", padding: 16, gap: 8 },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: "center", backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border },
  tabBtnActive: { backgroundColor: c.brandTertiary, borderColor: c.brandPrimary },
  tabText: { color: c.onSurface, fontWeight: "700", fontSize: 12 },
  tabTextActive: { color: c.onBrandTertiary },
  searchInput: { marginHorizontal: 16, marginBottom: 8, backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: c.onSurface },
  resultRow: { marginHorizontal: 16, marginBottom: 8, backgroundColor: c.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 },
  addBtn: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 14, alignItems: "center", margin: 16 },
  addBtnText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 15 },
  helperText: { color: c.muted, fontSize: 13, marginHorizontal: 16, marginTop: 4 },

  // Captain picker modal
  pickerOption: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14, borderBottomWidth: 1, borderBottomColor: c.divider },
  pickerCheck: { marginLeft: "auto" },
}));

function fmtDate(d?: string) {
  if (!d) return "";
  try {
    const dt = new Date(d);
    return `${String(dt.getDate()).padStart(2, "0")}/${String(dt.getMonth() + 1).padStart(2, "0")}/${dt.getFullYear()}`;
  } catch { return ""; }
}

export default function TeamDetail() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, public: publicFlag } = useLocalSearchParams<{ id: string; public?: string }>();
  const { apiFetch, token, user: currentUser } = useAuth();
  const isPublic = publicFlag === "1" || !token;

  const [team, setTeam] = useState<any>(null);
  const [matches, setMatches] = useState<{ live: any[]; upcoming: any[]; previous: any[] }>({ live: [], upcoming: [], previous: [] });
  const [invites, setInvites] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [showCaptain, setShowCaptain] = useState(false);
  const [mode, setMode] = useState<"search" | "guest" | "invite">("search");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [inviteName, setInviteName] = useState("");
  const [invitePhone, setInvitePhone] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      if (isPublic) {
        const r = await fetch(`${API}/api/public/teams/${id}`);
        if (r.ok) {
          const d = await r.json();
          setTeam(d.team);
          setMatches(d.matches || { live: [], upcoming: [], previous: [] });
        }
      } else {
        const r = await apiFetch(`/api/teams/${id}`);
        if (r.ok) { const d = await r.json(); setTeam(d.team); }
        // Also fetch matches (public endpoint gives structured buckets)
        const rm = await fetch(`${API}/api/public/teams/${id}`);
        if (rm.ok) { const d = await rm.json(); setMatches(d.matches || { live: [], upcoming: [], previous: [] }); }
        // Fetch invites (owner only)
        const ri = await apiFetch(`/api/teams/${id}/invites`);
        if (ri.ok) { const d = await ri.json(); setInvites(d.invites || []); }
      }
    } catch {}
  }, [apiFetch, id, isPublic]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  useEffect(() => {
    if (isPublic || mode !== "search") return;
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
  }, [q, mode, apiFetch, isPublic]);

  const takenUserIds = useMemo(() => new Set<string>((team?.players || []).map((p: any) => p.user_id).filter(Boolean)), [team]);
  const isOwner = !isPublic && team && currentUser && team.owner_id === currentUser.user_id;
  const captainPlayer = useMemo(() => (team?.players || []).find((p: any) => p.player_id === team?.captain_id) || null, [team]);

  const addRegistered = async (uid: string) => {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/teams/${id}/players`, { method: "POST", body: JSON.stringify({ user_id: uid }) });
      if (r.ok) { setShowAdd(false); setQ(""); setResults([]); await load(); }
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

  const createInvite = async () => {
    if (!inviteName.trim()) return;
    setBusy(true);
    try {
      const r = await apiFetch(`/api/teams/${id}/invites`, { method: "POST", body: JSON.stringify({ name: inviteName.trim(), phone_hint: invitePhone.trim() || undefined }) });
      if (r.ok) {
        const d = await r.json();
        const inv = d.invite;
        const url = `${API}/invite/${inv.token}`;
        setInviteName(""); setInvitePhone("");
        setShowAdd(false);
        await load();
        try {
          await Share.share({ message: `You're invited to join ${team?.name} on CricTrack! Tap: ${url}`, url });
        } catch {}
      } else {
        const j = await r.json().catch(() => ({}));
        Alert.alert("Could not create invite", j.detail || "Please try again.");
      }
    } catch {}
    setBusy(false);
  };

  const shareInvite = async (inv: any) => {
    const url = `${API}/invite/${inv.token}`;
    try {
      await Share.share({ message: `Join ${team?.name} on CricTrack: ${url}`, url });
    } catch {
      await Clipboard.setStringAsync(url);
      Alert.alert("Copied", "Invite link copied to clipboard.");
    }
  };

  const removePlayer = async (player_id: string) => {
    setBusy(true);
    try { await apiFetch(`/api/teams/${id}/players/${player_id}`, { method: "DELETE" }); await load(); } catch {}
    setBusy(false);
  };

  const setCaptain = async (player_id: string | null) => {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/teams/${id}/captain`, { method: "PUT", body: JSON.stringify({ captain_id: player_id }) });
      if (r.ok) { setShowCaptain(false); await load(); }
    } catch {}
    setBusy(false);
  };

  const openMatchLive = (m: any) => {
    if (isPublic) router.push(`/share/${m.share_token}`);
    else if (m.status === "completed" || currentUser?.user_id === m.owner_id) router.push(`/matches/${m.match_id}`);
    else router.push(`/share/${m.share_token}`);
  };

  const openScorecard = (m: any) => {
    // Scorecard only in the app; for public users we route to share (which has a scorecard tab)
    if (isPublic) router.push(`/share/${m.share_token}`);
    else router.push(`/matches/${m.match_id}/scorecard`);
  };

  const MatchRow = ({ m, bucket }: { m: any; bucket: "live" | "upcoming" | "previous" }) => (
    <Pressable style={styles.matchCard} onPress={() => openMatchLive(m)} testID={`team-match-${m.match_id}`}>
      <View style={styles.matchTop}>
        <Text style={styles.matchTeams}>{m.team_a_name} vs {m.team_b_name}</Text>
        <View style={bucket === "live" ? styles.matchStatusLive : bucket === "upcoming" ? styles.matchStatusUp : styles.matchStatusDone}>
          <Text style={bucket === "upcoming" ? styles.matchStatusTextDim : styles.matchStatusText}>{bucket === "live" ? "LIVE" : bucket === "upcoming" ? "UPCOMING" : "COMPLETED"}</Text>
        </View>
      </View>
      <Text style={styles.matchResult}>
        {bucket === "previous" && m.result_text ? `🏆 ${m.result_text}` :
         bucket === "live" ? `${m.overs} overs • Tap to watch live` :
         `${m.overs} overs${m.created_at ? " • " + fmtDate(m.created_at) : ""}`}
      </Text>
      {bucket === "previous" && (
        <Pressable onPress={() => openScorecard(m)} style={{ marginTop: 8, alignSelf: "flex-start" }}>
          <Text style={{ color: colors.brandPrimary, fontWeight: "700", fontSize: 12 }}>View Scorecard ›</Text>
        </Pressable>
      )}
    </Pressable>
  );

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
          {captainPlayer && (
            <View style={styles.captainPill} testID="team-captain-pill">
              <Ionicons name="star" size={12} color="#FBBF24" />
              <Text style={styles.captainPillText}>Captain: {captainPlayer.name}</Text>
            </View>
          )}
        </View>

        {isOwner && (
          <View style={styles.actionsRow}>
            <Pressable testID="open-add-player-btn" style={styles.actionBtn} onPress={() => { setShowAdd(true); setMode("search"); }}>
              <Ionicons name="person-add" size={18} color={colors.onBrandPrimary} />
              <Text style={styles.actionText}>Add Player</Text>
            </Pressable>
            <Pressable testID="open-captain-btn" style={styles.actionBtnSec} onPress={() => setShowCaptain(true)} disabled={(team?.players || []).length === 0}>
              <Ionicons name="star-outline" size={18} color={colors.onSurface} />
              <Text style={styles.actionTextSec}>{captainPlayer ? "Change Captain" : "Set Captain"}</Text>
            </Pressable>
          </View>
        )}

        <Text style={styles.sectionHead}>Squad</Text>
        {(team?.players || []).length === 0 ? (
          <View style={styles.empty}><Ionicons name="person-add-outline" size={40} color={colors.muted} /><Text style={styles.emptyText}>No players yet — add real teammates or guest players</Text></View>
        ) : (
          (team.players).map((p: any, i: number) => {
            const pic = isPublic
              ? (p.profile_picture_path ? `${API}/api/public/files/${p.profile_picture_path}` : p.picture)
              : (p.profile_picture_path ? fileUrl(p.profile_picture_path, token) : p.picture);
            const isCap = team?.captain_id === p.player_id;
            const canOpen = !!p.user_id;
            return (
              <Pressable key={p.player_id} style={styles.playerRow} testID={`player-${p.player_id}`} onPress={() => canOpen && router.push(`/player/${p.user_id}${isPublic ? "?public=1" : ""}`)} disabled={!canOpen}>
                <View style={styles.playerAvatar}>
                  {pic ? <Image source={{ uri: pic, headers: (!isPublic && token) ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.playerAvatarImg} /> : (
                    <Text style={styles.playerAvatarText}>{i + 1}</Text>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.playerName}>{p.name}</Text>
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    {isCap && (
                      <View style={styles.captBadge}>
                        <Ionicons name="star" size={10} color={colors.onWarning} />
                        <Text style={styles.captBadgeText}>CAPTAIN</Text>
                      </View>
                    )}
                    {p.user_id ? (
                      <View style={styles.linkedBadge}>
                        <Ionicons name="checkmark-circle" size={12} color={colors.onBrandTertiary} />
                        <Text style={styles.linkedText}>REGISTERED</Text>
                      </View>
                    ) : (
                      <Text style={styles.playerTag}>Guest</Text>
                    )}
                  </View>
                </View>
                {isOwner && (
                  <Pressable testID={`remove-${p.player_id}`} style={styles.removeBtn} onPress={() => removePlayer(p.player_id)}>
                    <Ionicons name="close-circle" size={22} color={colors.error} />
                  </Pressable>
                )}
              </Pressable>
            );
          })
        )}

        {isOwner && invites.filter(i => i.status === "pending").length > 0 && (
          <>
            <Text style={styles.sectionHead}>Pending Invites</Text>
            {invites.filter(i => i.status === "pending").map((inv) => (
              <View key={inv.invite_id} style={[styles.invitePending, inv.status === "expired" && styles.inviteExpired]}>
                <View style={styles.playerAvatar}>
                  <Ionicons name="mail-outline" size={20} color={colors.onBrandTertiary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.inviteName}>{inv.name}</Text>
                  <Text style={styles.inviteMeta}>Invite sent • expires {fmtDate(inv.expires_at)}</Text>
                </View>
                <Pressable style={styles.inviteShareBtn} onPress={() => shareInvite(inv)} testID={`share-invite-${inv.invite_id}`}>
                  <Ionicons name="share-social-outline" size={14} color={colors.onBrandTertiary} />
                  <Text style={styles.inviteShareTxt}>Share</Text>
                </Pressable>
              </View>
            ))}
          </>
        )}

        {/* MATCHES */}
        {matches.live.length > 0 && (<>
          <Text style={styles.sectionHead}>🔴 Live Matches</Text>
          {matches.live.map(m => <MatchRow key={m.match_id} m={m} bucket="live" />)}
        </>)}
        {matches.upcoming.length > 0 && (<>
          <Text style={styles.sectionHead}>Upcoming Matches</Text>
          {matches.upcoming.map(m => <MatchRow key={m.match_id} m={m} bucket="upcoming" />)}
        </>)}
        {matches.previous.length > 0 && (<>
          <Text style={styles.sectionHead}>Previous Matches</Text>
          {matches.previous.map(m => <MatchRow key={m.match_id} m={m} bucket="previous" />)}
        </>)}

        <View style={{ height: 24 + insets.bottom }} />
      </ScrollView>

      {/* CAPTAIN PICKER MODAL */}
      <Modal visible={showCaptain} animationType="slide" onRequestClose={() => setShowCaptain(false)} transparent={false}>
        <View style={[styles.modalRoot, { paddingTop: insets.top }]}>
          <View style={styles.modalHead}>
            <Pressable style={styles.hbtn} onPress={() => setShowCaptain(false)}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
            <Text style={styles.modalTitle}>Select Captain</Text>
            <View style={{ width: 32 }} />
          </View>
          <ScrollView>
            {(team?.players || []).map((p: any) => {
              const pic = p.profile_picture_path ? fileUrl(p.profile_picture_path, token) : p.picture;
              const active = team?.captain_id === p.player_id;
              return (
                <Pressable key={p.player_id} style={styles.pickerOption} onPress={() => setCaptain(p.player_id)} testID={`captain-pick-${p.player_id}`}>
                  <View style={styles.playerAvatar}>{pic ? <Image source={{ uri: pic, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.playerAvatarImg} /> : <Text style={styles.playerAvatarText}>{p.name?.[0]}</Text>}</View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.playerName}>{p.name}</Text>
                    {!p.user_id && <Text style={styles.playerTag}>Guest</Text>}
                  </View>
                  {active && <Ionicons style={styles.pickerCheck} name="checkmark-circle" size={22} color={colors.brandPrimary} />}
                </Pressable>
              );
            })}
            {team?.captain_id && (
              <Pressable style={[styles.pickerOption, { justifyContent: "center" }]} onPress={() => setCaptain(null)}>
                <Text style={{ color: colors.error, fontWeight: "700" }}>Clear Captain</Text>
              </Pressable>
            )}
          </ScrollView>
        </View>
      </Modal>

      {/* ADD PLAYER MODAL */}
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
                <Text style={[styles.tabText, mode === "search" && styles.tabTextActive]}>Registered</Text>
              </Pressable>
              <Pressable testID="mode-invite" style={[styles.tabBtn, mode === "invite" && styles.tabBtnActive]} onPress={() => setMode("invite")}>
                <Text style={[styles.tabText, mode === "invite" && styles.tabTextActive]}>Invite</Text>
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
                    results.length === 0 && q.trim().length >= 2 ? <Text style={styles.helperText}>No matching users — try Invite instead.</Text> :
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
            ) : mode === "invite" ? (
              <>
                <Text style={styles.helperText}>Send a link to someone not on CricTrack. When they sign up via the link, they'll be added to this team automatically.</Text>
                <TextInput testID="invite-name" style={[styles.searchInput, { marginTop: 12 }]} placeholder="Player's name *" placeholderTextColor={colors.muted} value={inviteName} onChangeText={setInviteName} />
                <TextInput testID="invite-phone" style={styles.searchInput} placeholder="Their phone (optional, helps them login)" placeholderTextColor={colors.muted} value={invitePhone} onChangeText={setInvitePhone} keyboardType="phone-pad" />
                <Text style={styles.helperText}>Invite expires in 7 days.</Text>
                <Pressable testID="create-invite-btn" style={styles.addBtn} onPress={createInvite} disabled={busy || !inviteName.trim()}>
                  {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.addBtnText}>Create Invite & Share</Text>}
                </Pressable>
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
