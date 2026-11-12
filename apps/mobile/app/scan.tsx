import { useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router } from 'expo-router';
import { BrutalButton } from '../components/BrutalButton';
import { api } from '../lib/api';
import { colors, space, type } from '../lib/theme';

export default function Scan() {
  const [permission, requestPermission] = useCameraPermissions();
  const [locked, setLocked] = useState(false);

  if (!permission) return <View style={styles.root} />;

  if (!permission.granted) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.hint}>Butuh izin kamera buat scan QR.</Text>
        <BrutalButton label="IZINKAN" onPress={requestPermission} />
      </View>
    );
  }

  async function handleScan({ data }: { data: string }) {
    if (locked) return;
    const handle = data.replace(/^m4zk1pl4y:\/\/u\//, '').replace(/^@/, '').trim();
    if (!handle) return;

    setLocked(true);
    try {
      await api.addContact(handle);
      router.replace('/(tabs)');
    } catch (err: any) {
      const code = err?.message;
      Alert.alert(
        'GAGAL',
        code === 'user_not_found'
          ? 'ID gak terdaftar.'
          : code === 'self'
            ? 'Itu QR lo sendiri.'
            : 'Coba lagi.',
      );
      setLocked(false);
    }
  }

  return (
    <View style={styles.root}>
      <CameraView
        style={StyleSheet.absoluteFill}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
        onBarcodeScanned={locked ? undefined : handleScan}
      />
      <View style={styles.frame} pointerEvents="none" />
      <Text style={styles.caption}>ARAHKAN KE QR TEMEN LO</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center', gap: space.md, padding: space.lg },
  hint: { color: colors.text, fontFamily: 'monospace', textAlign: 'center' },
  frame: {
    position: 'absolute',
    top: '28%',
    left: '12%',
    right: '12%',
    aspectRatio: 1,
    borderWidth: 3,
    borderColor: colors.accent,
  },
  caption: {
    ...type.label,
    position: 'absolute',
    bottom: 60,
    alignSelf: 'center',
    color: colors.accent,
  },
});
