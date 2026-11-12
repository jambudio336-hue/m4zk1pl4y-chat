import { TextInput, Text, View, StyleSheet, TextInputProps } from 'react-native';
import { colors, border, radius, space, type } from '../lib/theme';

type Props = TextInputProps & { label: string; hint?: string };

export function Field({ label, hint, style, ...rest }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        placeholderTextColor={colors.textDim}
        {...rest}
        style={[styles.input, style]}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.md },
  label: { ...type.label, color: colors.textDim, marginBottom: space.xs },
  input: {
    ...border.thin,
    borderRadius: radius.sm,
    backgroundColor: colors.panel,
    color: colors.text,
    paddingVertical: space.md,
    paddingHorizontal: space.md,
    fontFamily: 'monospace',
    fontSize: 15,
  },
  hint: { color: colors.textDim, fontFamily: 'monospace', fontSize: 11, marginTop: space.xs },
});
