import { View, Text, Pressable, ScrollView, ActivityIndicator, Image } from "react-native";
import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth, fileUrl } from "@/src/auth";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border, backgroundColor: c.surface },
  hbtn: { padding: 6 },
  htitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: c.onSurface },
  progressWrap: { flexDirection: "row", paddingHorizontal: 16, paddingVertical: 12, gap: 8, backgroundColor: c.surface, borderBottomWidth: 1, borderBottomColor: c.border },
  progressStep: { flex: 1, height: 4, borderRadius: 2, backgroundColor: c.border },
  progressStepActive: { backgroundColor: c.brandPrimary },
  banner: { padding: 20, backgroundColor: c.brandPrimary },
  bannerTitle: { color: c.onBrandPrimary, fontSize: 20, fontWeight: "800" },
  bannerSub: { color: "#DBEAFE", fontSize: 13, marginTop: 4 },
  stepTitle: { fontSize: 20, fontWeight: "800", color: c.onSurface, marginHorizontal: 16, marginTop: 16 },
  stepSub: { color: c.muted, marginHorizontal: 16, marginTop: 4, marginBottom: 12 },
  playerRow: { marginHorizontal: 16, marginBottom: 8, backgroundColor: c.surface, borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 999, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: 42, height: 42, borderRadius: 999 },
  avatarText: { color: c.onBrandTertiary, fontWeight: "700" },
  name: { flex: 1, color: c.onSurface, fontWeight: "600", fontSize: 15 },
  err: { color: c.error, textAlign: "center", marginHorizontal: 16, marginTop: 8 },
  bottomBar: { flexDirection: "row", padding: 16, gap: 10, borderTopWidth: 1, borderTopColor: c.border, backgroundColor: c.surface },
  backBtn: { paddingVertical: 14, paddingHorizontal: 20, borderRadius: 12, borderWidth: 1, borderColor: c.border, backgroundColor: c.surfaceTertiary },
  backBtnText: { color: c.onSurface, fontWeight: "700" },
  nextBtn: { flex: 1, backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  nextBtnText: { color: c.onBrandPrimary, fontWeight: "800", fontSize: 15 },
  disabled: { opacity: 0.5 },
}));

function PlayerRow({ player, active, disabled, onPress, token, testID }: any) {
  const styles = useStyles();
  const { colors } = useTheme();
  const pic = player.profile_picture_path ? fileUrl(player.profile_picture_path, token) : player.picture;
  return (
    <Pressable testID={testID} style={[styles.playerRow, active && { borderColor: colors.brandPrimary, backgroundColor: colors.brandTertiary }, disabled && styles.disabled]} onPress={onPress} disabled={disabled}>
      <View style={styles.avatar}>
        {pic ? <Image source={{ uri: pic, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.avatarImg} /> :
          <Text style={styles.avatarText}>{player.name?.[0]}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.name}>{player.name}</Text>
        {player.user_id ? <Text style={{ color: colors.muted, fontSize: 11 }}>Registered</Text> : <Text style={{ color: colors.muted, fontSize: 11 }}>Guest</Text>}
      </View>
      {active && <Ionicons name="checkmark-circle" size={22} color={colors.brandPrimary} />}
    </Pressable>
  );
}

export default function MatchSetup() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, side } = useLocalSearchParams<{ id: string; side?: string }>();
  const { apiFetch, token } = useAuth();
  const [match, setMatch] = useState<any>(null);
  const [batTeam, setBatTeam] = useState<any>(null);
  const [bowlTeam, setBowlTeam] = useState<any>(null);
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [striker, setStriker] = useState<string>("");
  const [nonStriker, setNonStriker] = useState<string>("");
  const [bowler, setBowler] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  const S = side === "b" ? "b" : "a";

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/matches/${id}`);
      if (r.ok) {
        const d = await r.json();
        const m = d.match;
        setMatch(m);
        const batId = S === "a" ? m.team_a_id : m.team_b_id;
        const bowlId = S === "a" ? m.team_b_id : m.team_a_id;
        const [rBat, rBowl] = await Promise.all([apiFetch(`/api/teams/${batId}`), apiFetch(`/api/teams/${bowlId}`)]);
        if (rBat.ok) setBatTeam((await rBat.json()).team);
        if (rBowl.ok) setBowlTeam((await rBowl.json()).team);
      }
    } catch {}
  }, [apiFetch, id, S]);
  useEffect(() => { load(); }, [load]);

  const start = async () => {
    if (!striker || !nonStriker || !bowler) return;
    setLoading(true); setErr("");
    try {
      const r = await apiFetch(`/api/matches/${id}/innings/${S}/start`, {
        method: "POST",
        body: JSON.stringify({ striker_id: striker, non_striker_id: nonStriker, bowler_id: bowler }),
      });
      if (r.ok) router.replace(`/matches/${id}`);
      else { const j = await r.json().catch(() => ({})); setErr(j.detail || "Failed to start innings"); }
    } catch { setErr("Network error"); }
    setLoading(false);
  };

  if (!match || !batTeam || !bowlTeam) {
    return <View style={[styles.root, { alignItems: "center", justifyContent: "center" }]}><ActivityIndicator color={colors.brandPrimary} /></View>;
  }

  const batPlayers: any[] = batTeam.players || [];
  const bowlPlayers: any[] = bowlTeam.players || [];

  const stepTitles = ["Select Striker", "Select Non-Striker", "Select Opening Bowler"];
  const stepSubs = ["The batsman facing the first ball", `From ${batTeam.name}`, `From ${bowlTeam.name}`];

  const canNext = step === 0 ? !!striker : step === 1 ? !!nonStriker && nonStriker !== striker : !!bowler;

  const onNext = () => {
    setErr("");
    if (step < 2) setStep((step + 1) as 0 | 1 | 2);
    else start();
  };
  const onBack = () => {
    setErr("");
    if (step > 0) setStep((step - 1) as 0 | 1 | 2);
    else router.back();
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="match-setup-screen">
      <View style={styles.headerRow}>
        <Pressable style={styles.hbtn} onPress={onBack}><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
        <Text style={styles.htitle}>Openers ({step + 1}/3)</Text>
        <View style={{ width: 32 }} />
      </View>
      <View style={styles.progressWrap}>
        <View style={[styles.progressStep, step >= 0 && styles.progressStepActive]} />
        <View style={[styles.progressStep, step >= 1 && styles.progressStepActive]} />
        <View style={[styles.progressStep, step >= 2 && styles.progressStepActive]} />
      </View>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>{batTeam.name} batting</Text>
          <Text style={styles.bannerSub}>vs {bowlTeam.name} • {match.overs} overs</Text>
          {(() => {
            const capBat = batTeam.captain_id ? batPlayers.find((p: any) => p.player_id === batTeam.captain_id) : null;
            const capBowl = bowlTeam.captain_id ? bowlPlayers.find((p: any) => p.player_id === bowlTeam.captain_id) : null;
            if (!capBat && !capBowl) return null;
            return (
              <Text style={[styles.bannerSub, { marginTop: 8 }]} testID="captain-line">
                {capBat ? `© ${capBat.name} (${batTeam.short_name})` : ""}
                {capBat && capBowl ? " · " : ""}
                {capBowl ? `© ${capBowl.name} (${bowlTeam.short_name})` : ""}
              </Text>
            );
          })()}
        </View>
        <Text style={styles.stepTitle}>{stepTitles[step]}</Text>
        <Text style={styles.stepSub}>{stepSubs[step]}</Text>

        {step === 0 && batPlayers.map((p) => (
          <PlayerRow key={p.player_id} testID={`striker-${p.player_id}`} player={p} token={token} active={striker === p.player_id} onPress={() => setStriker(p.player_id)} />
        ))}
        {step === 1 && batPlayers.map((p) => (
          <PlayerRow key={p.player_id} testID={`nonstriker-${p.player_id}`} player={p} token={token} disabled={p.player_id === striker} active={nonStriker === p.player_id} onPress={() => p.player_id !== striker && setNonStriker(p.player_id)} />
        ))}
        {step === 2 && bowlPlayers.map((p) => (
          <PlayerRow key={p.player_id} testID={`bowler-${p.player_id}`} player={p} token={token} active={bowler === p.player_id} onPress={() => setBowler(p.player_id)} />
        ))}
        {err ? <Text testID="setup-error" style={styles.err}>{err}</Text> : null}
        <View style={{ height: 32 + insets.bottom }} />
      </ScrollView>
      <View style={styles.bottomBar}>
        <Pressable style={styles.backBtn} onPress={onBack}><Text style={styles.backBtnText}>Back</Text></Pressable>
        <Pressable
          testID={step === 2 ? "start-innings-btn" : "next-btn"}
          style={[styles.nextBtn, !canNext && styles.disabled]}
          onPress={onNext}
          disabled={!canNext || loading}
        >
          {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.nextBtnText}>{step === 2 ? "Start Innings" : "Next"}</Text>}
        </Pressable>
      </View>
    </View>
  );
}
