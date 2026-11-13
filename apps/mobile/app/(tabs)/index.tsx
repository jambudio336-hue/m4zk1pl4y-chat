import { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { BrutalButton } from '../../components/BrutalButton';
import { api, type Contact } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useSession, open } from '../../lib/identity';
import { colors, space, type, border, radius } from '../../lib/theme';

type Row = Contact & { preview?: string; at?: number };

export default function Chats() {
  const { session } = useSession();
  const [rows, setRows] = useState<Row[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { contacts } = await api.contacts();
    const accepted = contacts.filter((c) => c.status === 'accepted');

    const withPreview = await Promise.all(
      accepted.map(async (c) => {
        try {
          const { messages } = await api.messages(c.peer.id);
          const last = messages[messages.length - 1];
          if (!last) return c;
          return {
            ...c,
            preview: open(last.ciphertext, last.nonce, c.peer.boxPublicKey) ?? '···',
            at: last.createdAt,
          };
        } catch {
          return c;
        }
      }),
    );

    withPreview.sort((a, b) => (b.at ?? b.createdAt) - (a.at ?? a.createdAt));
    setRows(withPreview);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load]),
  );

  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    const handler = () => load().catch(() => {});
    socket.on('message:new', handler);
    socket.on('contact:request', handler);
    socket.on('contact:accepted', handler);
    return () => {
      socket.off('message:new', handler);
      socket.off('contact:request', handler);
      socket.off('contact:accepted', handler);
    };
  }, [load]);

  const pending = rows.filter((r) => r.status === 'pending');

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.head}>
        <Text style={styles.title}>CHAT</Text>
        <View style={styles.headActions}>
          <BrutalButton compact label="SCAN" onPress={() => router.push('/scan')} />
          <BrutalButton compact variant="ghost" label="ID" onPress={() => router.push('/myqr')} />
        </View>
      </View>

      {pending.length > 0 ? (
        <View style={styles.pending}>
          <Text style={styles.pendingLabel}>PERMINTAAN ({pending.length})</Text>
          {pending.map((p) => (
            <View key={p.contactId} style={styles.pendingRow}>
              <Avatar name={p.peer.displayName} accent={p.peer.accent} size={32} />
              <Text style={styles.pendingName} numberOfLines={1}>
                {p.peer.displayName}
              </Text>
              {p.direction === 'incoming' ? (
                <BrutalButton
                  compact
                  label="TERIMA"
                  onPress={async () => {
                    await api.acceptContact(p.contactId);
                    load();
                  }}
                />
              ) : (
                <Text style={styles.preview}>MENUNGGU</Text>
              )}
            </View>
          ))}
        </View>
      ) : null}

      <FlatList
        data={rows.filter((r) => r.status === 'accepted')}
        keyExtractor={(item) => item.contactId}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.accent}
            onRefresh={async () => {
              setRefreshing(true);
              await load().catch(() => {});
              setRefreshing(false);
            }}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>BELUM ADA CHAT</Text>
            <Text style={styles.emptyBody}>
              Scan QR temen lo atau minta mereka scan punya lo. ID lo: {session?.user.handle}
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={styles.row}
            onPress={() => router.push(`/chat/${item.peer.id}?handle=${item.peer.handle}`)}
          >
            <Avatar name={item.peer.displayName} accent={item.peer.accent} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name} numberOfLines={1}>
                {item.peer.displayName}
              </Text>
              <Text style={styles.preview} numberOfLines={1}>
                {item.preview ?? 'mulai ngobrol'}
              </Text>
            </View>
            <Text style={styles.chev}>›</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  head: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 3,
    borderBottomColor: colors.line,
  },
  headActions: { flexDirection: 'row', gap: space.sm },
  title: { ...type.display, fontSize: 26, color: colors.text },
  pending: {
    borderBottomWidth: 2,
    borderBottomColor: colors.lineDim,
    padding: space.md,
    gap: space.sm,
    backgroundColor: colors.panel,
  },
  pendingLabel: { ...type.label, color: colors.accent },
  pendingRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  pendingName: { flex: 1, color: colors.text, fontFamily: 'monospace' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.panelAlt,
  },
  name: { color: colors.text, fontFamily: 'monospace', fontWeight: '700', fontSize: 15 },
  preview: { color: colors.textDim, fontFamily: 'monospace', fontSize: 12, marginTop: 2 },
  chev: { color: colors.accent, fontSize: 22, fontFamily: 'monospace' },
  empty: { padding: space.xl, alignItems: 'center', gap: space.sm },
  emptyTitle: { ...type.label, color: colors.textDim },
  emptyBody: { color: colors.textDim, fontFamily: 'monospace', fontSize: 12, textAlign: 'center', lineHeight: 19 },
});
