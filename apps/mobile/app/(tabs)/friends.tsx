import { useCallback, useState } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, Alert, RefreshControl } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { Avatar } from '../../components/Avatar';
import { api, type Contact } from '../../lib/api';
import { colors, space } from '../../lib/theme';

export default function Friends() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [handle, setHandle] = useState('');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const result = await api.contacts();
      setContacts(result.contacts);
    } catch (error: any) {
      Alert.alert('Tidak bisa memuat teman', error?.message || 'Periksa koneksi internet dan server.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const friends = contacts.filter((item) => item.status === 'accepted');
  const incoming = contacts.filter((item) => item.status === 'pending' && item.direction === 'incoming');
  const outgoing = contacts.filter((item) => item.status === 'pending' && item.direction === 'outgoing');

  async function addFriend() {
    const username = handle.trim().replace(/^@/, '').toLowerCase();
    if (!username) return;
    setSending(true);
    try {
      const result = await api.addContact(username);
      setHandle('');
      await load();
      if (result.status === 'accepted') {
        Alert.alert('Sudah terhubung', 'Kalian sudah saling berteman. Chat bisa langsung dimulai.');
      } else {
        Alert.alert('Permintaan terkirim', `Permintaan pertemanan ke @${username} sudah dikirim.`);
      }
    } catch (error: any) {
      const messages: Record<string, string> = {
        user_not_found: 'Username tidak ditemukan.',
        self: 'Kamu tidak bisa menambahkan akun sendiri.',
        handle_taken: 'Username tidak tersedia.',
      };
      Alert.alert('Gagal menambahkan teman', messages[error?.message] || error?.message || 'Coba lagi.');
    } finally {
      setSending(false);
    }
  }

  async function accept(item: Contact) {
    try {
      await api.acceptContact(item.contactId);
      await load();
      Alert.alert('Teman ditambahkan', `@ ${item.peer.handle} sekarang ada di daftar temanmu.`);
    } catch (error: any) {
      Alert.alert('Gagal menerima permintaan', error?.message || 'Coba lagi.');
    }
  }

  function openChat(item: Contact) {
    router.push(`/chat/${item.peer.id}?handle=${encodeURIComponent(item.peer.handle)}`);
  }

  return (
    <View style={styles.root}>
      <View style={styles.heading}>
        <Text style={styles.title}>Teman</Text>
        <Text style={styles.count}>{friends.length} TERHUBUNG</Text>
      </View>

      <View style={styles.addCard}>
        <Text style={styles.sectionTitle}>Tambah teman</Text>
        <View style={styles.addRow}>
          <TextInput
            value={handle}
            onChangeText={setHandle}
            placeholder="Masukkan username"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            onSubmitEditing={addFriend}
            style={styles.input}
          />
          <Pressable style={[styles.addButton, (!handle.trim() || sending) && styles.disabled]} onPress={addFriend} disabled={!handle.trim() || sending}>
            <Text style={styles.addButtonText}>{sending ? '...' : 'Tambah'}</Text>
          </Pressable>
        </View>
        <Text style={styles.hint}>Gunakan ID teman, misalnya @namapengguna</Text>
      </View>

      {incoming.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Permintaan masuk · {incoming.length}</Text>
          {incoming.map((item) => (
            <View key={item.contactId} style={styles.friendRow}>
              <Avatar name={item.peer.displayName} accent={item.peer.accent} imageUrl={item.peer.avatarUrl} size={46} />
              <View style={styles.details}>
                <Text style={styles.name}>{item.peer.displayName}</Text>
                <Text style={styles.handle}>@{item.peer.handle}</Text>
              </View>
              <Pressable style={styles.acceptButton} onPress={() => accept(item)}>
                <Text style={styles.acceptText}>Terima</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}

      {outgoing.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Menunggu konfirmasi · {outgoing.length}</Text>
          {outgoing.map((item) => (
            <View key={item.contactId} style={styles.friendRow}>
              <Avatar name={item.peer.displayName} accent={item.peer.accent} imageUrl={item.peer.avatarUrl} size={46} />
              <View style={styles.details}>
                <Text style={styles.name}>{item.peer.displayName}</Text>
                <Text style={styles.handle}>@{item.peer.handle}</Text>
              </View>
              <Text style={styles.pending}>Menunggu</Text>
            </View>
          ))}
        </View>
      )}

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Daftar teman</Text>
          <Pressable onPress={load}><Text style={styles.refresh}>Muat ulang</Text></Pressable>
        </View>
        <FlatList
          data={friends}
          keyExtractor={(item) => item.contactId}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={colors.accent} />}
          ListEmptyComponent={<Text style={styles.empty}>{loading ? 'Memuat daftar teman…' : 'Belum ada teman terhubung. Tambahkan username atau terima permintaan teman.'}</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.friendRow} onPress={() => openChat(item)}>
              <Avatar name={item.peer.displayName} accent={item.peer.accent} imageUrl={item.peer.avatarUrl} size={48} />
              <View style={styles.details}>
                <Text style={styles.name}>{item.peer.displayName}</Text>
                <Text style={styles.handle}>@{item.peer.handle}</Text>
              </View>
              <View style={styles.chatAction}><Text style={styles.chatActionText}>Chat</Text></View>
            </Pressable>
          )}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  heading: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 16, flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.8 },
  count: { color: colors.accent, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  addCard: { marginHorizontal: 16, marginBottom: 18, padding: 14, borderRadius: 16, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.lineDim },
  section: { paddingHorizontal: 16, marginBottom: 14, flex: 1 },
  sectionTitle: { color: colors.text, fontSize: 14, fontWeight: '700', marginBottom: 10 },
  addRow: { flexDirection: 'row', gap: 8 },
  input: { flex: 1, minHeight: 46, borderRadius: 12, backgroundColor: colors.panelAlt, paddingHorizontal: 14, color: colors.text, fontSize: 14 },
  addButton: { minWidth: 82, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: colors.accent, paddingHorizontal: 14 },
  disabled: { opacity: 0.45 },
  addButtonText: { color: colors.bg, fontWeight: '800', fontSize: 13 },
  hint: { color: colors.textDim, fontSize: 11, marginTop: 8 },
  friendRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.lineDim },
  details: { flex: 1, gap: 3 },
  name: { color: colors.text, fontSize: 14, fontWeight: '700' },
  handle: { color: colors.textDim, fontSize: 12 },
  acceptButton: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9 },
  acceptText: { color: colors.bg, fontSize: 12, fontWeight: '800' },
  pending: { color: colors.textDim, fontSize: 11 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  refresh: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  empty: { color: colors.textDim, fontSize: 13, lineHeight: 20, textAlign: 'center', padding: 24 },
  chatAction: { borderWidth: 1, borderColor: colors.lineDim, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 8 },
  chatActionText: { color: colors.accent, fontSize: 12, fontWeight: '700' },
});
