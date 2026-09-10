import { useState } from "react";
import {
  View, Text, TextInput, Pressable, ActivityIndicator, ScrollView,
  KeyboardAvoidingView, Platform, Image,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth, fileUrl } from "@/src/auth";

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  header: { paddingHorizontal: 24, paddingTop: 8 },
  title: { fontSize: 28, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  sub: { fontSize: 15, color: c.muted, marginTop: 6, marginBottom: 24 },
  avatarWrap: { alignItems: "center", marginBottom: 24 },
  avatar: { width: 108, height: 108, borderRadius: 999, backgroundColor: c.surfaceTertiary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: c.brandSecondary },
  avatarImg: { width: 108, height: 108, borderRadius: 999 },
  editBadge: { position: "absolute", right: -2, bottom: -2, backgroundColor: c.brandPrimary, width: 34, height: 34, borderRadius: 999, alignItems: "center", justifyContent: "center", borderWidth: 3, borderColor: c.surface },
  section: { paddingHorizontal: 24, marginTop: 4 },
  label: { fontSize: 13, fontWeight: "700", color: c.onSurface, marginBottom: 10, textTransform: "uppercase", letterSpacing: 0.5 },
  input: { backgroundColor: c.surfaceTertiary, borderWidth: 1, borderColor: c.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, fontSize: 16, color: c.onSurface, marginBottom: 20 },
  pillRow: { flexDirection: "row", gap: 10, marginBottom: 20, flexWrap: "wrap" },
  pill: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 999, borderWidth: 1.5, borderColor: c.border, backgroundColor: c.surfaceTertiary },
  pillActive: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  pillText: { color: c.onSurfaceTertiary, fontSize: 14, fontWeight: "600" },
  pillTextActive: { color: c.onBrandTertiary },
  footer: { paddingHorizontal: 24, paddingTop: 12 },
  saveBtn: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  saveText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 16 },
}));

const BAT = [ ["right_hand", "Right Hand"], ["left_hand", "Left Hand"] ];
const BOWL = [ ["pacer", "Fast"], ["medium_pacer", "Medium"], ["spinner", "Spinner"], ["none", "None"] ];
const ROLE = [ ["batsman", "Batsman"], ["bowler", "Bowler"], ["allrounder", "All-rounder"], ["wicketkeeper", "Keeper"] ];

export default function ProfileSetup() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, apiFetch, refreshUser, token } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [bat, setBat] = useState<string>(user?.batting_style || "");
  const [bowl, setBowl] = useState<string>(user?.bowling_style || "");
  const [role, setRole] = useState<string>(user?.role || "");
  const [saving, setSaving] = useState(false);
  const [picPath, setPicPath] = useState<string | null>(user?.profile_picture_path || null);
  const [uploading, setUploading] = useState(false);

  const pickImage = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"] as any,
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.7,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setUploading(true);
    try {
      const form = new FormData();
      const uri = asset.uri;
      const name = uri.split("/").pop() || "avatar.jpg";
      const type = "image/jpeg";
      if (Platform.OS === "web") {
        const blob = await (await fetch(uri)).blob();
        form.append("file", blob, name);
      } else {
        form.append("file", { uri, name, type } as any);
      }
      const r = await apiFetch("/api/upload/profile-picture", { method: "POST", body: form });
      if (r.ok) {
        const data = await r.json();
        setPicPath(data.path);
      }
    } catch {}
    setUploading(false);
  };

  const save = async () => {
    if (!name.trim() || !bat || !bowl) return;
    setSaving(true);
    try {
      await apiFetch("/api/profile", {
        method: "PUT",
        body: JSON.stringify({ name: name.trim(), batting_style: bat, bowling_style: bowl, role, profile_picture_path: picPath }),
      });
      await refreshUser();
    } catch {}
    setSaving(false);
  };

  const picUrl = fileUrl(picPath, token);

  return (
    <View style={[styles.root, { paddingTop: insets.top + 8 }]} testID="profile-setup-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.title}>Complete your profile</Text>
            <Text style={styles.sub}>Tell us how you play cricket</Text>
          </View>

          <View style={styles.avatarWrap}>
            <Pressable onPress={pickImage} testID="avatar-picker" style={styles.avatar}>
              {uploading ? <ActivityIndicator color={colors.brandPrimary} /> :
                picUrl ? <Image source={{ uri: picUrl, headers: token ? { Authorization: `Bearer ${token}` } : undefined }} style={styles.avatarImg} /> :
                <Ionicons name="person" size={54} color={colors.muted} />
              }
              <View style={styles.editBadge}>
                <Ionicons name="camera" size={16} color={colors.onBrandPrimary} />
              </View>
            </Pressable>
          </View>

          <View style={styles.section}>
            <Text style={styles.label}>Full Name</Text>
            <TextInput testID="name-input" style={styles.input} placeholder="Virat Kohli" placeholderTextColor={colors.muted} value={name} onChangeText={setName} />

            <Text style={styles.label}>Batting Style</Text>
            <View style={styles.pillRow}>
              {BAT.map(([v, l]) => (
                <Pressable key={v} testID={`bat-${v}`} style={[styles.pill, bat === v && styles.pillActive]} onPress={() => setBat(v)}>
                  <Text style={[styles.pillText, bat === v && styles.pillTextActive]}>{l}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Bowling Style</Text>
            <View style={styles.pillRow}>
              {BOWL.map(([v, l]) => (
                <Pressable key={v} testID={`bowl-${v}`} style={[styles.pill, bowl === v && styles.pillActive]} onPress={() => setBowl(v)}>
                  <Text style={[styles.pillText, bowl === v && styles.pillTextActive]}>{l}</Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Playing Role</Text>
            <View style={styles.pillRow}>
              {ROLE.map(([v, l]) => (
                <Pressable key={v} testID={`role-${v}`} style={[styles.pill, role === v && styles.pillActive]} onPress={() => setRole(v)}>
                  <Text style={[styles.pillText, role === v && styles.pillTextActive]}>{l}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.footer}>
            <Pressable testID="save-profile-btn" style={styles.saveBtn} onPress={save} disabled={saving || !name.trim() || !bat || !bowl}>
              {saving ? <ActivityIndicator color={colors.onBrandPrimary} /> : <Text style={styles.saveText}>Save & Continue</Text>}
            </Pressable>
          </View>
          <View style={{ height: 32 + insets.bottom }} />
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
