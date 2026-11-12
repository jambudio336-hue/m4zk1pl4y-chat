import { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { Field } from '../components/Field';
import { BrutalButton } from '../components/BrutalButton';
import { Avatar } from '../components/Avatar';
import { registerDevice } from '../lib/identity';
import { colors, space, type, border, radius, ACCENTS } from '../lib/theme';

export default function Onboarding() {
  const [name, setName] = useState('');
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await registerDevice(name.trim(), accent);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (err: any) {
      setError(
        err?.message === 'handle_taken'
          ? 'ID bentrok, coba lagi.'
          : 'Gagal daftar. Cek koneksi ke server.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <Text style={styles.kicker}>TANPA NOMOR HP</Text>
          <Text style={styles.title}>M4ZK1PL4Y</Text>
          <Text style={styles.sub}>
            ID lo digenerate otomatis di HP ini. Kunci privat gak pernah dikirim ke server.
            Simpan HP baik-baik — ID gak bisa dipulihkan kalau HP ilang.
          </Text>

          <View style={styles.preview}>
            <Avatar name={name || 'MZ'} accent={accent} size={72} ring />
            <Text style={styles.previewName}>{name || 'NAMA LO'}</Text>
          </View>

          <Field
            label="Nama tampilan"
            placeholder="misal: Budi"
            value={name}
            onChangeText={setName}
            maxLength={24}
            autoCapitalize="words"
          />

          <Text style={styles.label}>Warna aksen</Text>
          <View style={styles.swatches}>
            {ACCENTS.map((c) => (
              <Pressable
                key={c}
                onPress={() => setAccent(c)}
                style={[
                  styles.swatch,
                  { backgroundColor: c },
                  accent === c && styles.swatchActive,
                ]}
              />
            ))}
          </View>

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <BrutalButton
            label={busy ? 'MENDAFTAR...' : 'MULAI'}
            onPress={start}
            loading={busy}
            disabled={!name.trim()}
            style={{ marginTop: space.lg }}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: space.lg, paddingBottom: space.xl },
  kicker: { ...type.label, color: colors.accent },
  title: { ...type.display, fontSize: 40, color: colors.text, marginTop: space.xs },
  sub: {
    color: colors.textDim,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 19,
    marginTop: space.md,
    marginBottom: space.lg,
  },
  preview: {
    ...border.thin,
    borderRadius: radius.sm,
    padding: space.lg,
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.lg,
    backgroundColor: colors.panel,
  },
  previewName: { ...type.label, color: colors.text },
  label: { ...type.label, color: colors.textDim, marginBottom: space.sm },
  swatches: { flexDirection: 'row', gap: space.sm, marginBottom: space.md },
  swatch: { width: 38, height: 38, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.lineDim },
  swatchActive: { borderColor: colors.text, borderWidth: 3 },
  error: { color: colors.danger, fontFamily: 'monospace', fontSize: 12, marginTop: space.sm },
});
