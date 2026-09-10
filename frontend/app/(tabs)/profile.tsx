import { View, Text, Pressable, ScrollView, Image } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth, fileUrl } from "@/src/auth";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surfaceSecondary },
  banner: { backgroundColor: c.brandPrimary, paddingHorizontal: 24, paddingBottom: 60 },
  bannerTitle: { color: c.onBrandPrimary, fontSize: 22, fontWeight: "800" },
  card: { marginHorizontal: 20, marginTop: -40, backgroundColor: c.surface, borderRadius: 20, padding: 20, alignItems: "center", shadowColor: "#000", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } },
  avatar: { width: 96, height: 96, borderRadius: 999, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: c.surface, marginTop: -60 },
  avatarImg: { width: 96, height: 96, borderRadius: 999 },
  name: { fontSize: 22, fontWeight: "800", color: c.onSurface, marginTop: 12 },
  contact: { color: c.muted, fontSize: 13, marginTop: 4 },
  tagRow: { flexDirection: "row", gap: 8, marginTop: 14, flexWrap: "wrap", justifyContent: "center" },
  tag: { backgroundColor: c.brandTertiary, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
  tagText: { color: c.onBrandTertiary, fontSize: 12, fontWeight: "700" },
  statsRow: { flexDirection: "row", marginTop: 20, gap: 12, marginHorizontal: 20 },
  statCard: { flex: 1, backgroundColor: c.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: c.border, alignItems: "center" },
  statVal: { fontSize: 22, fontWeight: "800", color: c.onSurface, fontVariant: ["tabular-nums"] },
  statLabel: { fontSize: 11, color: c.muted, marginTop: 2, textTransform: "uppercase", fontWeight: "600" },
  menu: { marginHorizontal: 20, marginTop: 20, backgroundColor: c.surface, borderRadius: 14, borderWidth: 1, borderColor: c.border },
  menuItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, gap: 12, borderBottomWidth: 1, borderBottomColor: c.divider },
  menuLast: { borderBottomWidth: 0 },
  menuText: { flex: 1, color: c.onSurface, fontWeight: "600", fontSize: 15 },
  menuDanger: { color: c.error },
}));

const LABELS: Record<string, string> = {
  right_hand: "Right Hand Bat", left_hand: "Left Hand Bat",
  pacer: "Fast Bowler", medium_pacer: "Medium Pacer", spinner: "Spinner", none: "Non-bowler",
  batsman: "Batsman", bowler: "Bowler", allrounder: "All-rounder", wicketkeeper: "Wicketkeeper",
};

export default function ProfileTab() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, signOut, token } = useAuth();
  const picUrl = fileUrl(user?.profile_picture_path, token);

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="profile-tab">
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={styles.banner}>
          <Text style={styles.bannerTitle}>Profile</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.avatar}>
            {picUrl ? <Image source={{ uri: picUrl, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.avatarImg} /> :
              user?.picture ? <Image source={{ uri: user.picture }} style={styles.avatarImg} /> :
              <Ionicons name="person" size={48} color={colors.muted} />
            }
          </View>
          <Text style={styles.name}>{user?.name}</Text>
          <Text style={styles.contact}>{user?.email || user?.phone}</Text>
          <View style={styles.tagRow}>
            {user?.batting_style && <View style={styles.tag}><Text style={styles.tagText}>{LABELS[user.batting_style]}</Text></View>}
            {user?.bowling_style && user.bowling_style !== "none" && <View style={styles.tag}><Text style={styles.tagText}>{LABELS[user.bowling_style]}</Text></View>}
            {user?.role && <View style={styles.tag}><Text style={styles.tagText}>{LABELS[user.role]}</Text></View>}
          </View>
        </View>

        <View style={styles.statsRow}>
          <View style={styles.statCard}><Text style={styles.statVal}>0</Text><Text style={styles.statLabel}>Matches</Text></View>
          <View style={styles.statCard}><Text style={styles.statVal}>0</Text><Text style={styles.statLabel}>Runs</Text></View>
          <View style={styles.statCard}><Text style={styles.statVal}>0</Text><Text style={styles.statLabel}>Wickets</Text></View>
        </View>

        <View style={styles.menu}>
          <Pressable testID="logout-btn" style={[styles.menuItem, styles.menuLast]} onPress={signOut}>
            <Ionicons name="log-out-outline" size={22} color={colors.error} />
            <Text style={[styles.menuText, styles.menuDanger]}>Log Out</Text>
          </Pressable>
        </View>
        <View style={{ height: 32 + insets.bottom }} />
      </ScrollView>
    </View>
  );
}
