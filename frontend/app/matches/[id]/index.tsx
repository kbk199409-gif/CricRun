import { View, Text, Pressable, ScrollView, ActivityIndicator, Modal } from "react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import * as Haptics from "expo-haptics";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  headerRow: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 4, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: c.border },
  hbtn: { padding: 6 },
  htitle: { flex: 1, textAlign: "center", fontSize: 16, fontWeight: "700", color: c.onSurface },
  scoreboard: { backgroundColor: c.surfaceInverse, padding: 20 },
  liveTag: { flexDirection: "row", alignItems: "center", alignSelf: "flex-start", backgroundColor: "#FFFFFF20", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, marginBottom: 8 },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: "#EF4444", marginRight: 6 },
  liveText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700", letterSpacing: 0.5 },
  battingLbl: { color: "#94A3B8", fontSize: 12, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  battingTeam: { color: "#FFFFFF", fontSize: 24, fontWeight: "800", marginTop: 2 },
  bigScore: { color: "#FFFFFF", fontSize: 56, fontWeight: "800", letterSpacing: -2, marginTop: 4 },
  scoreMeta: { flexDirection: "row", gap: 24, marginTop: 4 },
  metaBlock: {},
  metaLbl: { color: "#94A3B8", fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 },
  metaVal: { color: "#FFFFFF", fontSize: 18, fontWeight: "700" },
  chase: { color: "#FBBF24", fontSize: 13, marginTop: 10, fontWeight: "700" },
  result: { color: "#4ADE80", fontSize: 14, marginTop: 10, fontWeight: "800" },

  playersRow: { flexDirection: "row", backgroundColor: c.surfaceSecondary, borderBottomWidth: 1, borderBottomColor: c.border },
  playerBox: { flex: 1, padding: 12, alignItems: "center" },
  playerBoxActive: { backgroundColor: c.brandTertiary },
  playerLbl: { fontSize: 10, color: c.muted, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  playerName: { fontSize: 14, color: c.onSurface, fontWeight: "700", marginTop: 4 },

  needsBanner: { backgroundColor: c.warning, paddingVertical: 12, paddingHorizontal: 16, flexDirection: "row", alignItems: "center", gap: 10 },
  needsText: { color: c.onWarning, fontWeight: "700", flex: 1 },
  needsBtn: { backgroundColor: c.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  needsBtnText: { color: c.onWarning, fontWeight: "700", fontSize: 12 },

  extrasRow: { flexDirection: "row", padding: 12, gap: 8, backgroundColor: c.surfaceSecondary },
  extraChip: { flex: 1, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface, alignItems: "center" },
  extraChipActive: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  extraText: { fontSize: 12, fontWeight: "700", color: c.onSurfaceTertiary },
  extraTextActive: { color: c.onBrandTertiary },

  runsGrid: { flexDirection: "row", flexWrap: "wrap", padding: 12, gap: 10, justifyContent: "space-between" },
  runBtn: { width: "30%", aspectRatio: 1.6, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border },
  runBtnPrimary: { backgroundColor: c.brandPrimary, borderColor: c.brandPrimary },
  runBtnDanger: { backgroundColor: c.error, borderColor: c.error },
  runText: { fontSize: 26, fontWeight: "800", color: c.onSurface },
  runTextInv: { color: "#FFFFFF" },
  runLbl: { fontSize: 10, color: c.muted, fontWeight: "700", marginTop: 2 },
  runLblInv: { color: "#FFFFFF" },
  actionBar: { flexDirection: "row", paddingHorizontal: 12, gap: 10, marginTop: 4 },
  wicketBtn: { flex: 1, backgroundColor: c.error, borderRadius: 12, paddingVertical: 14, alignItems: "center" },
  wicketText: { color: c.onError, fontWeight: "800", fontSize: 16 },
  swapBtn: { paddingHorizontal: 16, backgroundColor: c.surfaceTertiary, borderRadius: 12, borderWidth: 1, borderColor: c.border, alignItems: "center", justifyContent: "center" },

  completedCard: { margin: 16, backgroundColor: c.brandTertiary, borderRadius: 14, padding: 20, alignItems: "center" },
  completedTitle: { fontSize: 22, fontWeight: "800", color: c.onBrandTertiary },
  completedSub: { fontSize: 14, color: c.onBrandTertiary, marginTop: 4, textAlign: "center" },
  primaryBtn: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginHorizontal: 16, marginTop: 12 },
  primaryBtnText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 15 },

  modal: { flex: 1, backgroundColor: c.surface },
  modalHead: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingTop: 4, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: c.border },
  modalTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: c.onSurface },
  modalPlayer: { marginHorizontal: 16, marginBottom: 8, backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1.5, borderColor: c.border, flexDirection: "row", alignItems: "center", gap: 12 },
  modalPlayerActive: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  modalAvatar: { width: 36, height: 36, borderRadius: 999, backgroundColor: c.brandTertiary, alignItems: "center", justifyContent: "center" },
  modalAvatarText: { color: c.onBrandTertiary, fontWeight: "700" },
  modalName: { flex: 1, color: c.onSurface, fontWeight: "600", fontSize: 15 },
  modalBtn: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 14, alignItems: "center", margin: 16 },
  modalBtnText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 15 },
}));

function ballsToOversStr(balls: number): string {
  const overs = Math.floor(balls / 6);
  const rem = balls % 6;
  return `${overs}.${rem}`;
}

export default function LiveMatch() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { apiFetch } = useAuth();
  const [match, setMatch] = useState<any>(null);
  const [batTeam, setBatTeam] = useState<any>(null);
  const [bowlTeam, setBowlTeam] = useState<any>(null);
  const [extra, setExtra] = useState<"none" | "wide" | "no_ball" | "bye" | "leg_bye">("none");
  const [saving, setSaving] = useState(false);
  const [showNewBatsman, setShowNewBatsman] = useState(false);
  const [showNewBowler, setShowNewBowler] = useState(false);
  const [pickedBatsman, setPickedBatsman] = useState<string>("");
  const [pickedBowler, setPickedBowler] = useState<string>("");

  const load = useCallback(async () => {
    try {
      const r = await apiFetch(`/api/matches/${id}`);
      if (!r.ok) return;
      const d = await r.json();
      const m = d.match;
      setMatch(m);
      const cur = m.current_innings === "a" ? m.innings_a : m.innings_b;
      const batId = m.current_innings === "a" ? m.team_a_id : m.team_b_id;
      const bowlId = m.current_innings === "a" ? m.team_b_id : m.team_a_id;
      const [rBat, rBowl] = await Promise.all([
        apiFetch(`/api/teams/${batId}`),
        apiFetch(`/api/teams/${bowlId}`),
      ]);
      if (rBat.ok) setBatTeam((await rBat.json()).team);
      if (rBowl.ok) setBowlTeam((await rBowl.json()).team);
      if (cur.needs_new_batsman) setShowNewBatsman(true);
      if (cur.needs_new_bowler) setShowNewBowler(true);
    } catch {}
  }, [apiFetch, id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const curInn = useMemo(() => {
    if (!match) return null;
    return match.current_innings === "a" ? match.innings_a : match.innings_b;
  }, [match]);
  const otherInn = useMemo(() => {
    if (!match) return null;
    return match.current_innings === "a" ? match.innings_b : match.innings_a;
  }, [match]);

  const playerName = useCallback((pid: string | null) => {
    if (!pid) return "-";
    const all = [...(batTeam?.players || []), ...(bowlTeam?.players || [])];
    return all.find((p) => p.player_id === pid)?.name || "-";
  }, [batTeam, bowlTeam]);

  const sendBall = async (body: any) => {
    if (!match) return;
    setSaving(true);
    try {
      Haptics.selectionAsync().catch(() => {});
      const r = await apiFetch(`/api/matches/${id}/innings/${match.current_innings}/ball`, {
        method: "POST", body: JSON.stringify(body),
      });
      if (r.ok) {
        const d = await r.json();
        const m = d.match;
        setMatch(m);
        setExtra("none");
        // If innings A just completed and match still live -> route to setup for B
        if (m.status !== "completed") {
          const nextInn = m.current_innings === "a" ? m.innings_a : m.innings_b;
          if (!nextInn.started) {
            router.replace(`/matches/${id}/setup?side=${m.current_innings}`);
            return;
          }
          if (nextInn.needs_new_batsman) setShowNewBatsman(true);
          if (nextInn.needs_new_bowler) setShowNewBowler(true);
        }
        await load();
      } else {
        const j = await r.json().catch(() => ({}));
        alert(j.detail || "Failed to record ball");
      }
    } catch {}
    setSaving(false);
  };

  const runsButton = (n: number) => {
    if (curInn?.needs_new_batsman || curInn?.needs_new_bowler) {
      alert("Please select the required player first.");
      return;
    }
    sendBall({ runs: n, extra_type: extra, wicket: false });
  };

  const wicketButton = () => {
    if (extra === "no_ball") { alert("Wicket cannot be recorded on a no-ball here"); return; }
    if (curInn?.needs_new_bowler) { alert("Please select the next bowler first."); return; }
    sendBall({ runs: 0, extra_type: extra, wicket: true });
  };

  const applyNewBatsman = async () => {
    if (!pickedBatsman) return;
    setShowNewBatsman(false);
    // Record a placeholder request — but we haven't sent a ball yet; the new_batsman_id
    // is applied on the next ball. Store it locally by sending an empty confirmation? We
    // need to send it inline with the next ball. Instead: send it as part of the next
    // ball input by keeping it in state.
    setBatsmanForNextBall(pickedBatsman);
    setPickedBatsman("");
  };
  const [batsmanForNextBall, setBatsmanForNextBall] = useState<string>("");
  const [bowlerForNextBall, setBowlerForNextBall] = useState<string>("");

  const applyNewBowler = () => {
    if (!pickedBowler) return;
    setBowlerForNextBall(pickedBowler);
    setPickedBowler("");
    setShowNewBowler(false);
  };

  const enhancedSendBall = async (body: any) => {
    const merged: any = { ...body };
    if (batsmanForNextBall) merged.new_batsman_id = batsmanForNextBall;
    if (bowlerForNextBall) merged.new_bowler_id = bowlerForNextBall;
    await sendBall(merged);
    setBatsmanForNextBall("");
    setBowlerForNextBall("");
  };

  if (!match || !curInn) {
    return <View style={[styles.root, { alignItems: "center", justifyContent: "center", paddingTop: insets.top }]}><ActivityIndicator color={colors.brandPrimary} /></View>;
  }

  const maxBalls = match.overs * 6;
  const battingName = match.current_innings === "a" ? match.team_a_name : match.team_b_name;
  const isCompleted = match.status === "completed";
  const oversStr = ballsToOversStr(curInn.balls);
  const runRate = curInn.balls > 0 ? ((curInn.runs / (curInn.balls / 6)) || 0).toFixed(2) : "0.00";

  let chaseInfo = "";
  if (match.current_innings === "b" && otherInn) {
    const target = otherInn.runs + 1;
    const need = target - curInn.runs;
    const ballsLeft = maxBalls - curInn.balls;
    if (need > 0) chaseInfo = `Need ${need} runs in ${ballsLeft} balls (target ${target})`;
  }

  const bat = batTeam?.players || [];
  const availableBatsmen = bat.filter((p: any) =>
    !curInn.dismissed_ids?.includes(p.player_id) &&
    p.player_id !== curInn.striker_id &&
    p.player_id !== curInn.non_striker_id
  );
  const availableBowlers = (bowlTeam?.players || []);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="live-match-screen">
      <View style={styles.headerRow}>
        <Pressable style={styles.hbtn} onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
        <Text style={styles.htitle}>{match.team_a_short} vs {match.team_b_short}</Text>
        <View style={{ width: 32 }} />
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.scoreboard}>
          <View style={styles.liveTag}>
            {!isCompleted && <View style={styles.liveDot} />}
            <Text style={styles.liveText}>{isCompleted ? "COMPLETED" : "LIVE"}</Text>
          </View>
          <Text style={styles.battingLbl}>Batting</Text>
          <Text style={styles.battingTeam}>{battingName}</Text>
          <Text style={styles.bigScore}>{curInn.runs}<Text style={{ fontSize: 30 }}>/{curInn.wickets}</Text></Text>
          <View style={styles.scoreMeta}>
            <View style={styles.metaBlock}>
              <Text style={styles.metaLbl}>Overs</Text>
              <Text style={styles.metaVal}>{oversStr}/{match.overs}</Text>
            </View>
            <View style={styles.metaBlock}>
              <Text style={styles.metaLbl}>CRR</Text>
              <Text style={styles.metaVal}>{runRate}</Text>
            </View>
          </View>
          {chaseInfo ? <Text style={styles.chase}>{chaseInfo}</Text> : null}
          {isCompleted && match.result_text ? <Text style={styles.result} testID="result-text">🏆 {match.result_text}</Text> : null}
        </View>

        {!isCompleted && (
          <View style={styles.playersRow}>
            <View style={[styles.playerBox, styles.playerBoxActive]}>
              <Text style={styles.playerLbl}>⚡ Striker</Text>
              <Text style={styles.playerName} testID="striker-name">{playerName(curInn.striker_id)}</Text>
            </View>
            <View style={styles.playerBox}>
              <Text style={styles.playerLbl}>Non-Striker</Text>
              <Text style={styles.playerName} testID="nonstriker-name">{playerName(curInn.non_striker_id)}</Text>
            </View>
            <View style={styles.playerBox}>
              <Text style={styles.playerLbl}>Bowler</Text>
              <Text style={styles.playerName} testID="bowler-name">{playerName(curInn.bowler_id)}</Text>
            </View>
          </View>
        )}

        {!isCompleted && curInn.needs_new_batsman && (
          <View style={styles.needsBanner} testID="needs-batsman-banner">
            <Ionicons name="warning" size={20} color={colors.onWarning} />
            <Text style={styles.needsText}>Wicket! Select the new batsman.</Text>
            <Pressable style={styles.needsBtn} onPress={() => setShowNewBatsman(true)} testID="pick-batsman-btn">
              <Text style={styles.needsBtnText}>Pick</Text>
            </Pressable>
          </View>
        )}
        {!isCompleted && curInn.needs_new_bowler && (
          <View style={styles.needsBanner} testID="needs-bowler-banner">
            <Ionicons name="warning" size={20} color={colors.onWarning} />
            <Text style={styles.needsText}>Over complete. Select the next bowler.</Text>
            <Pressable style={styles.needsBtn} onPress={() => setShowNewBowler(true)} testID="pick-bowler-btn">
              <Text style={styles.needsBtnText}>Pick</Text>
            </Pressable>
          </View>
        )}
        {!isCompleted && batsmanForNextBall && (
          <View style={styles.needsBanner}>
            <Text style={styles.needsText}>New batsman ready: {playerName(batsmanForNextBall)} (applies on next ball)</Text>
          </View>
        )}
        {!isCompleted && bowlerForNextBall && (
          <View style={styles.needsBanner}>
            <Text style={styles.needsText}>New bowler ready: {playerName(bowlerForNextBall)} (applies on next ball)</Text>
          </View>
        )}

        {!isCompleted && (
          <>
            <View style={styles.extrasRow}>
              {(["none","wide","no_ball","bye","leg_bye"] as const).map((e) => (
                <Pressable key={e} testID={`extra-${e}`} style={[styles.extraChip, extra === e && styles.extraChipActive]} onPress={() => setExtra(e)}>
                  <Text style={[styles.extraText, extra === e && styles.extraTextActive]}>
                    {e === "none" ? "OFF BAT" : e === "wide" ? "WIDE" : e === "no_ball" ? "NO BALL" : e === "bye" ? "BYE" : "LEG BYE"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.runsGrid}>
              {[0, 1, 2, 3, 4, 6].map((n) => (
                <Pressable
                  key={n}
                  testID={`run-${n}`}
                  style={[styles.runBtn, (n === 4 || n === 6) ? styles.runBtnPrimary : null]}
                  onPress={() => enhancedSendBall({ runs: n, extra_type: extra, wicket: false })}
                  disabled={saving}
                >
                  <Text style={[styles.runText, (n === 4 || n === 6) && styles.runTextInv]}>{n}</Text>
                  <Text style={[styles.runLbl, (n === 4 || n === 6) && styles.runLblInv]}>
                    {n === 4 ? "FOUR" : n === 6 ? "SIX" : n === 0 ? "DOT" : n === 1 ? "SINGLE" : `${n} RUNS`}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.actionBar}>
              <Pressable testID="wicket-btn" style={styles.wicketBtn} onPress={() => enhancedSendBall({ runs: 0, extra_type: extra, wicket: true })} disabled={saving}>
                <Text style={styles.wicketText}>WICKET</Text>
              </Pressable>
              <Pressable testID="swap-btn" style={styles.swapBtn} onPress={() => enhancedSendBall({ runs: 0, extra_type: "none", wicket: false, swap_strike: true })} disabled={saving}>
                <Ionicons name="swap-horizontal" size={22} color={colors.onSurface} />
              </Pressable>
            </View>
          </>
        )}

        {isCompleted && (
          <View style={styles.completedCard} testID="match-completed-card">
            <Ionicons name="trophy" size={40} color={colors.warning} />
            <Text style={styles.completedTitle}>Match Complete</Text>
            <Text style={styles.completedSub}>{match.result_text}</Text>
          </View>
        )}

        <View style={{ height: 24 + insets.bottom }} />
      </ScrollView>

      {/* New Batsman Modal */}
      <Modal visible={showNewBatsman} animationType="slide" onRequestClose={() => setShowNewBatsman(false)}>
        <View style={[styles.modal, { paddingTop: insets.top }]} testID="new-batsman-modal">
          <View style={styles.modalHead}>
            <Pressable style={styles.hbtn} onPress={() => setShowNewBatsman(false)}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
            <Text style={styles.modalTitle}>New Batsman</Text>
            <View style={{ width: 32 }} />
          </View>
          <ScrollView>
            {availableBatsmen.map((p: any) => (
              <Pressable key={p.player_id} testID={`newbat-${p.player_id}`} style={[styles.modalPlayer, pickedBatsman === p.player_id && styles.modalPlayerActive]} onPress={() => setPickedBatsman(p.player_id)}>
                <View style={styles.modalAvatar}><Text style={styles.modalAvatarText}>{p.name?.[0]}</Text></View>
                <Text style={styles.modalName}>{p.name}</Text>
                {pickedBatsman === p.player_id && <Ionicons name="checkmark-circle" size={22} color={colors.brandPrimary} />}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable testID="confirm-batsman-btn" style={styles.modalBtn} onPress={applyNewBatsman} disabled={!pickedBatsman}>
            <Text style={styles.modalBtnText}>Confirm</Text>
          </Pressable>
        </View>
      </Modal>

      {/* New Bowler Modal */}
      <Modal visible={showNewBowler} animationType="slide" onRequestClose={() => setShowNewBowler(false)}>
        <View style={[styles.modal, { paddingTop: insets.top }]} testID="new-bowler-modal">
          <View style={styles.modalHead}>
            <Pressable style={styles.hbtn} onPress={() => setShowNewBowler(false)}><Ionicons name="close" size={24} color={colors.onSurface} /></Pressable>
            <Text style={styles.modalTitle}>Next Bowler</Text>
            <View style={{ width: 32 }} />
          </View>
          <ScrollView>
            {availableBowlers.map((p: any) => (
              <Pressable key={p.player_id} testID={`newbowl-${p.player_id}`} style={[styles.modalPlayer, pickedBowler === p.player_id && styles.modalPlayerActive]} onPress={() => setPickedBowler(p.player_id)}>
                <View style={styles.modalAvatar}><Text style={styles.modalAvatarText}>{p.name?.[0]}</Text></View>
                <Text style={styles.modalName}>{p.name}</Text>
                {pickedBowler === p.player_id && <Ionicons name="checkmark-circle" size={22} color={colors.brandPrimary} />}
              </Pressable>
            ))}
          </ScrollView>
          <Pressable testID="confirm-bowler-btn" style={styles.modalBtn} onPress={applyNewBowler} disabled={!pickedBowler}>
            <Text style={styles.modalBtnText}>Confirm</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}
