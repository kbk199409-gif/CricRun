import { useState, useEffect, useCallback, useRef } from "react";
import {
  View, Text, TextInput, Pressable, ActivityIndicator,
  KeyboardAvoidingView, Platform, ScrollView, Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth";

WebBrowser.maybeCompleteAuthSession();

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

const useStyles = makeStyles((c) => ({
  container: { flex: 1, backgroundColor: c.surface },
  heroWrap: { height: 340, position: "relative" },
  heroImg: { width: "100%", height: "100%" },
  scrim: { position: "absolute", left: 0, right: 0, bottom: 0, top: 0 },
  brandRow: { position: "absolute", top: 60, left: 24, right: 24 },
  brandTitle: { color: "#FFFFFF", fontSize: 40, fontWeight: "800", letterSpacing: -1 },
  brandSub: { color: "#DBEAFE", fontSize: 15, marginTop: 4, fontWeight: "500" },
  card: { paddingHorizontal: 24, paddingTop: 32, flex: 1 },
  label: { fontSize: 14, fontWeight: "600", color: c.onSurface, marginBottom: 8 },
  phoneRow: { flexDirection: "row", alignItems: "center", backgroundColor: c.surfaceTertiary, borderRadius: 12, borderWidth: 1, borderColor: c.border, paddingHorizontal: 14 },
  cc: { color: c.onSurface, fontSize: 16, fontWeight: "600", marginRight: 8 },
  phoneInput: { flex: 1, paddingVertical: 16, fontSize: 16, color: c.onSurface },
  primaryBtn: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 16, flexDirection: "row", justifyContent: "center", gap: 8 },
  primaryBtnText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  divider: { flexDirection: "row", alignItems: "center", marginVertical: 24 },
  divLine: { flex: 1, height: 1, backgroundColor: c.border },
  divText: { marginHorizontal: 12, color: c.muted, fontSize: 13 },
  googleBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, borderWidth: 1.5, borderColor: c.border, borderRadius: 12, paddingVertical: 15 },
  googleText: { color: c.onSurface, fontWeight: "600", fontSize: 15 },
  footer: { textAlign: "center", color: c.muted, fontSize: 12, marginTop: 24, paddingHorizontal: 20 },
}));

export default function Login() {
  const styles = useStyles();
  const { colors } = useTheme();
  const router = useRouter();
  const { signIn } = useAuth();
  const [phone, setPhone] = useState("");
  const [sending, setSending] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const processedSid = useRef<Set<string>>(new Set());

  const processSessionId = useCallback(async (sid: string) => {
    if (processedSid.current.has(sid)) return;
    processedSid.current.add(sid);
    try {
      const r = await fetch(`${API}/api/auth/session`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sid }),
      });
      if (r.ok) {
        const data = await r.json();
        await signIn(data.session_token, data.user);
      }
    } catch {}
    setGoogleLoading(false);
  }, [signIn]);

  useEffect(() => {
    if (Platform.OS === "web") {
      const hash = typeof window !== "undefined" ? window.location.hash : "";
      const search = typeof window !== "undefined" ? window.location.search : "";
      const m = (hash + search).match(/[?#&]session_id=([^&#]+)/);
      if (m) {
        processSessionId(decodeURIComponent(m[1]));
        try {
          window.history.replaceState(window.history.state, "", window.location.pathname);
        } catch {}
      }
    }
  }, [processSessionId]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    let last: string | null = null;
    const sub = Linking.addEventListener("url", ({ url }) => {
      const m = url.match(/[?#&]session_id=([^&#]+)/);
      if (m) processSessionId(decodeURIComponent(m[1]));
    });
    Linking.getInitialURL().then((u) => {
      if (!u) return;
      const m = u.match(/[?#&]session_id=([^&#]+)/);
      if (m) processSessionId(decodeURIComponent(m[1]));
    });
    return () => { sub.remove(); };
  }, [processSessionId]);

  const sendOtp = async () => {
    if (phone.trim().length < 10) return;
    setSending(true);
    try {
      await fetch(`${API}/api/auth/phone/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: `+91${phone.trim()}` }),
      });
      router.push({ pathname: "/otp", params: { phone: `+91${phone.trim()}` } });
    } catch {}
    setSending(false);
  };

  const googleSignIn = async () => {
    setGoogleLoading(true);
    try {
      if (Platform.OS === "web") {
        const redirect = window.location.origin + "/";
        window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
        return;
      }
      const redirect = Linking.createURL("");
      const authUrl = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirect)}`;
      const result = await WebBrowser.openAuthSessionAsync(authUrl, redirect);
      let urlToParse: string | null = null;
      if (result.type === "success" && result.url) urlToParse = result.url;
      if (!urlToParse) urlToParse = await Linking.getInitialURL();
      if (urlToParse) {
        const m = urlToParse.match(/[?#&]session_id=([^&#]+)/);
        if (m) await processSessionId(decodeURIComponent(m[1]));
      }
    } catch {}
    setGoogleLoading(false);
  };

  return (
    <View style={styles.container} testID="login-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }} showsVerticalScrollIndicator={false}>
          <View style={styles.heroWrap}>
            <Image
              source={{ uri: "https://images.unsplash.com/photo-1594470117722-de4b9a02ebed?crop=entropy&cs=srgb&fm=jpg&w=1080&q=80" }}
              style={styles.heroImg}
            />
            <LinearGradient
              colors={["rgba(15,23,42,0.3)", "rgba(15,23,42,0.85)", "#FFFFFF"]}
              locations={[0, 0.7, 1]}
              style={styles.scrim}
            />
            <View style={styles.brandRow}>
              <Text style={styles.brandTitle}>CricTrack</Text>
              <Text style={styles.brandSub}>Score. Play. Win.</Text>
            </View>
          </View>
          <View style={styles.card}>
            <Text style={styles.label}>Enter your phone number</Text>
            <View style={styles.phoneRow}>
              <Text style={styles.cc}>+91</Text>
              <TextInput
                testID="phone-input"
                style={styles.phoneInput}
                placeholder="9876543210"
                placeholderTextColor={colors.muted}
                keyboardType="phone-pad"
                maxLength={10}
                value={phone}
                onChangeText={(t) => setPhone(t.replace(/\D/g, ""))}
              />
            </View>
            <Pressable testID="send-otp-btn" style={styles.primaryBtn} onPress={sendOtp} disabled={sending || phone.length < 10}>
              {sending ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
                <>
                  <Text style={styles.primaryBtnText}>Send OTP</Text>
                  <Ionicons name="arrow-forward" size={18} color={colors.onBrandPrimary} />
                </>
              )}
            </Pressable>

            <View style={styles.divider}>
              <View style={styles.divLine} />
              <Text style={styles.divText}>OR</Text>
              <View style={styles.divLine} />
            </View>

            <Pressable testID="google-signin-btn" style={styles.googleBtn} onPress={googleSignIn} disabled={googleLoading}>
              {googleLoading ? <ActivityIndicator color={colors.brandPrimary} /> : (
                <>
                  <Ionicons name="logo-google" size={20} color="#EA4335" />
                  <Text style={styles.googleText}>Continue with Google</Text>
                </>
              )}
            </Pressable>

            <Text style={styles.footer}>
              By continuing, you agree to CricTrack's Terms & Privacy Policy.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
