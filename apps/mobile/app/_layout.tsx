import { useEffect } from 'react';
import { Stack, Redirect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { View, Text, ActivityIndicator, StyleSheet, Alert } from 'react-native';
import { router } from 'expo-router';
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

  useEffect(() => {
    if (!session) return;
    const socket = connectSocket();
    if (!socket) return;
    const onOffer = (payload: { from: string; callId: string; sdp: unknown; mode?: string }) => {
      Alert.alert(
        payload.mode === 'video' ? 'VIDEO CALL MASUK' : 'PANGGILAN MASUK',
        `Panggilan dari ${payload.from}`,
        [
          { text: 'TOLAK', style: 'cancel', onPress: () => socket.emit('call:end', { to: payload.from, callId: payload.callId }) },
          { text: 'ANGKAT', onPress: () => router.push({
            pathname: '/call/[id]',
            params: {
              id: payload.from,
              handle: payload.from,
              mode: payload.mode === 'video' ? 'video' : 'audio',
              incoming: '1',
              callId: payload.callId,
              offer: JSON.stringify(payload.sdp),
            },
          }) },
        ],
      );
    };
    socket.on('call:offer', onOffer);
    return () => socket.off('call:offer', onOffer);
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
