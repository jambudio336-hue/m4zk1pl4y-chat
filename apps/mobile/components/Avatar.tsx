import { View, Text, StyleSheet } from 'react-native';
import { colors, border } from '../lib/theme';

type Props = { name: string; accent?: string; size?: number; ring?: boolean };

export function Avatar({ name, accent = colors.accent, size = 44, ring }: Props) {
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View
      style={[
        styles.base,
        {
          width: size,
          height: size,
          backgroundColor: accent,
          borderWidth: ring ? 3 : 2,
          borderColor: ring ? colors.text : colors.line,
        },
      ]}
    >
      <Text style={[styles.text, { fontSize: size * 0.38 }]}>{initials || '?'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { alignItems: 'center', justifyContent: 'center', borderRadius: 2 },
  text: { color: colors.bg, fontWeight: '900', fontFamily: 'monospace' },
});
