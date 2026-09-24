import { View, Text, ActivityIndicator, Pressable, Image } from "react-native";
import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary, alignItems: "center", justifyContent: "center", padding: 24 },
  card: { backgroundColor: c.surface, borderRadius: 16, padding: 24, borderWidth: 1, borderColor: c.border, width: "100%", maxWidth: 420, alignItems: "center" },
  crest: { width: 88, height: 88, borderRadius: 24, backgroundColor: c.brandPrimary, alignItems: "center", justifyContent: "center", marginBottom: 12 },
  crestText: { color: "#FFFFFF", fontSize: 26, fontWeight: "800" },
  title: { color: c.onSurface, fontSize: 20, fontWeight: "800", textAlign: "center" },
  sub: { color: c.muted, fontSize: 14, textAlign: "center", marginTop: 6 },
  avatarSm: { width: 34, height: 34, borderRadius: 999, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarSmImg: { width: 34, height: 34, borderRadius: 999 },
  avatarSmTxt: { color: c.onBrandTertiary, fontWeight: "700" },
  inviter: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 16, padding: 10, backgroundColor: c.surfaceSecondary, borderRadius: 10, borderWidth: 1, borderColor: c.border, alignSelf: "stretch" },
  inviterText: { color: c.onSurface, fontSize: 13 },
  btn: { marginTop: 16, backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 14, alignSelf: "stretch", alignItems: "center" },
  btnText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 15 },
  btnAlt: { marginTop: 8, borderColor: c.border, borderWidth: 1, borderRadius: 12, paddingVertical: 12, alignSelf: "stretch", alignItems: "center" },
  btnAltText: { color: c.onSurface, fontWeight: "700", fontSize: 14 },
  statusBad: { color: c.error, fontWeight: "700", marginTop: 12 },
  statusOK: { color: c.success, fontWeight: "700", marginTop: 12 },
  chip: { backgroundColor: c.brandTertiary, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginTop: 8 },
  chipText: { color: c.onBrandTertiary, fontWeight: "800", fontSize: 12 },
}));

export default function InviteLanding() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { token } = useLocalSearchParams<{ token: string }>();
  const { user, apiFetch } = useAuth();
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/public/invites/${token}`);
      if (r.ok) setData(await r.json()); else setError((await r.json().catch(() => ({}))).detail || "Invite not found");
    } catch { setError("Could not load invite"); }
  }, [token]);
  useEffect(() => { load(); }, [load]);

  const accept = useCallback(async () => {
    setBusy(true);
    try {
      const r = await apiFetch(`/api/invites/${token}/accept`, { method: "POST" });
      const j = await r.json().catch(() => ({}));
      if (r.ok) {
        setAccepted(true);
        setTimeout(() => router.replace(`/teams/${j.team_id}`), 900);
      } else {
        setError(j.detail || "Could not accept invite");
      }
    } catch {}
    setBusy(false);
  }, [apiFetch, router, token]);

  const gotoLogin = useCallback(() => {
    // Deep-link the invite so login flow returns here
    const next = `/invite/${token}`;
    router.replace(`/?next=${encodeURIComponent(next)}` as any);
  }, [router, token]);

  if (!data && !error) {
    return <View style={[styles.root, { paddingTop: insets.top }]}><ActivityIndicator color={colors.brandPrimary} /></View>;
  }
  if (error) {
    return (
      <View style={[styles.root, { paddingTop: insets.top }]}>
        <View style={styles.card}>
          <View style={styles.crest}><Ionicons name="alert-circle" size={40} color="#FFFFFF" /></View>
          <Text style={styles.title}>Invite unavailable</Text>
          <Text style={styles.sub}>{error}</Text>
        </View>
      </View>
    );
  }

  const inv = data.invite;
  const team = data.team;
  const inviter = data.invited_by || {};
  const inviterPic = inviter.profile_picture_path ? `${API}/api/public/files/${inviter.profile_picture_path}` : inviter.picture;
  const badStatus = inv.status !== "pending";

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.card}>
        <View style={styles.crest}><Text style={styles.crestText}>{team?.short_name || "🏏"}</Text></View>
        <Text style={styles.title}>{team?.name}</Text>
        <Text style={styles.sub}>You've been invited to join as</Text>
        <View style={styles.chip}><Text style={styles.chipText}>{inv.name.toUpperCase()}</Text></View>

        {inviter && (
          <View style={styles.inviter}>
            <View style={styles.avatarSm}>{inviterPic ? <Image source={{ uri: inviterPic }} style={styles.avatarSmImg} /> : <Text style={styles.avatarSmTxt}>{inviter.name?.[0] || "?"}</Text>}</View>
            <Text style={styles.inviterText}>Invited by <Text style={{ fontWeight: "700" }}>{inviter.name || "the captain"}</Text></Text>
          </View>
        )}

        {accepted && <Text style={styles.statusOK}>🎉 Joined! Redirecting…</Text>}
        {badStatus && <Text style={styles.statusBad}>{inv.status === "accepted" ? "This invite has already been used." : inv.status === "expired" ? "This invite has expired." : ""}</Text>}

        {!badStatus && !accepted && (
          user ? (
            <Pressable style={styles.btn} onPress={accept} disabled={busy} testID="accept-invite-btn">
              {busy ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.btnText}>Accept & Join Team</Text>}
            </Pressable>
          ) : (
            <>
              <Pressable style={styles.btn} onPress={gotoLogin} testID="invite-login-btn">
                <Text style={styles.btnText}>Sign up / Log in to join</Text>
              </Pressable>
              <Text style={[styles.sub, { marginTop: 10, fontSize: 12 }]}>Your new profile will be linked to this team automatically.</Text>
            </>
          )
        )}

        <Pressable style={styles.btnAlt} onPress={() => router.replace("/")}>
          <Text style={styles.btnAltText}>Cancel</Text>
        </Pressable>
      </View>
    </View>
  );
}
