import { View, Text, Pressable, ScrollView, ActivityIndicator, Image } from "react-native";
import { useCallback, useEffect, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
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
  hero: { backgroundColor: c.brandPrimary, padding: 20, alignItems: "center" },
  avatar: { width: 96, height: 96, borderRadius: 999, backgroundColor: "#FFFFFF33", alignItems: "center", justifyContent: "center", overflow: "hidden" },
  avatarImg: { width: 96, height: 96, borderRadius: 999 },
  avatarText: { color: c.onBrandPrimary, fontSize: 34, fontWeight: "800" },
  name: { color: c.onBrandPrimary, fontSize: 22, fontWeight: "800", marginTop: 12 },
  meta: { color: "#DBEAFE", fontSize: 13, marginTop: 4 },

  sectionHead: { fontSize: 11, fontWeight: "700", color: c.muted, letterSpacing: 1, marginHorizontal: 16, marginTop: 20, marginBottom: 8, textTransform: "uppercase" },
  statRow: { flexDirection: "row", marginHorizontal: 16, gap: 8, marginBottom: 8 },
  statCard: { flex: 1, backgroundColor: c.surface, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: c.border, alignItems: "center" },
  statVal: { fontSize: 22, fontWeight: "800", color: c.onSurface, fontVariant: ["tabular-nums"] },
  statLbl: { fontSize: 10, color: c.muted, marginTop: 2, textTransform: "uppercase", fontWeight: "700" },
  singleCard: { marginHorizontal: 16, backgroundColor: c.surface, borderRadius: 12, padding: 14, borderWidth: 1, borderColor: c.border, marginBottom: 8 },
  rowKV: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6 },
  key: { color: c.muted, fontSize: 13 },
  val: { color: c.onSurface, fontSize: 15, fontWeight: "700", fontVariant: ["tabular-nums"] },
}));

export default function PlayerProfile() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id, public: publicFlag } = useLocalSearchParams<{ id: string; public?: string }>();
  const { apiFetch, token } = useAuth();
  const [data, setData] = useState<any>(null);
  const isPublic = publicFlag === "1" || !token;

  const load = useCallback(async () => {
    try {
      if (isPublic) {
        const r = await fetch(`${API}/api/public/players/${id}/stats`);
        if (r.ok) setData(await r.json());
      } else {
        const r = await apiFetch(`/api/players/${id}/stats`);
        if (r.ok) setData(await r.json());
      }
    } catch {}
  }, [apiFetch, id, isPublic]);
  useEffect(() => { load(); }, [load]);

  if (!data) return <View style={[styles.root, { alignItems: "center", justifyContent: "center", paddingTop: insets.top }]}><ActivityIndicator color={colors.brandPrimary} /></View>;

  const u = data.user;
  const s = data.stats;
  const pic = isPublic
    ? (u.profile_picture_path ? `${API}/api/public/files/${u.profile_picture_path}` : u.picture)
    : (u.profile_picture_path ? fileUrl(u.profile_picture_path, token) : u.picture);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="player-profile-screen">
      <View style={styles.headerRow}>
        <Pressable style={styles.hbtn} onPress={() => router.back()}><Ionicons name="chevron-back" size={24} color={colors.onSurface} /></Pressable>
        <Text style={styles.htitle}>Player Profile</Text>
        <View style={{ width: 32 }} />
      </View>
      <ScrollView>
        <View style={styles.hero}>
          <View style={styles.avatar}>{pic ? <Image source={{ uri: pic, headers: (!isPublic && token) ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.avatarImg} /> : <Text style={styles.avatarText}>{u.name?.[0]}</Text>}</View>
          <Text style={styles.name}>{u.name || "Player"}</Text>
          <Text style={styles.meta}>{u.batting_style ? u.batting_style.replace("_", " ") : ""} {u.bowling_style && u.bowling_style !== "none" ? `• ${u.bowling_style.replace("_", " ")}` : ""}</Text>
          <Text style={styles.meta}>{s.matches} matches • {s.mom_awards} Man of the Match</Text>
        </View>

        <Text style={styles.sectionHead}>Batting</Text>
        <View style={styles.statRow}>
          <View style={styles.statCard}><Text style={styles.statVal} testID="stat-runs">{s.batting.runs}</Text><Text style={styles.statLbl}>Runs</Text></View>
          <View style={styles.statCard}><Text style={styles.statVal}>{s.batting.highest}</Text><Text style={styles.statLbl}>Highest</Text></View>
          <View style={styles.statCard}><Text style={styles.statVal}>{s.batting.average}</Text><Text style={styles.statLbl}>Avg</Text></View>
          <View style={styles.statCard}><Text style={styles.statVal}>{s.batting.strike_rate}</Text><Text style={styles.statLbl}>SR</Text></View>
        </View>
        <View style={styles.singleCard}>
          <View style={styles.rowKV}><Text style={styles.key}>Innings</Text><Text style={styles.val}>{s.batting.innings}</Text></View>
          <View style={styles.rowKV}><Text style={styles.key}>Balls Faced</Text><Text style={styles.val}>{s.batting.balls}</Text></View>
          <View style={styles.rowKV}><Text style={styles.key}>4s / 6s</Text><Text style={styles.val}>{s.batting.fours} / {s.batting.sixes}</Text></View>
          <View style={styles.rowKV}><Text style={styles.key}>50s / 100s</Text><Text style={styles.val}>{s.batting.fifties} / {s.batting.hundreds}</Text></View>
          <View style={styles.rowKV}><Text style={styles.key}>Not Outs</Text><Text style={styles.val}>{s.batting.not_outs}</Text></View>
        </View>

        <Text style={styles.sectionHead}>Bowling</Text>
        <View style={styles.statRow}>
          <View style={styles.statCard}><Text style={styles.statVal} testID="stat-wickets">{s.bowling.wickets}</Text><Text style={styles.statLbl}>Wickets</Text></View>
          <View style={styles.statCard}><Text style={styles.statVal}>{s.bowling.economy}</Text><Text style={styles.statLbl}>Econ</Text></View>
          <View style={styles.statCard}><Text style={styles.statVal}>{s.bowling.best_w}/{s.bowling.best_r}</Text><Text style={styles.statLbl}>Best</Text></View>
        </View>
        <View style={styles.singleCard}>
          <View style={styles.rowKV}><Text style={styles.key}>Innings</Text><Text style={styles.val}>{s.bowling.innings}</Text></View>
          <View style={styles.rowKV}><Text style={styles.key}>Overs</Text><Text style={styles.val}>{Math.floor(s.bowling.balls / 6)}.{s.bowling.balls % 6}</Text></View>
          <View style={styles.rowKV}><Text style={styles.key}>Runs Conceded</Text><Text style={styles.val}>{s.bowling.runs}</Text></View>
          <View style={styles.rowKV}><Text style={styles.key}>Maidens</Text><Text style={styles.val}>{s.bowling.maidens}</Text></View>
          <View style={styles.rowKV}><Text style={styles.key}>Average</Text><Text style={styles.val}>{s.bowling.average}</Text></View>
          <View style={styles.rowKV}><Text style={styles.key}>Strike Rate</Text><Text style={styles.val}>{s.bowling.strike_rate}</Text></View>
        </View>

        <Text style={styles.sectionHead}>Fielding</Text>
        <View style={styles.statRow}>
          <View style={styles.statCard}><Text style={styles.statVal}>{s.fielding.catches}</Text><Text style={styles.statLbl}>Catches</Text></View>
          <View style={styles.statCard}><Text style={styles.statVal}>{s.fielding.run_outs}</Text><Text style={styles.statLbl}>Run outs</Text></View>
          <View style={styles.statCard}><Text style={styles.statVal}>{s.fielding.stumpings}</Text><Text style={styles.statLbl}>Stumpings</Text></View>
        </View>
        <View style={{ height: 32 + insets.bottom }} />
      </ScrollView>
    </View>
  );
}
