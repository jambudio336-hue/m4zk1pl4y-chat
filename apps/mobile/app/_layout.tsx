import { useEffect } from 'react';
import { Stack, Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { bootstrap, useSession } from '../lib/identity';
import { connectSocket, disconnectSocket } from '../lib/socket';
import { colors, type } from '../lib/theme';

export default function RootLayout() {
  const { session, ready } = useSession();

  useEffect(() => {
    bootstrap();
  }, []);

  useEffect(() => {
    if (session) {
      const socket = connectSocket();
      return () => socket?.disconnect();
    }
    disconnectSocket();
    return undefined;
  }, [session?.token]);

  if (!ready) {
    return (
      <View style={styles.splash}>
        <Text style={styles.brand}>M4ZK1PL4Y</Text>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: colors.bg },
          headerTintColor: colors.text,
          headerTitleStyle: { ...type.label, fontSize: 13 },
          contentStyle: { backgroundColor: colors.bg },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="onboarding" options={{ headerShown: false }} />
        <Stack.Screen name="scan" options={{ title: 'SCAN QR' }} />
        <Stack.Screen name="myqr" options={{ title: 'ID GUE' }} />
        <Stack.Screen name="chat/[id]" options={{ title: 'CHAT' }} />
        <Stack.Screen name="call/[id]" options={{ headerShown: false }} />
      </Stack>
      {!session ? <Redirect href="/onboarding" /> : null}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
  },
  brand: { ...type.display, fontSize: 28, color: colors.accent },
});
