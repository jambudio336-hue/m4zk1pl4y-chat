import { View, Text, StyleSheet, Pressable } from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useSession } from '../lib/identity';
import { colors, space, type, border, radius } from '../lib/theme';

export default function MyQr() {
  const { session } = useSession();
  if (!session) return null;

  const payload = `m4zk1pl4y://u/${session.user.handle}`;

  async function copy() {
    await Clipboard.setStringAsync(session!.user.handle);
    Haptics.selectionAsync();
  }

  return (
    <View style={styles.root}>
      <Text style={styles.label}>ID LO</Text>
      <Pressable onPress={copy} style={styles.card}>
        <View style={styles.qrWrap}>
          <QRCode value={payload} size={220} color={colors.bg} backgroundColor={colors.text} />
        </View>
        <Text style={styles.handle}>{session.user.handle}</Text>
      </Pressable>
      <Text style={styles.hint}>
        Tap ID buat nyalin. Temen lo scan ini, atau ketik ID-nya manual di tab TEMEN.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: space.lg, alignItems: 'center' },
  label: { ...type.label, color: colors.textDim, alignSelf: 'flex-start', marginBottom: space.md },
  card: {
    ...border.thick,
    borderRadius: radius.sm,
    padding: space.lg,
    backgroundColor: colors.panel,
    alignItems: 'center',
    gap: space.md,
  },
  qrWrap: { padding: space.md, backgroundColor: colors.text },
  handle: { ...type.display, fontSize: 20, color: colors.accent },
  hint: {
    color: colors.textDim,
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 19,
    textAlign: 'center',
    marginTop: space.lg,
  },
});
