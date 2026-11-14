import { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, RefreshControl, TextInput } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Avatar } from '../../components/Avatar';
import { api, type Contact } from '../../lib/api';
import { useSession, open } from '../../lib/identity';
import { colors } from '../../lib/theme';

type ChatRow = Contact & { preview: string; at: number };

function timeLabel(timestamp?: number) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
}

export default function Chats() {
  const { session } = useSession();
  const [rows, setRows] = useState<ChatRow[]>([]);
  const [query, setQuery] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { contacts } = await api.contacts();
    const accepted = contacts.filter((item) => item.status === 'accepted');
    const withPreview = await Promise.all(accepted.map(async (contact) => {
      try {
        const { messages } = await api.messages(contact.peer.id);
        const last = messages[messages.length - 1];
        if (!last) return { ...contact, preview: 'Mulai percakapan', at: contact.createdAt };
        const key = last.senderId === session?.user.id ? contact.peer.boxPublicKey : session?.user.boxPublicKey;
        return { ...contact, preview: open(last.ciphertext, last.nonce, key || contact.peer.boxPublicKey) ?? 'Pesan terenkripsi', at: last.createdAt };
      } catch {
        return { ...contact, preview: 'Ketuk untuk membuka chat', at: contact.createdAt };
      }
    }));
    withPreview.sort((a, b) => b.at - a.at);
    setRows(withPreview);
  }, [session?.user.id, session?.user.boxPublicKey]);

  useFocusEffect(useCallback(() => {
    load().catch(() => {});
  }, [load]));

  const filtered = useMemo(() => rows.filter((item) => {
    const value = query.trim().toLowerCase();
    return !value || item.peer.displayName.toLowerCase().includes(value) || item.peer.handle.toLowerCase().includes(value);
  }), [rows, query]);

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <View style={styles.header}>
        <View>
          <Text style={styles.brand}>M4ZK</Text>
          <Text style={styles.subtitle}>Pesan pribadi, tetap milikmu</Text>
        </View>
        <View style={styles.actions}>
          <Pressable style={styles.iconButton} onPress={() => router.push('/scan')}><Text style={styles.icon}>▦</Text></Pressable>
          <Pressable style={styles.iconButton} onPress={() => router.push('/myqr')}><Text style={styles.icon}>⌗</Text></Pressable>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <Text style={styles.searchIcon}>⌕</Text>
        <TextInput value={query} onChangeText={setQuery} placeholder="Cari nama atau username" placeholderTextColor={colors.textDim} style={styles.search} autoCapitalize="none" />
      </View>

      <View style={styles.sectionHeading}>
        <Text style={styles.sectionTitle}>PESAN TERBARU</Text>
        <Pressable onPress={() => router.push('/(tabs)/friends')}><Text style={styles.friendLink}>Teman · {rows.length}</Text></Pressable>
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.contactId}
        refreshControl={<RefreshControl refreshing={refreshing} tintColor={colors.accent} onRefresh={async () => { setRefreshing(true); await load().catch(() => {}); setRefreshing(false); }} />}
        contentContainerStyle={filtered.length ? styles.list : styles.emptyList}
        ListEmptyComponent={
          <View style={styles.empty}>
            <View style={styles.emptyIcon}><Text style={styles.emptyGlyph}>✉</Text></View>
            <Text style={styles.emptyTitle}>{query ? 'Tidak ditemukan' : 'Belum ada percakapan'}</Text>
            <Text style={styles.emptyBody}>{query ? 'Coba nama atau username lain.' : `Tambahkan teman untuk mulai ngobrol. ID kamu: @${session?.user.handle ?? ''}`}</Text>
            {!query ? <Pressable style={styles.addFriend} onPress={() => router.push('/(tabs)/friends')}><Text style={styles.addFriendText}>Cari teman</Text></Pressable> : null}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => router.push(`/chat/${item.peer.id}?handle=${encodeURIComponent(item.peer.handle)}`)}>
            <Avatar name={item.peer.displayName} accent={item.peer.accent} imageUrl={item.peer.avatarUrl} size={54} />
            <View style={styles.rowBody}>
              <View style={styles.nameLine}>
                <Text style={styles.name} numberOfLines={1}>{item.peer.displayName}</Text>
                <Text style={styles.time}>{timeLabel(item.at)}</Text>
              </View>
              <View style={styles.previewLine}>
                <Text style={styles.preview} numberOfLines={1}>{item.preview}</Text>
                <Text style={styles.chevron}>›</Text>
              </View>
            </View>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { color: colors.accent, fontSize: 29, fontWeight: '900', letterSpacing: -1.2 },
  subtitle: { color: colors.textDim, fontSize: 11, marginTop: 1 },
  actions: { flexDirection: 'row', gap: 10 },
  iconButton: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.panelAlt, alignItems: 'center', justifyContent: 'center' },
  icon: { color: colors.text, fontSize: 21, fontWeight: '600' },
  searchWrap: { marginHorizontal: 16, marginBottom: 18, height: 46, borderRadius: 14, backgroundColor: colors.panelAlt, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13 },
  searchIcon: { color: colors.textDim, fontSize: 22, marginRight: 8 },
  search: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 0 },
  sectionHeading: { paddingHorizontal: 18, paddingBottom: 7, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: colors.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  friendLink: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  list: { paddingBottom: 20 },
  emptyList: { flexGrow: 1, justifyContent: 'center' },
  row: { minHeight: 78, paddingHorizontal: 17, paddingVertical: 12, flexDirection: 'row', alignItems: 'center', gap: 13 },
  rowBody: { flex: 1, minHeight: 52, justifyContent: 'center', borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.lineDim, paddingBottom: 11 },
  nameLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  name: { color: colors.text, fontSize: 15, fontWeight: '700', flex: 1 },
  time: { color: colors.textDim, fontSize: 10 },
  previewLine: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 5 },
  preview: { color: colors.textDim, fontSize: 12, flex: 1 },
  chevron: { color: colors.textDim, fontSize: 20, marginLeft: 8 },
  empty: { alignItems: 'center', paddingHorizontal: 36, gap: 10 },
  emptyIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.panelAlt, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  emptyGlyph: { color: colors.accent, fontSize: 32 },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '800' },
  emptyBody: { color: colors.textDim, fontSize: 12, lineHeight: 19, textAlign: 'center' },
  addFriend: { backgroundColor: colors.accent, borderRadius: 12, paddingHorizontal: 18, paddingVertical: 11, marginTop: 6 },
  addFriendText: { color: colors.bg, fontWeight: '800', fontSize: 12 },
});
