import { View, Text, Pressable, ScrollView, ActivityIndicator, Modal, Image, Platform, Alert } from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import * as Clipboard from "expo-clipboard";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth, fileUrl } from "@/src/auth";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingTop: 4, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: c.border },
  hbtn: { padding: 6 },
  hbtnIcon: { padding: 6, marginHorizontal: 2 },
  htitle: { flex: 1, textAlign: "center", fontSize: 15, fontWeight: "700", color: c.onSurface },
  scoreboard: { backgroundColor: c.surfaceInverse, padding: 16 },
  liveTag: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", backgroundColor: "#FFFFFF20", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginBottom: 6 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#EF4444", marginRight: 6 },
  liveText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  battingLbl: { color: "#94A3B8", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  battingTeam: { color: "#FFFFFF", fontSize: 20, fontWeight: "800", marginTop: 2 },
  bigScore: { color: "#FFFFFF", fontSize: 46, fontWeight: "800", letterSpacing: -1.5, marginTop: 4 },
  scoreMeta: { flexDirection: "row", gap: 20, marginTop: 4 },
  metaLbl: { color: "#94A3B8", fontSize: 10, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  metaVal: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  chase: { color: "#FBBF24", fontSize: 12, marginTop: 8, fontWeight: "700" },
  result: { color: "#4ADE80", fontSize: 14, marginTop: 8, fontWeight: "800" },
  toss: { color: "#94A3B8", fontSize: 11, marginTop: 6 },

  playersRow: { flexDirection: "row", backgroundColor: c.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: c.border },
  playerBox: { flex: 1, padding: 10, alignItems: "center", flexDirection: "row", gap: 8, justifyContent: "center" },
  playerBoxActive: { backgroundColor: c.brandTertiary },
  playerAvatar: { width: 28, height: 28, borderRadius: 999, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  playerAvatarImg: { width: 28, height: 28, borderRadius: 999 },
  playerAvatarText: { color: c.onBrandTertiary, fontWeight: "700", fontSize: 12 },
  playerBoxCol: { flex: 1 },
  playerLbl: { fontSize: 9, color: c.muted, fontWeight: "700", textTransform: "uppercase" },
  playerName: { fontSize: 12, color: c.onSurface, fontWeight: "700" },
  playerStat: { fontSize: 10, color: c.muted },

  needsBanner: { backgroundColor: c.warning, paddingVertical: 10, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  needsText: { color: c.onWarning, fontWeight: "700", flex: 1, fontSize: 13 },
  needsBtn: { backgroundColor: c.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  needsBtnText: { color: c.onWarning, fontWeight: "700", fontSize: 12 },

  extrasRow: { flexDirection: "row", padding: 10, gap: 6, backgroundColor: c.surfaceSecondary },
  extraChip: { flex: 1, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, alignItems: "center" },
  extraChipActive: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  extraText: { fontSize: 11, fontWeight: "700", color: c.onSurfaceTertiary },
  extraTextActive: { color: c.onBrandTertiary },

  runsGrid: { flexDirection: "row", flexWrap: "wrap", padding: 10, gap: 8, justifyContent: "space-between" },
  runBtn: { width: "30%", aspectRatio: 1.7, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border },
  runBtnPrimary: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  runText: { fontSize: 24, fontWeight: "800", color: c.onSurface },
  runTextInv: { color: "#FFFFFF" },
  runLbl: { fontSize: 10, color: c.muted, fontWeight: "700", marginTop: 2 },
  runLblInv: { color: "#FFFFFF" },
  actionBar: { flexDirection: "row", paddingHorizontal: 10, gap: 8 },
  wicketBtn: { flex: 1, backgroundColor: c.error, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  wicketText: { color: c.onError, fontWeight: "800", fontSize: 14 },
  undoBtn: { paddingHorizontal: 14, backgroundColor: c.surfaceTertiary, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 4 },
  swapBtn: { paddingHorizontal: 14, backgroundColor: c.surfaceTertiary, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },
  undoText: { color: c.onSurface, fontWeight: "700", fontSize: 12 },

  completedCard: { margin: 14, backgroundColor: c.brandTertiary, borderRadius: 14, padding: 20, alignItems: "center" },
  completedTitle: { fontSize: 22, fontWeight: "800", color: c.onBrandTertiary },
  completedSub: { fontSize: 14, color: c.onBrandTertiary, marginTop: 4, textAlign: "center" },
  primaryBtn: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginHorizontal: 14, marginTop: 8 },
  primaryBtnText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 15 },
  momCard: { flexDirection: "row", alignItems: "center", margin: 14, padding: 14, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border, gap: 12 },
  momAvatar: { width: 54, height: 54, borderRadius: 999, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  momAvatarImg: { width: 54, height: 54, borderRadius: 999 },
  momName: { color: c.onSurface, fontSize: 16, fontWeight: "800" },
  momLbl: { color: c.warning, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  momMeta: { color: c.muted, fontSize: 12, marginTop: 2 },

  modal: { flex: 1, backgroundColor: c.surface },
  modalHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  modalTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: c.onSurface },
  modalSub: { color: c.muted, textAlign: "center", padding: 10 },
  modalPlayer: { marginHorizontal: 16, marginBottom: 8, backgroundColor: c.surface, borderRadius: 12, padding: 12, borderWidth: 1.5, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 },
  modalPlayerActive: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  modalAvatar: { width: 36, height: 36, borderRadius: 999, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  modalAvatarImg: { width: 36, height: 36, borderRadius: 999 },
  modalAvatarText: { color: c.onBrandTertiary, fontWeight: "700" },
  modalName: { flex: 1, color: c.onSurface, fontWeight: "600", fontSize: 15 },
  modalBtn: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 14, alignItems: "center", margin: 16 },
  modalBtnText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 15 },
  disabled: { opacity: 0.5 },

  outTypeGrid: { flexDirection: "row", flexWrap: "wrap", padding: 12, gap: 10 },
  outTypeBtn: { width: "48%", padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface, alignItems: "center" },
  outTypeBtnActive: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  outTypeText: { color: c.onSurface, fontWeight: "700", fontSize: 14, marginTop: 6, textAlign: "center" },

  shareBox: { padding: 16 },
  shareText: { color: c.onSurface, fontSize: 14, marginBottom: 12 },
  shareLink: { padding: 12, backgroundColor: c.surfaceTertiary, borderRadius: 10, marginBottom: 12 },
  shareLinkText: { color: c.brandPrimary, fontWeight: "700" },

  scorecardCta: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: c.brandTertiary, borderTopWidth: 1, borderBottomWidth: 1, borderColor: c.border, paddingVertical: 12, paddingHorizontal: 16 },
  scorecardCtaText: { color: c.onBrandTertiary, fontWeight: "800", fontSize: 13, letterSpacing: 0.5 },

  // Best awards
  awardsRow: { flexDirection: "row", marginHorizontal: 14, marginTop: 8, gap: 10 },
  awardCol: { flex: 1, backgroundColor: c.surface, borderRadius: 14, padding: 12, borderWidth: 1, borderColor: c.border, alignItems: "center" },
  awardIcon: { width: 44, height: 44, borderRadius: 999, alignItems: "center", justifyContent: "center", marginBottom: 6 },
  awardTitle: { color: c.muted, fontSize: 10, fontWeight: "800", letterSpacing: 0.5 },
  awardName: { color: c.onSurface, fontSize: 13, fontWeight: "800", marginTop: 2 },
  awardMeta: { color: c.muted, fontSize: 11, textAlign: "center", marginTop: 2 },
  awardAvatar: { width: 44, height: 44, borderRadius: 999, alignItems: "center", justifyContent: "center", overflow: "hidden", backgroundColor: c.brandTertiary },
  awardAvatarImg: { width: 44, height: 44, borderRadius: 999 },

  // Player info card overlay
  infoOverlay: { position: "absolute", top: 0, bottom: 0, left: 0, right: 0, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "center", alignItems: "center", padding: 24, zIndex: 20 },
  infoCard: { backgroundColor: c.surface, borderRadius: 20, padding: 20, width: "100%", maxWidth: 380, alignItems: "center" },
  infoTag: { color: c.brandPrimary, fontSize: 11, fontWeight: "800", letterSpacing: 1 },
  infoAvatar: { width: 72, height: 72, borderRadius: 999, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center", overflow: "hidden", marginTop: 8 },
  infoAvatarImg: { width: 72, height: 72, borderRadius: 999 },
  infoAvatarText: { color: c.onBrandTertiary, fontWeight: "800", fontSize: 24 },
  infoName: { color: c.onSurface, fontSize: 20, fontWeight: "800", marginTop: 8 },
  infoStyle: { color: c.muted, fontSize: 13, marginTop: 2 },
  infoStatsRow: { flexDirection: "row", marginTop: 14, width: "100%", justifyContent: "space-around" },
  infoStatCol: { alignItems: "center" },
  infoStatLbl: { color: c.muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.5 },
  infoStatVal: { color: c.onSurface, fontSize: 18, fontWeight: "800", marginTop: 2 },
  infoDismiss: { color: c.muted, fontSize: 11, marginTop: 12 },

  // Who's out / strike segmented
  segRow: { flexDirection: "row", padding: 12, gap: 10 },
  segBtn: { flex: 1, borderRadius: 12, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surface, padding: 14, alignItems: "center", flexDirection: "row", gap: 10, justifyContent: "center" },
  segBtnActive: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  segText: { color: c.onSurface, fontWeight: "700", fontSize: 14 },
}));

const OUT_TYPES = [
  { key: "bowled", label: "Bowled", icon: "flash-outline" },
  { key: "catch_out", label: "Caught", icon: "hand-left-outline" },
  { key: "run_out", label: "Run Out", icon: "walk-outline" },
  { key: "lbw", label: "LBW", icon: "shield-outline" },
  { key: "stumped", label: "Stumped", icon: "shield-half-outline" },
  { key: "hit_wicket", label: "Hit Wicket", icon: "alert-circle-outline" },
  { key: "retired_hurt", label: "Retired Hurt", icon: "bandage-outline" },
];

const OUT_NEEDS_FIELDER: Record<string, boolean> = { catch_out: true, run_out: true, stumped: true };

function crossAlert(msg: string) {
  if (Platform.OS === "web") {
    // eslint-disable-next-line no-alert
    if (typeof window !== "undefined") window.alert(msg);
    return;
  }
  Alert.alert("", msg);
}

function crossConfirm(title: string, message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-alert
      resolve(typeof window !== "undefined" && window.confirm(`${title}\n\n${message}`));
      return;
    }
    Alert.alert(title, message, [
      { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
      { text: "Delete", style: "destructive", onPress: () => resolve(true) },
    ]);
  });
}

export default function LiveMatch() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { apiFetch, token } = useAuth();
  const [match, setMatch] = useState<any>(null);
  const [teamA, setTeamA] = useState<any>(null);
  const [teamB, setTeamB] = useState<any>(null);
  const [batTeam, setBatTeam] = useState<any>(null);
  const [bowlTeam, setBowlTeam] = useState<any>(null);
  const [extra, setExtra] = useState<"none" | "wide" | "no_ball" | "bye" | "leg_bye">("none");
  const [saving, setSaving] = useState(false);
  const [showNewBatsman, setShowNewBatsman] = useState(false);
  const [showNewBowler, setShowNewBowler] = useState(false);
  const [pickedBatsman, setPickedBatsman] = useState<string>("");
  const [pickedBowler, setPickedBowler] = useState<string>("");
  const [batsmanForNextBall, setBatsmanForNextBall] = useState<string>("");
  const [bowlerForNextBall, setBowlerForNextBall] = useState<string>("");
  // Wicket flow
  const [showWicketType, setShowWicketType] = useState(false);
  const [showFielder, setShowFielder] = useState(false);
  const [showWhoOut, setShowWhoOut] = useState(false);
  const [pendingWicket, setPendingWicket] = useState<{ out_type: string; runs: number; out_batsman_id?: string; fielder_id?: string; extraType?: "none" | "bye" | "leg_bye" } | null>(null);
  const [pickedFielder, setPickedFielder] = useState<string>("");
  // Strike-position picker (after run-out new batsman)
  const [showStrikePick, setShowStrikePick] = useState(false);
  const [newBatsmanOnStrike, setNewBatsmanOnStrike] = useState<boolean | null>(null);
  const [wasRunOut, setWasRunOut] = useState(false);
  // Run-out completed-runs picker (v6.1 – run-out enhancement)
  const [showRunOutRuns, setShowRunOutRuns] = useState(false);
  const [roRuns, setRoRuns] = useState<number>(0);
  const [roExtra, setRoExtra] = useState<"none" | "bye" | "leg_bye">("none");
  // Info card overlay (auto-show when new batsman/bowler enters)
  const [infoCard, setInfoCard] = useState<{ kind: "batsman" | "bowler"; player: any; stats: any | null } | null>(null);
  const [seenBatEntries, setSeenBatEntries] = useState<Record<string, boolean>>({});
  const [seenBowlSpells, setSeenBowlSpells] = useState<Record<string, number>>({});
  // MoM
  const [showMoM, setShowMoM] = useState(false);
  const [momTab, setMomTab] = useState<"a" | "b">("a");
  const [pickedMoM, setPickedMoM] = useState<string>("");
  // Share
  const [showShare, setShowShare] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/matches/${id}`);
      if (!r.ok) return;
      const d = await r.json();
      const m = d.match;
      setMatch(m);
      const cur = m.current_innings === "a" ? m.innings_a : m.innings_b;
      const [rA, rB] = await Promise.all([apiFetch(`/api/teams/${m.team_a_id}`), apiFetch(`/api/teams/${m.team_b_id}`)]);
      const tA = rA.ok ? (await rA.json()).team : null;
      const tB = rB.ok ? (await rB.json()).team : null;
      setTeamA(tA); setTeamB(tB);
      if (m.current_innings === "a") { setBatTeam(tA); setBowlTeam(tB); }
      else { setBatTeam(tB); setBowlTeam(tA); }
      // Auto-open pickers when required (only when innings is live & not completed)
      if (!cur.completed) {
        if (cur.needs_new_batsman && !batsmanForNextBall) setShowNewBatsman(true);
        if (cur.needs_new_bowler && !bowlerForNextBall) setShowNewBowler(true);
      }
    } catch {}
  }, [apiFetch, id, batsmanForNextBall, bowlerForNextBall, router]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const curInn = useMemo(() => (match ? (match.current_innings === "a" ? match.innings_a : match.innings_b) : null), [match]);

  // SAFETY: whenever the innings completes or the match completes, force-close every scoring modal
  // and reset transient pickers so the user is never stuck behind a phantom picker sheet.
  useEffect(() => {
    if (!match || !curInn) return;
    const done = match.status === "completed" || !!curInn.completed;
    if (done) {
      setShowNewBatsman(false);
      setShowNewBowler(false);
      setShowWicketType(false);
      setShowFielder(false);
      setPendingWicket(null);
      setPickedBatsman("");
      setPickedBowler("");
      setPickedFielder("");
      setBatsmanForNextBall("");
      setBowlerForNextBall("");
    }
  }, [match?.status, curInn?.completed]);

  const openPlayerProfile = useCallback((pid: string | null) => {
    if (!pid) return;
    const all = [...(batTeam?.players || []), ...(bowlTeam?.players || [])];
    const p = all.find((x) => x.player_id === pid);
    if (!p) return;
    if (!p.user_id) {
      Alert.alert("Guest Player", `${p.name} is a guest — no player profile yet.`);
      return;
    }
    router.push(`/player/${p.user_id}`);
  }, [batTeam, bowlTeam, router]);

  const playerName = useCallback((pid: string | null) => {
    if (!pid) return "-";
    const all = [...(batTeam?.players || []), ...(bowlTeam?.players || [])];
    return all.find((p) => p.player_id === pid)?.name || "-";
  }, [batTeam, bowlTeam]);
  const playerObj = useCallback((pid: string | null) => {
    if (!pid) return null;
    const all = [...(batTeam?.players || []), ...(bowlTeam?.players || [])];
    return all.find((p) => p.player_id === pid) || null;
  }, [batTeam, bowlTeam]);

  const sendBall = async (body: any) => {
    if (!match) return;
    setSaving(true);
    try {
      Haptics.selectionAsync().catch(() => {});
      const merged: any = { ...body };
      if (batsmanForNextBall) merged.new_batsman_id = batsmanForNextBall;
      if (bowlerForNextBall) merged.new_bowler_id = bowlerForNextBall;
      if (newBatsmanOnStrike !== null) merged.new_batsman_on_strike = newBatsmanOnStrike;
      const r = await apiFetch(`/api/matches/${id}/innings/${match.current_innings}/ball`, {
        method: "POST", body: JSON.stringify(merged),
      });
      if (r.ok) {
        setBatsmanForNextBall(""); setBowlerForNextBall(""); setExtra("none");
        setNewBatsmanOnStrike(null); setWasRunOut(false);
        await load();
      } else {
        const j = await r.json().catch(() => ({}));
        crossAlert(j.detail || "Failed to record ball");
      }
    } catch {}
    setSaving(false);
  };

  // Fetch mini stats for the player and show the info-card overlay
  const showPlayerCard = useCallback(async (player: any, kind: "batsman" | "bowler") => {
    setInfoCard({ kind, player, stats: null });
    if (player?.user_id) {
      try {
        const r = await apiFetch(`/api/players/${player.user_id}/mini`);
        if (r.ok) {
          const d = await r.json();
          setInfoCard((prev) => (prev && prev.player?.player_id === player.player_id ? { ...prev, stats: d } : prev));
        }
      } catch {}
    }
  }, [apiFetch]);

  const undo = async () => {
    if (!match) return;
    setSaving(true);
    try {
      const r = await apiFetch(`/api/matches/${id}/innings/${match.current_innings}/undo`, { method: "POST" });
      if (r.ok) {
        setBatsmanForNextBall(""); setBowlerForNextBall("");
        await load();
      } else {
        const j = await r.json().catch(() => ({}));
        crossAlert(j.detail || "Nothing to undo");
      }
    } catch {}
    setSaving(false);
  };

  const runsButton = (n: number) => {
    if (!curInn) return;
    if (curInn.needs_new_batsman && !batsmanForNextBall) { crossAlert("Select the new batsman first."); return; }
    if (curInn.needs_new_bowler && !bowlerForNextBall) { crossAlert("Select the next bowler first."); return; }
    sendBall({ runs: n, extra_type: extra, wicket: false });
  };

  const wicketButton = () => {
    if (!curInn) return;
    if (extra === "no_ball") { crossAlert("Wicket cannot be recorded on a no-ball"); return; }
    if (curInn.needs_new_bowler && !bowlerForNextBall) { crossAlert("Select the next bowler first."); return; }
    setPendingWicket({ out_type: "", runs: 0 });
    setShowWicketType(true);
  };

  const submitWicketWith = (out_type: string, opts?: { fielder_id?: string; out_batsman_id?: string }) => {
    // For run-outs we honour pendingWicket.runs & pendingWicket.extraType (set by the run-out details modal).
    // For any other dismissal we keep the legacy behaviour (0 runs, current `extra` state).
    const isRunOut = out_type === "run_out";
    const runs = isRunOut ? (pendingWicket?.runs ?? 0) : (pendingWicket?.runs ?? 0);
    const extraType = isRunOut ? (pendingWicket?.extraType || "none") : extra;
    const body: any = { runs, extra_type: extraType, wicket: true, out_type };
    if (opts?.fielder_id) body.fielder_id = opts.fielder_id;
    if (opts?.out_batsman_id) body.out_batsman_id = opts.out_batsman_id;
    else if (pendingWicket?.out_batsman_id) body.out_batsman_id = pendingWicket.out_batsman_id;
    if (isRunOut) setWasRunOut(true); else setWasRunOut(false);
    sendBall(body);
    setPendingWicket(null); setPickedFielder(""); setShowFielder(false); setShowWicketType(false); setShowWhoOut(false); setShowRunOutRuns(false);
    setRoRuns(0); setRoExtra("none");
  };

  const onPickOutType = (out_type: string) => {
    if (out_type === "run_out") {
      // Run-out: ask WHO GOT OUT first (striker or non-striker)
      setPendingWicket({ out_type: "run_out", runs: 0, extraType: "none" });
      setRoRuns(0); setRoExtra("none");
      setShowWicketType(false);
      setShowWhoOut(true);
      return;
    }
    if (OUT_NEEDS_FIELDER[out_type]) {
      setPendingWicket({ out_type, runs: 0 });
      setShowWicketType(false);
      setShowFielder(true);
    } else {
      submitWicketWith(out_type);
    }
  };

  const shareUrl = useMemo(() => {
    if (!match?.share_token) return "";
    if (Platform.OS === "web" && typeof window !== "undefined") {
      return `${window.location.origin}/share/${match.share_token}`;
    }
    const base = process.env.EXPO_PUBLIC_BACKEND_URL || "";
    return `${base}/share/${match.share_token}`;
  }, [match]);

  const copyShare = async () => {
    if (!shareUrl) return;
    try { await Clipboard.setStringAsync(shareUrl); crossAlert("Link copied!"); } catch {}
  };

  const submitMoM = async () => {
    if (!pickedMoM) return;
    const teamId = momTab === "a" ? match.team_a_id : match.team_b_id;
    setSaving(true);
    try {
      await apiFetch(`/api/matches/${id}/mom`, { method: "POST", body: JSON.stringify({ player_id: pickedMoM, team_id: teamId }) });
      setShowMoM(false);
      await load();
    } catch {}
    setSaving(false);
  };

  if (!match || !curInn) {
    return <View style={[styles.root, { alignItems: "center", justifyContent: "center", paddingTop: insets.top }]}><ActivityIndicator color={colors.brandPrimary} /></View>;
  }

  const maxBalls = match.overs * 6;
  const battingName = match.current_innings === "a" ? match.team_a_name : match.team_b_name;
  const isCompleted = match.status === "completed";
  const oversStr = `${Math.floor(curInn.balls / 6)}.${curInn.balls % 6}`;
  const runRate = curInn.balls > 0 ? ((curInn.runs / (curInn.balls / 6)) || 0).toFixed(2) : "0.00";
  const otherInn = match.current_innings === "a" ? match.innings_b : match.innings_a;
  const isInningsEnded = !isCompleted && curInn.completed;
  const needsNextInningsSetup = !isCompleted && !curInn.started && otherInn?.completed;

  let chaseInfo = "";
  let rrrLine = "";
  if (otherInn?.started && otherInn?.completed) {
    const target = otherInn.runs + 1;
    const need = target - curInn.runs;
    const ballsLeft = maxBalls - curInn.balls;
    if (need > 0 && ballsLeft > 0) {
      chaseInfo = `Need ${need} in ${ballsLeft} balls (target ${target})`;
      const rrr = ((need * 6) / ballsLeft).toFixed(2);
      rrrLine = `RRR: ${rrr}`;
    }
  }

  const bat = batTeam?.players || [];
  const availableBatsmen = bat.filter((p: any) =>
    !curInn.dismissed_ids?.includes(p.player_id) &&
    p.player_id !== curInn.striker_id && p.player_id !== curInn.non_striker_id
  );
  const availableBowlers = (bowlTeam?.players || []).filter((p: any) => p.player_id !== curInn.bowler_id);
  const fielders = bowlTeam?.players || [];

  const strikerObj = playerObj(curInn.striker_id);
  const nonStrikerObj = playerObj(curInn.non_striker_id);
  const bowlerObj = playerObj(curInn.bowler_id);
  const strikerStat = curInn.batters?.[curInn.striker_id];
  const nonStrikerStat = curInn.batters?.[curInn.non_striker_id];
  const bowlerStat = curInn.bowlers?.[curInn.bowler_id];

  const tossLine = match.toss_winner_team_id ? `${match.toss_winner_team_id === match.team_a_id ? match.team_a_short : match.team_b_short} won toss & chose to ${match.toss_decision}` : "";
  const momPlayer = match.man_of_the_match_id ? playerObj(match.man_of_the_match_id) : null;
  const momPic = momPlayer?.profile_picture_path ? fileUrl(momPlayer.profile_picture_path, token) : momPlayer?.picture;

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="live-match-screen">
      <View style={styles.headerRow}>
        <Pressable style={styles.hbtn} onPress={() => router.back()}><Ionicons name="chevron-back" size={22} color={colors.onSurface} /></Pressable>
        <Text style={styles.htitle}>{match.team_a_short} vs {match.team_b_short}</Text>
        <Pressable testID="scorecard-btn" style={styles.hbtnIcon} onPress={() => router.push(`/matches/${id}/scorecard`)}><Ionicons name="list-outline" size={22} color={colors.onSurface} /></Pressable>
        <Pressable testID="share-btn" style={styles.hbtnIcon} onPress={() => setShowShare(true)}><Ionicons name="share-social-outline" size={22} color={colors.onSurface} /></Pressable>
        <Pressable testID="delete-match-btn" style={styles.hbtnIcon} onPress={async () => {
          const ok = await crossConfirm("Delete Match?", "This match will be permanently removed for everyone. This cannot be undone.");
          if (!ok) return;
          const r = await apiFetch(`/api/matches/${id}`, { method: "DELETE" });
          if (r.ok) {
            router.replace("/(tabs)");
          } else {
            const j = await r.json().catch(() => ({}));
            Alert.alert("Delete failed", j.detail || "Could not delete this match. Only the match creator can delete it.");
          }
        }}><Ionicons name="trash-outline" size={20} color={colors.error} /></Pressable>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.scoreboard}>
          <View style={styles.liveTag}>
            {!isCompleted && <View style={styles.liveDot} />}
            <Text style={styles.liveText}>{isCompleted ? "COMPLETED" : "LIVE"}</Text>
          </View>
          <Text style={styles.battingLbl}>Batting</Text>
          <Text style={styles.battingTeam}>{battingName}</Text>
          <Text style={styles.bigScore}>{curInn.runs}<Text style={{ fontSize: 28 }}>/{curInn.wickets}</Text></Text>
          <View style={styles.scoreMeta}>
            <View>
              <Text style={styles.metaLbl}>Overs</Text>
              <Text style={styles.metaVal}>{oversStr}/{match.overs}</Text>
            </View>
            <View>
              <Text style={styles.metaLbl}>CRR</Text>
              <Text style={styles.metaVal}>{runRate}</Text>
            </View>
          </View>
          {chaseInfo ? <Text style={styles.chase}>{chaseInfo}{rrrLine ? ` • ${rrrLine}` : ""}</Text> : null}
          {tossLine ? <Text style={styles.toss}>{tossLine}</Text> : null}
          {isCompleted && match.result_text ? <Text style={styles.result} testID="result-text">🏆 {match.result_text}</Text> : null}
        </View>

        <Pressable testID="view-scorecard-cta" style={styles.scorecardCta} onPress={() => router.push(`/matches/${id}/scorecard`)}>
          <Ionicons name="reader-outline" size={18} color={colors.onBrandTertiary} />
          <Text style={styles.scorecardCtaText}>VIEW FULL SCORECARD</Text>
          <Ionicons name="chevron-forward" size={16} color={colors.onBrandTertiary} />
        </Pressable>

        {isInningsEnded && (
          <View style={[styles.completedCard, { backgroundColor: colors.warning }]} testID="innings-end-card">
            <Ionicons name="flag" size={36} color={colors.onWarning} />
            <Text style={[styles.completedTitle, { color: colors.onWarning }]}>Innings End</Text>
            <Text style={[styles.completedSub, { color: colors.onWarning }]}>
              {batTeam?.name} finished at {curInn.runs}/{curInn.wickets} ({oversStr} overs)
            </Text>
            <Pressable testID="start-next-innings-btn" style={[styles.primaryBtn, { marginTop: 12, backgroundColor: colors.brandPrimary }]} onPress={() => {
              // Flip current innings on server side already happened; just route to setup for the current innings that hasn't started
              router.replace(`/matches/${id}/setup?side=${match.current_innings === "a" ? "b" : "a"}`);
            }}>
              <Text style={styles.primaryBtnText}>Start Next Innings</Text>
            </Pressable>
          </View>
        )}

        {needsNextInningsSetup && !isInningsEnded && (
          <View style={[styles.completedCard, { backgroundColor: colors.warning }]} testID="innings-end-card">
            <Ionicons name="flag" size={36} color={colors.onWarning} />
            <Text style={[styles.completedTitle, { color: colors.onWarning }]}>INNINGS END</Text>
            <Text style={[styles.completedSub, { color: colors.onWarning }]}>
              {(match.current_innings === "a" ? match.team_b_name : match.team_a_name)} finished at {otherInn?.runs}/{otherInn?.wickets} ({Math.floor((otherInn?.balls || 0) / 6)}.{(otherInn?.balls || 0) % 6} ov)
            </Text>
            <Pressable testID="goto-setup-btn" style={[styles.primaryBtn, { marginTop: 12, backgroundColor: colors.brandPrimary }]} onPress={() => router.replace(`/matches/${id}/setup?side=${match.current_innings}`)}>
              <Text style={styles.primaryBtnText}>Start Next Innings</Text>
            </Pressable>
          </View>
        )}

        {!isCompleted && !isInningsEnded && strikerObj && (
          <View style={styles.playersRow}>
            <Pressable style={[styles.playerBox, styles.playerBoxActive]} onPress={() => openPlayerProfile(strikerObj.player_id)} testID="striker-tap">
              <View style={styles.playerAvatar}>
                {strikerObj.profile_picture_path || strikerObj.picture ? <Image source={{ uri: fileUrl(strikerObj.profile_picture_path, token) || strikerObj.picture, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.playerAvatarImg} /> : <Text style={styles.playerAvatarText}>{strikerObj.name?.[0]}</Text>}
              </View>
              <View style={styles.playerBoxCol}>
                <Text style={styles.playerLbl}>⚡ Striker</Text>
                <Text style={styles.playerName} testID="striker-name" numberOfLines={1}>{strikerObj.name}</Text>
                {strikerStat && <Text style={styles.playerStat}>{strikerStat.runs}({strikerStat.balls})</Text>}
              </View>
            </Pressable>
            <Pressable style={styles.playerBox} onPress={() => openPlayerProfile(nonStrikerObj?.player_id)} testID="nonstriker-tap">
              <View style={styles.playerAvatar}>
                {nonStrikerObj?.profile_picture_path || nonStrikerObj?.picture ? <Image source={{ uri: fileUrl(nonStrikerObj.profile_picture_path, token) || nonStrikerObj.picture, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.playerAvatarImg} /> : <Text style={styles.playerAvatarText}>{nonStrikerObj?.name?.[0] || "?"}</Text>}
              </View>
              <View style={styles.playerBoxCol}>
                <Text style={styles.playerLbl}>Non-Striker</Text>
                <Text style={styles.playerName} testID="nonstriker-name" numberOfLines={1}>{nonStrikerObj?.name || "-"}</Text>
                {nonStrikerStat && <Text style={styles.playerStat}>{nonStrikerStat.runs}({nonStrikerStat.balls})</Text>}
              </View>
            </Pressable>
            <Pressable style={styles.playerBox} onPress={() => openPlayerProfile(bowlerObj?.player_id)} testID="bowler-tap">
              <View style={styles.playerAvatar}>
                {bowlerObj?.profile_picture_path || bowlerObj?.picture ? <Image source={{ uri: fileUrl(bowlerObj.profile_picture_path, token) || bowlerObj.picture, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.playerAvatarImg} /> : <Text style={styles.playerAvatarText}>{bowlerObj?.name?.[0] || "?"}</Text>}
              </View>
              <View style={styles.playerBoxCol}>
                <Text style={styles.playerLbl}>Bowler</Text>
                <Text style={styles.playerName} testID="bowler-name" numberOfLines={1}>{bowlerObj?.name || "-"}</Text>
                {bowlerStat && <Text style={styles.playerStat}>{Math.floor(bowlerStat.balls / 6)}.{bowlerStat.balls % 6} - {bowlerStat.runs} - {bowlerStat.wickets}</Text>}
              </View>
            </Pressable>
          </View>
        )}

        {!isCompleted && curInn.needs_new_batsman && !batsmanForNextBall && (
          <View style={styles.needsBanner} testID="needs-batsman-banner">
            <Ionicons name="warning" size={18} color={colors.onWarning} />
            <Text style={styles.needsText}>Wicket! Select the new batsman.</Text>
            <Pressable style={styles.needsBtn} onPress={() => setShowNewBatsman(true)} testID="pick-batsman-btn"><Text style={styles.needsBtnText}>Pick</Text></Pressable>
          </View>
        )}
        {!isCompleted && curInn.needs_new_bowler && !bowlerForNextBall && (
          <View style={styles.needsBanner} testID="needs-bowler-banner">
            <Ionicons name="warning" size={18} color={colors.onWarning} />
            <Text style={styles.needsText}>Over complete. Select the next bowler.</Text>
            <Pressable style={styles.needsBtn} onPress={() => setShowNewBowler(true)} testID="pick-bowler-btn"><Text style={styles.needsBtnText}>Pick</Text></Pressable>
          </View>
        )}

        {!isCompleted && !isInningsEnded && !needsNextInningsSetup && curInn.started && (
          <>
            <View style={styles.extrasRow}>
              {(["none","wide","no_ball","bye","leg_bye"] as const).map((e) => (
                <Pressable key={e} testID={`extra-${e}`} style={[styles.extraChip, extra === e && styles.extraChipActive]} onPress={() => setExtra(e)}>
                  <Text style={[styles.extraText, extra === e && styles.extraTextActive]}>
                    {e === "none" ? "OFF BAT" : e === "wide" ? "WD" : e === "no_ball" ? "NB" : e === "bye" ? "BYE" : "LB"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.runsGrid}>
              {[0, 1, 2, 3, 4, 6].map((n) => (
                <Pressable key={n} testID={`run-${n}`} style={[styles.runBtn, (n === 4 || n === 6) ? styles.runBtnPrimary : null]} onPress={() => runsButton(n)} disabled={saving}>
                  <Text style={[styles.runText, (n === 4 || n === 6) && styles.runTextInv]}>{n}</Text>
                  <Text style={[styles.runLbl, (n === 4 || n === 6) && styles.runLblInv]}>{n === 4 ? "FOUR" : n === 6 ? "SIX" : n === 0 ? "DOT" : n === 1 ? "SINGLE" : `${n} RUNS`}</Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.actionBar}>
              <Pressable testID="wicket-btn" style={styles.wicketBtn} onPress={wicketButton} disabled={saving}>
                <Text style={styles.wicketText}>WICKET</Text>
              </Pressable>
              <Pressable testID="undo-btn" style={styles.undoBtn} onPress={undo} disabled={saving}>
                <Ionicons name="arrow-undo" size={16} color={colors.onSurface} />
                <Text style={styles.undoText}>UNDO</Text>
              </Pressable>
              <Pressable testID="swap-btn" style={styles.swapBtn} onPress={() => sendBall({ runs: 0, extra_type: "none", wicket: false, swap_strike: true })} disabled={saving}>
                <Ionicons name="swap-horizontal" size={20} color={colors.onSurface} />
              </Pressable>
            </View>
          </>
        )}

        {isCompleted && (
          <>
            <View style={styles.completedCard} testID="match-completed-card">
              <Ionicons name="trophy" size={40} color={colors.warning} />
              <Text style={styles.completedTitle}>Match Complete</Text>
              <Text style={styles.completedSub}>{match.result_text}</Text>
            </View>
            {momPlayer ? (
              <View style={styles.momCard} testID="mom-card">
                <View style={styles.momAvatar}>
                  {momPic ? <Image source={{ uri: momPic, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.momAvatarImg} /> : <Text style={styles.playerAvatarText}>{momPlayer.name?.[0]}</Text>}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.momLbl}>🏅 MAN OF THE MATCH</Text>
                  <Text style={styles.momName}>{momPlayer.name}</Text>
                  <Text style={styles.momMeta}>{match.man_of_the_match_team_id === match.team_a_id ? match.team_a_name : match.team_b_name}{match.man_of_the_match_summary ? ` • ${match.man_of_the_match_summary}` : ""}</Text>
                </View>
                <Pressable testID="change-mom-btn" onPress={() => setShowMoM(true)}><Ionicons name="pencil" size={18} color={colors.muted} /></Pressable>
              </View>
            ) : (
              <Pressable testID="pick-mom-btn" style={styles.primaryBtn} onPress={() => setShowMoM(true)}>
                <Text style={styles.primaryBtnText}>Select Man of the Match</Text>
              </Pressable>
            )}

            {(match.best_batter_id || match.best_bowler_id) && (
              <View style={styles.awardsRow} testID="best-awards-row">
                {match.best_batter_id && (() => {
                  const bb = playerObj(match.best_batter_id);
                  const pic = bb?.profile_picture_path ? fileUrl(bb.profile_picture_path, token) : bb?.picture;
                  return (
                    <Pressable style={styles.awardCol} testID="best-batter-card" onPress={() => openPlayerProfile(bb?.player_id || null)}>
                      <View style={[styles.awardAvatar, { backgroundColor: colors.brandTertiary }]}>
                        {pic ? <Image source={{ uri: pic, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.awardAvatarImg} /> : <Text style={styles.playerAvatarText}>{bb?.name?.[0]}</Text>}
                      </View>
                      <Text style={styles.awardTitle}>🏏 BEST BATTER</Text>
                      <Text style={styles.awardName} numberOfLines={1}>{bb?.name || "-"}</Text>
                      <Text style={styles.awardMeta} numberOfLines={2}>{match.best_batter_summary}</Text>
                    </Pressable>
                  );
                })()}
                {match.best_bowler_id && (() => {
                  const bb = playerObj(match.best_bowler_id);
                  const pic = bb?.profile_picture_path ? fileUrl(bb.profile_picture_path, token) : bb?.picture;
                  return (
                    <Pressable style={styles.awardCol} testID="best-bowler-card" onPress={() => openPlayerProfile(bb?.player_id || null)}>
                      <View style={[styles.awardAvatar, { backgroundColor: colors.error + "30" }]}>
                        {pic ? <Image source={{ uri: pic, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.awardAvatarImg} /> : <Text style={styles.playerAvatarText}>{bb?.name?.[0]}</Text>}
                      </View>
                      <Text style={styles.awardTitle}>🎯 BEST BOWLER</Text>
                      <Text style={styles.awardName} numberOfLines={1}>{bb?.name || "-"}</Text>
                      <Text style={styles.awardMeta} numberOfLines={2}>{match.best_bowler_summary}</Text>
                    </Pressable>
                  );
                })()}
              </View>
            )}
          </>
        )}

        <View style={{ height: 24 + insets.bottom }} />
      </ScrollView>

      {/* New Batsman */}
      <Modal visible={showNewBatsman} animationType="slide" onRequestClose={() => setShowNewBatsman(false)}>
        <View style={[styles.modal, { paddingTop: insets.top }]} testID="new-batsman-modal">
          <View style={styles.modalHead}>
            <Pressable style={styles.hbtn} onPress={() => setShowNewBatsman(false)}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
            <Text style={styles.modalTitle}>New Batsman</Text>
            <View style={{ width: 32 }} />
          </View>
          <ScrollView>
            {availableBatsmen.map((p: any) => {
              const pic = p.profile_picture_path ? fileUrl(p.profile_picture_path, token) : p.picture;
              return (
                <Pressable key={p.player_id} testID={`newbat-${p.player_id}`} style={[styles.modalPlayer, pickedBatsman === p.player_id && styles.modalPlayerActive]} onPress={() => setPickedBatsman(p.player_id)}>
                  <View style={styles.modalAvatar}>{pic ? <Image source={{ uri: pic, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.modalAvatarImg} /> : <Text style={styles.modalAvatarText}>{p.name?.[0]}</Text>}</View>
                  <Text style={styles.modalName}>{p.name}</Text>
                  {pickedBatsman === p.player_id && <Ionicons name="checkmark-circle" size={22} color={colors.brandPrimary} />}
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable testID="confirm-batsman-btn" style={styles.modalBtn} onPress={() => {
            setBatsmanForNextBall(pickedBatsman);
            setShowNewBatsman(false);
            // Auto-open the info card
            const p = availableBatsmen.find((x: any) => x.player_id === pickedBatsman);
            if (p) showPlayerCard(p, "batsman");
            setPickedBatsman("");
            if (wasRunOut) {
              // Ask who's on strike
              setShowStrikePick(true);
            }
          }} disabled={!pickedBatsman}>
            <Text style={styles.modalBtnText}>Confirm</Text>
          </Pressable>
        </View>
      </Modal>

      {/* New Bowler */}
      <Modal visible={showNewBowler} animationType="slide" onRequestClose={() => setShowNewBowler(false)}>
        <View style={[styles.modal, { paddingTop: insets.top }]} testID="new-bowler-modal">
          <View style={styles.modalHead}>
            <Pressable style={styles.hbtn} onPress={() => setShowNewBowler(false)}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
            <Text style={styles.modalTitle}>Next Bowler</Text>
            <View style={{ width: 32 }} />
          </View>
          <ScrollView>
            {availableBowlers.map((p: any) => {
              const pic = p.profile_picture_path ? fileUrl(p.profile_picture_path, token) : p.picture;
              return (
                <Pressable key={p.player_id} testID={`newbowl-${p.player_id}`} style={[styles.modalPlayer, pickedBowler === p.player_id && styles.modalPlayerActive]} onPress={() => setPickedBowler(p.player_id)}>
                  <View style={styles.modalAvatar}>{pic ? <Image source={{ uri: pic, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.modalAvatarImg} /> : <Text style={styles.modalAvatarText}>{p.name?.[0]}</Text>}</View>
                  <Text style={styles.modalName}>{p.name}</Text>
                  {pickedBowler === p.player_id && <Ionicons name="checkmark-circle" size={22} color={colors.brandPrimary} />}
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable testID="confirm-bowler-btn" style={styles.modalBtn} onPress={() => {
            setBowlerForNextBall(pickedBowler);
            setShowNewBowler(false);
            const p = availableBowlers.find((x: any) => x.player_id === pickedBowler);
            if (p) showPlayerCard(p, "bowler");
            setPickedBowler("");
          }} disabled={!pickedBowler}>
            <Text style={styles.modalBtnText}>Confirm</Text>
          </Pressable>
        </View>
      </Modal>

      {/* Wicket type */}
      <Modal visible={showWicketType} animationType="slide" onRequestClose={() => setShowWicketType(false)}>
        <View style={[styles.modal, { paddingTop: insets.top }]} testID="wicket-type-modal">
          <View style={styles.modalHead}>
            <Pressable style={styles.hbtn} onPress={() => setShowWicketType(false)}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
            <Text style={styles.modalTitle}>How was the batsman out?</Text>
            <View style={{ width: 32 }} />
          </View>
          <View style={styles.outTypeGrid}>
            {OUT_TYPES.map((o) => (
              <Pressable key={o.key} testID={`out-${o.key}`} style={styles.outTypeBtn} onPress={() => onPickOutType(o.key)}>
                <Ionicons name={o.icon as any} size={24} color={colors.brandPrimary} />
                <Text style={styles.outTypeText}>{o.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      </Modal>

      {/* Fielder */}
      <Modal visible={showFielder} animationType="slide" onRequestClose={() => setShowFielder(false)}>
        <View style={[styles.modal, { paddingTop: insets.top }]} testID="fielder-modal">
          <View style={styles.modalHead}>
            <Pressable style={styles.hbtn} onPress={() => { setShowFielder(false); setPendingWicket(null); }}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
            <Text style={styles.modalTitle}>
              {pendingWicket?.out_type === "catch_out" ? "Who took the catch?" :
               pendingWicket?.out_type === "stumped" ? "Who completed the stumping?" :
               "Who was the fielder involved?"}
            </Text>
            <View style={{ width: 32 }} />
          </View>
          <ScrollView>
            {fielders.map((p: any) => {
              const pic = p.profile_picture_path ? fileUrl(p.profile_picture_path, token) : p.picture;
              return (
                <Pressable key={p.player_id} testID={`fielder-${p.player_id}`} style={[styles.modalPlayer, pickedFielder === p.player_id && styles.modalPlayerActive]} onPress={() => setPickedFielder(p.player_id)}>
                  <View style={styles.modalAvatar}>{pic ? <Image source={{ uri: pic, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.modalAvatarImg} /> : <Text style={styles.modalAvatarText}>{p.name?.[0]}</Text>}</View>
                  <Text style={styles.modalName}>{p.name}</Text>
                  {pickedFielder === p.player_id && <Ionicons name="checkmark-circle" size={22} color={colors.brandPrimary} />}
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable testID="confirm-fielder-btn" style={styles.modalBtn} onPress={() => pendingWicket && submitWicketWith(pendingWicket.out_type, { fielder_id: pickedFielder, out_batsman_id: pendingWicket.out_batsman_id })} disabled={!pickedFielder}>
            <Text style={styles.modalBtnText}>Confirm Wicket</Text>
          </Pressable>
        </View>
      </Modal>

      {/* MoM */}
      <Modal visible={showMoM} animationType="slide" onRequestClose={() => setShowMoM(false)}>
        <View style={[styles.modal, { paddingTop: insets.top }]} testID="mom-modal">
          <View style={styles.modalHead}>
            <Pressable style={styles.hbtn} onPress={() => setShowMoM(false)}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
            <Text style={styles.modalTitle}>Man of the Match</Text>
            <View style={{ width: 32 }} />
          </View>
          <View style={{ flexDirection: "row" }}>
            <Pressable testID="mom-tab-a" style={[{ flex: 1, paddingVertical: 12, alignItems: "center" }, momTab === "a" && { borderBottomWidth: 3, borderBottomColor: colors.brandPrimary }]} onPress={() => setMomTab("a")}>
              <Text style={{ color: momTab === "a" ? colors.brandPrimary : colors.muted, fontWeight: "700" }}>{match.team_a_short}</Text>
            </Pressable>
            <Pressable testID="mom-tab-b" style={[{ flex: 1, paddingVertical: 12, alignItems: "center" }, momTab === "b" && { borderBottomWidth: 3, borderBottomColor: colors.brandPrimary }]} onPress={() => setMomTab("b")}>
              <Text style={{ color: momTab === "b" ? colors.brandPrimary : colors.muted, fontWeight: "700" }}>{match.team_b_short}</Text>
            </Pressable>
          </View>
          <ScrollView>
            {((momTab === "a" ? teamA?.players : teamB?.players) || []).map((p: any) => {
              const pic = p.profile_picture_path ? fileUrl(p.profile_picture_path, token) : p.picture;
              return (
                <Pressable key={p.player_id} testID={`mom-pick-${p.player_id}`} style={[styles.modalPlayer, pickedMoM === p.player_id && styles.modalPlayerActive]} onPress={() => setPickedMoM(p.player_id)}>
                  <View style={styles.modalAvatar}>{pic ? <Image source={{ uri: pic, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.modalAvatarImg} /> : <Text style={styles.modalAvatarText}>{p.name?.[0]}</Text>}</View>
                  <Text style={styles.modalName}>{p.name}</Text>
                  {pickedMoM === p.player_id && <Ionicons name="checkmark-circle" size={22} color={colors.brandPrimary} />}
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable testID="confirm-mom-btn" style={styles.modalBtn} onPress={submitMoM} disabled={!pickedMoM || saving}>
            {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.modalBtnText}>Save</Text>}
          </Pressable>
        </View>
      </Modal>

      {/* Share */}
      <Modal visible={showShare} animationType="slide" onRequestClose={() => setShowShare(false)}>
        <View style={[styles.modal, { paddingTop: insets.top }]} testID="share-modal">
          <View style={styles.modalHead}>
            <Pressable style={styles.hbtn} onPress={() => setShowShare(false)}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
            <Text style={styles.modalTitle}>Share Live Match</Text>
            <View style={{ width: 32 }} />
          </View>
          <View style={styles.shareBox}>
            <Text style={styles.shareText}>Anyone with this link can follow the match live — no sign-in needed.</Text>
            <View style={styles.shareLink}>
              <Text style={styles.shareLinkText} selectable testID="share-url">{shareUrl}</Text>
            </View>
            <Pressable testID="copy-share-btn" style={styles.modalBtn} onPress={copyShare}>
              <Text style={styles.modalBtnText}>Copy Link</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
      {/* Who got out? — for run-out */}
      <Modal visible={showWhoOut} animationType="slide" onRequestClose={() => setShowWhoOut(false)} transparent={false}>
        <View style={[styles.modal, { paddingTop: insets.top }]} testID="whoout-modal">
          <View style={styles.modalHead}>
            <Pressable style={styles.hbtn} onPress={() => { setShowWhoOut(false); setPendingWicket(null); }}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
            <Text style={styles.modalTitle}>WHO GOT OUT?</Text>
            <View style={{ width: 32 }} />
          </View>
          <Text style={[styles.modalSub, { paddingTop: 12 }]}>Select the batter who was run out.</Text>
          <View style={styles.segRow}>
            {[strikerObj, nonStrikerObj].filter(Boolean).map((p: any) => (
              <Pressable key={p.player_id} testID={`whoout-${p.player_id}`} style={[styles.segBtn, pendingWicket?.out_batsman_id === p.player_id && styles.segBtnActive]} onPress={() => setPendingWicket((pw) => pw ? { ...pw, out_batsman_id: p.player_id } : pw)}>
                <View style={styles.modalAvatar}>{(p.profile_picture_path || p.picture) ? <Image source={{ uri: fileUrl(p.profile_picture_path, token) || p.picture, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.modalAvatarImg} /> : <Text style={styles.modalAvatarText}>{p.name?.[0]}</Text>}</View>
                <View>
                  <Text style={styles.segText}>{p.name}</Text>
                  <Text style={{ color: colors.muted, fontSize: 11 }}>{p.player_id === strikerObj?.player_id ? "Striker" : "Non-Striker"}</Text>
                </View>
              </Pressable>
            ))}
          </View>
          <Pressable style={styles.modalBtn} testID="confirm-whoout-btn" onPress={() => { setShowWhoOut(false); setShowRunOutRuns(true); }} disabled={!pendingWicket?.out_batsman_id}>
            <Text style={styles.modalBtnText}>Next: runs completed</Text>
          </Pressable>
        </View>
      </Modal>

      {/* Run-out completed runs & extra type */}
      <Modal visible={showRunOutRuns} animationType="slide" onRequestClose={() => setShowRunOutRuns(false)} transparent={false}>
        <View style={[styles.modal, { paddingTop: insets.top }]} testID="runout-runs-modal">
          <View style={styles.modalHead}>
            <Pressable style={styles.hbtn} onPress={() => { setShowRunOutRuns(false); setShowWhoOut(true); }}><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
            <Text style={styles.modalTitle}>Runs completed?</Text>
            <View style={{ width: 32 }} />
          </View>
          <Text style={[styles.modalSub, { paddingTop: 12 }]}>How many runs did the batters complete BEFORE the run out?</Text>
          <View style={[styles.runsGrid, { paddingHorizontal: 12 }]}>
            {[0, 1, 2, 3, 4, 5].map((n) => (
              <Pressable key={n} testID={`ro-runs-${n}`} style={[styles.runBtn, roRuns === n && styles.runBtnPrimary]} onPress={() => setRoRuns(n)}>
                <Text style={[styles.runText, roRuns === n && styles.runTextInv]}>{n}</Text>
                <Text style={[styles.runLbl, roRuns === n && styles.runLblInv]}>{n === 0 ? "NO RUN" : n === 1 ? "SINGLE" : `${n} RUNS`}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.modalSub, { paddingTop: 6 }]}>How were the runs scored?</Text>
          <View style={[styles.extrasRow, { flexWrap: "wrap" }]}>
            {([
              { key: "none", label: "OFF BAT" },
              { key: "bye", label: "BYE" },
              { key: "leg_bye", label: "LEG BYE" },
            ] as const).map((opt) => (
              <Pressable key={opt.key} testID={`ro-type-${opt.key}`} style={[styles.extraChip, roExtra === opt.key && styles.extraChipActive]} onPress={() => setRoExtra(opt.key)}>
                <Text style={[styles.extraText, roExtra === opt.key && styles.extraTextActive]}>{opt.label}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={[styles.modalSub, { fontSize: 11, paddingTop: 0 }]}>
            {roExtra === "none" ? "Off bat: team runs + batter runs both increase." :
             roExtra === "bye" ? "Bye: only team runs increase (not credited to batter or bowler)." :
             "Leg bye: only team runs increase (not credited to batter or bowler)."}
          </Text>
          <Pressable style={styles.modalBtn} testID="confirm-runout-runs" onPress={() => {
            setPendingWicket((pw) => pw ? { ...pw, runs: roRuns, extraType: roExtra } : pw);
            setShowRunOutRuns(false);
            setShowFielder(true);
          }}>
            <Text style={styles.modalBtnText}>Next: pick fielder</Text>
          </Pressable>
        </View>
      </Modal>

      {/* Who's on strike? — for run-out new batsman */}
      <Modal visible={showStrikePick} animationType="fade" transparent onRequestClose={() => setShowStrikePick(false)}>
        <View style={styles.infoOverlay}>
          <View style={styles.infoCard}>
            <Text style={styles.infoTag}>WHO IS ON STRIKE?</Text>
            <Text style={styles.infoStyle}>Pick who faces the next ball.</Text>
            <View style={{ height: 12 }} />
            {(() => {
              // The two batters currently in the middle after the run-out:
              // - "surviving" = whichever of striker_id / non_striker_id is still set
              // - "incoming" = the just-picked new batsman (batsmanForNextBall)
              const survivingId = curInn.striker_id || curInn.non_striker_id || null;
              const surviving = playerObj(survivingId);
              const incoming = playerObj(batsmanForNextBall);
              const survivingPic = surviving?.profile_picture_path ? fileUrl(surviving.profile_picture_path, token) : surviving?.picture;
              const incomingPic = incoming?.profile_picture_path ? fileUrl(incoming.profile_picture_path, token) : incoming?.picture;
              // Semantics: setting newBatsmanOnStrike=true means the incoming batter faces next ball.
              return (
                <View style={{ width: "100%", flexDirection: "row", gap: 10 }}>
                  <Pressable testID="strike-surviving" style={[styles.segBtn, newBatsmanOnStrike === false && styles.segBtnActive]} onPress={() => setNewBatsmanOnStrike(false)}>
                    <View style={styles.modalAvatar}>{survivingPic ? <Image source={{ uri: survivingPic, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.modalAvatarImg} /> : <Text style={styles.modalAvatarText}>{surviving?.name?.[0] || "?"}</Text>}</View>
                    <View>
                      <Text style={styles.segText}>{surviving?.name || "Batter 1"}</Text>
                      <Text style={{ color: colors.muted, fontSize: 11 }}>Faces next ball</Text>
                    </View>
                  </Pressable>
                  <Pressable testID="strike-incoming" style={[styles.segBtn, newBatsmanOnStrike === true && styles.segBtnActive]} onPress={() => setNewBatsmanOnStrike(true)}>
                    <View style={styles.modalAvatar}>{incomingPic ? <Image source={{ uri: incomingPic, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.modalAvatarImg} /> : <Text style={styles.modalAvatarText}>{incoming?.name?.[0] || "?"}</Text>}</View>
                    <View>
                      <Text style={styles.segText}>{incoming?.name || "Batter 2"}</Text>
                      <Text style={{ color: colors.muted, fontSize: 11 }}>Faces next ball</Text>
                    </View>
                  </Pressable>
                </View>
              );
            })()}
            <Pressable style={[styles.modalBtn, { alignSelf: "stretch", marginTop: 14 }]} testID="confirm-strike-btn" onPress={() => setShowStrikePick(false)} disabled={newBatsmanOnStrike === null}>
              <Text style={styles.modalBtnText}>Confirm</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

      {/* NEW BATSMAN / NEW BOWLER INFO OVERLAY */}
      {infoCard && (
        <Pressable style={styles.infoOverlay} testID="info-card-overlay" onPress={() => setInfoCard(null)}>
          <View style={styles.infoCard} onStartShouldSetResponder={() => true}>
            <Text style={styles.infoTag}>NEW {infoCard.kind === "batsman" ? "BATTER" : "BOWLER"}</Text>
            <View style={styles.infoAvatar}>
              {(infoCard.player?.profile_picture_path || infoCard.player?.picture) ?
                <Image source={{ uri: fileUrl(infoCard.player?.profile_picture_path, token) || infoCard.player?.picture, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.infoAvatarImg} /> :
                <Text style={styles.infoAvatarText}>{infoCard.player?.name?.[0]}</Text>}
            </View>
            <Text style={styles.infoName}>{infoCard.player?.name}</Text>
            <Text style={styles.infoStyle}>{infoCard.kind === "batsman" ? (infoCard.player?.batting_style || "Batter") : (infoCard.player?.bowling_style || "Bowler")}</Text>
            {infoCard.stats ? (
              infoCard.kind === "batsman" ? (
                <View style={styles.infoStatsRow}>
                  <View style={styles.infoStatCol}><Text style={styles.infoStatLbl}>Matches</Text><Text style={styles.infoStatVal}>{infoCard.stats.matches}</Text></View>
                  <View style={styles.infoStatCol}><Text style={styles.infoStatLbl}>Runs</Text><Text style={styles.infoStatVal}>{infoCard.stats.batting.runs}</Text></View>
                  <View style={styles.infoStatCol}><Text style={styles.infoStatLbl}>Highest</Text><Text style={styles.infoStatVal}>{infoCard.stats.batting.highest}</Text></View>
                  <View style={styles.infoStatCol}><Text style={styles.infoStatLbl}>Avg</Text><Text style={styles.infoStatVal}>{Number(infoCard.stats.batting.average || 0).toFixed(1)}</Text></View>
                  <View style={styles.infoStatCol}><Text style={styles.infoStatLbl}>SR</Text><Text style={styles.infoStatVal}>{Number(infoCard.stats.batting.strike_rate || 0).toFixed(1)}</Text></View>
                </View>
              ) : (
                <View style={styles.infoStatsRow}>
                  <View style={styles.infoStatCol}><Text style={styles.infoStatLbl}>Matches</Text><Text style={styles.infoStatVal}>{infoCard.stats.matches}</Text></View>
                  <View style={styles.infoStatCol}><Text style={styles.infoStatLbl}>Wickets</Text><Text style={styles.infoStatVal}>{infoCard.stats.bowling.wickets}</Text></View>
                  <View style={styles.infoStatCol}><Text style={styles.infoStatLbl}>Best</Text><Text style={styles.infoStatVal}>{infoCard.stats.bowling.best || "-"}</Text></View>
                  <View style={styles.infoStatCol}><Text style={styles.infoStatLbl}>Econ</Text><Text style={styles.infoStatVal}>{Number(infoCard.stats.bowling.economy || 0).toFixed(1)}</Text></View>
                </View>
              )
            ) : (
              <Text style={styles.infoDismiss}>{infoCard.player?.user_id ? "Loading career stats…" : "Guest player — no stats available"}</Text>
            )}
            <Text style={styles.infoDismiss}>Tap anywhere to close</Text>
          </View>
        </Pressable>
      )}

    </View>
  );
}
