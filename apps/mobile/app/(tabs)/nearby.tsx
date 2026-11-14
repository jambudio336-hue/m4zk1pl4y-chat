import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Alert } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import * as Location from 'expo-location';
import { Avatar } from '../../components/Avatar';
import { BrutalButton } from '../../components/BrutalButton';
import { api } from '../../lib/api';
import { colors, space, type, border, radius } from '../../lib/theme';

type NearUser = {
  id: string;
  handle: string;
  displayName: string;
  accent: string;
  bio: string;
  avatarUrl?: string | null;
  distance: number;
};

export default function Nearby() {
  const [users, setUsers] = useState<NearUser[]>([]);
  const [state, setState] = useState<'idle' | 'loading' | 'denied' | 'done'>('idle');

  const scan = useCallback(async () => {
    setState('loading');
    try {
      const perm = await Location.requestForegroundPermissionsAsync();
      if (perm.status !== 'granted') {
        setState('denied');
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      await api.pushLocation(pos.coords.latitude, pos.coords.longitude);
      const data = await api.nearby(3000);
      setUsers(data.users as NearUser[]);
      setState('done');
    } catch {
      setState('done');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (state === 'idle') scan();
    }, [state, scan]),
  );

  async function connect(user: NearUser) {
    try {
      const res = await api.addContact(user.handle);
      if (res.status === 'accepted') {
        router.push(`/chat/${user.id}?handle=${user.handle}`);
      } else {
        Alert.alert('TERKIRIM', `Permintaan ke ${user.handle} dikirim.`);
      }
    } catch (err: any) {
      Alert.alert('GAGAL', err?.message === 'user_not_found' ? 'User hilang.' : 'Coba lagi.');
    }
  }

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text style={styles.title}>SEKITAR</Text>
        <BrutalButton compact label="REFRESH" onPress={scan} />
      </View>

      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        contentContainerStyle={{ padding: space.md, gap: space.sm }}
        ListEmptyComponent={
          <Text style={styles.empty}>
            {state === 'loading'
              ? 'Nyari orang di sekitar...'
              : state === 'denied'
                ? 'Izin lokasi ditolak. Aktifin di setelan HP.'
                : 'Belum ada orang di radius 3 km.'}
          </Text>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => connect(item)}>
            <Avatar name={item.displayName} accent={item.accent} imageUrl={item.avatarUrl} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{item.displayName}</Text>
              <Text style={styles.meta}>
                @{item.handle} · {item.distance < 1000 ? `${item.distance} m` : `${(item.distance / 1000).toFixed(1)} km`}
              </Text>
            </View>
            <Text style={styles.plus}>+</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.md,
    borderBottomWidth: 3,
    borderBottomColor: colors.line,
  },
  title: { ...type.display, fontSize: 26, color: colors.text },
  empty: { color: colors.textDim, fontFamily: 'monospace', textAlign: 'center', padding: space.xl, lineHeight: 20 },
  row: {
    ...border.thin,
    borderRadius: radius.sm,
    padding: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: colors.panel,
  },
  name: { color: colors.text, fontFamily: 'monospace', fontWeight: '700' },
  meta: { color: colors.textDim, fontFamily: 'monospace', fontSize: 11, marginTop: 2 },
  plus: { color: colors.accent, fontSize: 22, fontFamily: 'monospace' },
});
