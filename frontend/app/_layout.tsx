import { QueryClientProvider } from "@tanstack/react-query";
import { Slot, useRouter, useSegments } from "expo-router";
import { LogBox, ActivityIndicator, View } from "react-native";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import Ionicons from "@react-native-vector-icons/ionicons";

import { ErrorBoundary } from "@/src/components/error-boundary";
import { queryClient } from "@/src/query-client";
import { AuthProvider, useAuth } from "@/src/auth";
import { useTheme } from "@/src/theme";

LogBox.ignoreAllLogs(true);

// Pre-warm icon font
Ionicons.loadFont?.().catch(() => {});

function AuthGate() {
  const { user, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const { colors } = useTheme();

  useEffect(() => {
    if (loading) return;
    const inAuth = segments[0] === undefined || segments[0] === "index" || segments[0] === "otp";
    const inProfileSetup = segments[0] === "profile-setup";
    const inPublic = segments[0] === "share";
    // Allow /player/[id] with ?public=1 to be viewed without auth (used from public share)
    const inPlayerPublic = segments[0] === "player" && (typeof window !== "undefined" && window.location?.search?.includes("public=1"));

    if (inPublic || inPlayerPublic) return; // public routes bypass auth

    if (!user) {
      if (!inAuth) router.replace("/");
      return;
    }
    if (!user.profile_complete) {
      if (!inProfileSetup) router.replace("/profile-setup");
      return;
    }
    if (inAuth || inProfileSetup) {
      router.replace("/(tabs)");
    }
  }, [user, loading, segments]);

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface }}>
        <ActivityIndicator size="large" color={colors.brandPrimary} />
      </View>
    );
  }
  return <Slot />;
}

export default function RootLayout() {
  return (
    <ErrorBoundary>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <QueryClientProvider client={queryClient}>
            <AuthProvider>
              <StatusBar style="dark" />
              <AuthGate />
            </AuthProvider>
          </QueryClientProvider>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </ErrorBoundary>
  );
}
