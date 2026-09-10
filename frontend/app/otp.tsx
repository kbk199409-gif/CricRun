import { useState, useRef, useEffect } from "react";
import {
  View, Text, TextInput, Pressable, ActivityIndicator, KeyboardAvoidingView, Platform,
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Ionicons from "@react-native-vector-icons/ionicons";
import { makeStyles, useTheme } from "@/src/theme";
import { useAuth } from "@/src/auth";

const API = process.env.EXPO_PUBLIC_BACKEND_URL;

const useStyles = makeStyles((c) => ({
  root: { flex: 1, backgroundColor: c.surface },
  back: { padding: 8, alignSelf: "flex-start" },
  content: { paddingHorizontal: 24, paddingTop: 12 },
  title: { fontSize: 28, fontWeight: "800", color: c.onSurface, letterSpacing: -0.5 },
  sub: { fontSize: 15, color: c.muted, marginTop: 6 },
  hint: { fontSize: 13, color: c.info, marginTop: 8 },
  otpRow: { flexDirection: "row", gap: 10, marginTop: 32, justifyContent: "space-between" },
  otpBox: { width: 48, height: 56, borderRadius: 12, borderWidth: 1.5, borderColor: c.border, textAlign: "center", fontSize: 22, fontWeight: "700", color: c.onSurface, backgroundColor: c.surfaceTertiary },
  otpBoxActive: { borderColor: c.brandPrimary, backgroundColor: c.brandTertiary },
  primaryBtn: { backgroundColor: c.brandPrimary, borderRadius: 12, paddingVertical: 16, alignItems: "center", marginTop: 24 },
  primaryBtnText: { color: c.onBrandPrimary, fontWeight: "700", fontSize: 16 },
  err: { color: c.error, marginTop: 12, fontSize: 13 },
}));

export default function OtpScreen() {
  const styles = useStyles();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { phone } = useLocalSearchParams<{ phone: string }>();
  const { signIn } = useAuth();
  const [digits, setDigits] = useState(["", "", "", "", "", ""]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const refs = useRef<Array<TextInput | null>>([]);

  useEffect(() => { refs.current[0]?.focus(); }, []);

  const set = (i: number, v: string) => {
    const clean = v.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[i] = clean;
    setDigits(next);
    if (clean && i < 5) refs.current[i + 1]?.focus();
  };

  const verify = async () => {
    const code = digits.join("");
    if (code.length !== 6) { setErr("Enter all 6 digits"); return; }
    setLoading(true); setErr("");
    try {
      const r = await fetch(`${API}/api/auth/phone/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, code }),
      });
      if (r.ok) {
        const data = await r.json();
        await signIn(data.session_token, data.user);
      } else {
        const j = await r.json().catch(() => ({}));
        setErr(j.detail || "Verification failed");
      }
    } catch (e: any) {
      setErr("Network error");
    }
    setLoading(false);
  };

  return (
    <View style={[styles.root, { paddingTop: insets.top }]} testID="otp-screen">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <Pressable style={styles.back} onPress={() => router.back()} testID="back-btn">
          <Ionicons name="chevron-back" size={26} color={colors.onSurface} />
        </Pressable>
        <View style={styles.content}>
          <Text style={styles.title}>Verify your number</Text>
          <Text style={styles.sub}>Sent a 6-digit code to {phone}</Text>
          <Text style={styles.hint}>Demo: enter any 6 digits (e.g. 123456)</Text>

          <View style={styles.otpRow}>
            {digits.map((d, i) => (
              <TextInput
                key={i}
                ref={(r) => { refs.current[i] = r; }}
                testID={`otp-${i}`}
                style={[styles.otpBox, d && styles.otpBoxActive]}
                keyboardType="number-pad"
                maxLength={1}
                value={d}
                onChangeText={(v) => set(i, v)}
                onKeyPress={({ nativeEvent }) => {
                  if (nativeEvent.key === "Backspace" && !digits[i] && i > 0) {
                    refs.current[i - 1]?.focus();
                  }
                }}
              />
            ))}
          </View>

          {err ? <Text style={styles.err}>{err}</Text> : null}

          <Pressable testID="verify-btn" style={styles.primaryBtn} onPress={verify} disabled={loading}>
            {loading ? <ActivityIndicator color={colors.onBrandPrimary} /> : (
              <Text style={styles.primaryBtnText}>Verify & Continue</Text>
            )}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
