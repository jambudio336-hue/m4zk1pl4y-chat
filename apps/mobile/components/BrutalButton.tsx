import { Pressable, Text, StyleSheet, ActivityIndicator, ViewStyle } from 'react-native';
import { colors, border, radius, space, type } from '../lib/theme';

type Props = {
  label: string;
  onPress?: () => void;
  variant?: 'solid' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  compact?: boolean;
};

export function BrutalButton({
  label,
  onPress,
  variant = 'solid',
  disabled,
  loading,
  style,
  compact,
}: Props) {
  const solid = variant === 'solid';
  const danger = variant === 'danger';

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        solid && styles.solid,
        danger && styles.danger,
        !solid && !danger && styles.ghost,
        (disabled || loading) && styles.disabled,
        pressed && !disabled && styles.pressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={solid ? colors.bg : colors.text} />
      ) : (
        <Text style={[styles.label, (solid || danger) && styles.labelInverse]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    ...border.thick,
    borderRadius: radius.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 4, height: 4 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 4,
  },
  compact: { paddingVertical: space.sm, paddingHorizontal: space.md },
  solid: { backgroundColor: colors.accent, borderColor: colors.accent },
  danger: { backgroundColor: colors.danger, borderColor: colors.danger },
  ghost: { borderColor: colors.line },
  disabled: { opacity: 0.45 },
  pressed: { transform: [{ translateX: 3 }, { translateY: 3 }], shadowOffset: { width: 0, height: 0 } },
  label: { ...type.label, color: colors.text, fontSize: 12 },
  labelInverse: { color: colors.bg },
});
