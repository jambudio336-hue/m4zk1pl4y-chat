import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useNavigation, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { api, type WireMessage } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useSession, open, seal } from '../../lib/identity';
import { colors, space, type, border, radius } from '../../lib/theme';

type Reaction = { emoji: string; count: number; mine: boolean };
type Bubble = { id: string; mine: boolean; body: string; at: number; kind: string; reactions: Reaction[] };

export default function Chat() {
  const { id, handle } = useLocalSearchParams<{ id: string; handle?: string }>();
  const { session } = useSession();
  const navigation = useNavigation();
  const [peerBoxKey, setPeerBoxKey] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const [reactionTarget, setReactionTarget] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const listRef = useRef<FlatList<Bubble>>(null);

  useEffect(() => {
    if (handle) navigation.setOptions({ title: String(handle).toUpperCase() });
  }, [handle, navigation]);

  const decode = useCallback(
    (wire: WireMessage, key: string): Bubble => ({
      id: wire.id,
      mine: wire.senderId === session?.user.id,
      body: wire.kind === 'deleted' ? 'Pesan telah dihapus' : (open(wire.ciphertext, wire.nonce, key) ?? '[tidak bisa didekripsi]'),
      at: wire.createdAt,
      kind: wire.kind,
      reactions: wire.reactions ?? [],
    }),
    [session?.user.id],
  );

  const load = useCallback(
    async (key: string) => {
      const { messages } = await api.messages(String(id));
      setBubbles(messages.map((m) => decode(m, key)));
      api.markRead(String(id)).catch(() => {});
    },
    [id, decode],
  );

  useEffect(() => {
    (async () => {
      try {
        const { contacts } = await api.contacts();
        const match = contacts.find((c) => c.peer.id === String(id));
        if (!match) return;
        setPeerBoxKey(match.peer.boxPublicKey);
        await load(match.peer.boxPublicKey);
      } catch {
        /* offline */
      }
    })();
  }, [id, load]);

  useEffect(() => {
    if (!peerBoxKey) return;
    // Supabase Edge Functions are request/response endpoints, not persistent Socket.IO servers.
    // Poll stored messages while this conversation is open so offline recipients receive updates.
    const poll = setInterval(() => { load(peerBoxKey).catch(() => {}); }, 5000);
    const socket = getSocket();
    if (!socket) return () => clearInterval(poll);

    const onNew = (wire: WireMessage) => {
      if (wire.senderId !== String(id) && wire.recipientId !== String(id)) return;
      setBubbles((prev) => prev.some((item) => item.id === wire.id) ? prev : [...prev, decode(wire, peerBoxKey)]);
      api.markRead(String(id)).catch(() => {});
    };
    const onTyping = (payload: { from: string; active: boolean }) => {
      if (payload.from === String(id)) setPeerTyping(payload.active);
    };
    const onRead = () => setBubbles((prev) => prev.map((b) => ({ ...b, at: b.at })));

    const onReconnect = () => load(peerBoxKey).catch(() => {});
    socket.on('message:new', onNew);
    socket.on('typing', onTyping);
    socket.on('message:read', onRead);
    socket.on('connect', onReconnect);

    return () => {
      clearInterval(poll);
      socket.off('message:new', onNew);
      socket.off('typing', onTyping);
      socket.off('message:read', onRead);
      socket.off('connect', onReconnect);
    };
  }, [id, peerBoxKey, decode, load]);

  async function deleteTarget(mode: 'me' | 'everyone') {
    const target = reactionTarget;
    setReactionTarget(null);
    if (!target) return;
    try {
      await api.deleteMessage(target, mode);
      setBubbles((prev) => mode === 'me'
        ? prev.filter((bubble) => bubble.id !== target)
        : prev.map((bubble) => bubble.id === target
          ? { ...bubble, body: 'Pesan telah dihapus', kind: 'deleted', reactions: [] }
          : bubble));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }

  async function deleteSelected(mode: 'me' | 'everyone') {
    const targets = bubbles.filter((bubble) => selectedIds.includes(bubble.id) && (mode === 'me' || bubble.mine));
    if (!targets.length) return;
    const settled = await Promise.allSettled(targets.map((bubble) => api.deleteMessage(bubble.id, mode)));
    const succeeded = new Set(targets.filter((_, index) => settled[index].status === 'fulfilled').map((bubble) => bubble.id));
    setBubbles((prev) => mode === 'me'
      ? prev.filter((bubble) => !succeeded.has(bubble.id))
      : prev.map((bubble) => succeeded.has(bubble.id)
        ? { ...bubble, body: 'Pesan telah dihapus', kind: 'deleted', reactions: [] }
        : bubble));
    setSelectedIds([]);
    if (succeeded.size) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (succeeded.size !== targets.length) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }

  async function send() {
    const body = draft.trim();
    if (!body || !peerBoxKey) return;
    setDraft('');
    getSocket()?.emit('typing', { to: String(id), active: false });

    const { nonce, ciphertext } = seal(body, peerBoxKey);
    try {
      const { message } = await api.sendMessage(String(id), nonce, ciphertext);
      setBubbles((prev) => prev.some((item) => item.id === message.id) ? prev : [...prev, decode(message, peerBoxKey)]);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {
      setDraft(body);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 90 : 0}
    >
      {selectedIds.length ? (
        <View style={styles.selectionBar}>
          <Text style={styles.selectionCount}>{selectedIds.length} pesan dipilih</Text>
          <Pressable onPress={() => setSelectedIds([])}><Text style={styles.selectionCancel}>Batal</Text></Pressable>
          <Pressable onPress={() => deleteSelected('me')}><Text style={styles.selectionAction}>Hapus saya</Text></Pressable>
          {bubbles.filter((bubble) => selectedIds.includes(bubble.id)).every((bubble) => bubble.mine) ? (
            <Pressable onPress={() => deleteSelected('everyone')}><Text style={styles.selectionDanger}>Hapus semua</Text></Pressable>
          ) : null}
        </View>
      ) : null}
      <FlatList
        ref={listRef}
        data={bubbles}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <Pressable
            style={[styles.bubble, item.mine ? styles.mine : styles.theirs]}
            onLongPress={() => setSelectedIds((prev) => prev.includes(item.id) ? prev : [...prev, item.id])}
            onPress={() => {
              if (selectedIds.length) setSelectedIds((prev) => prev.includes(item.id) ? prev.filter((value) => value !== item.id) : [...prev, item.id]);
            }}
            delayLongPress={280}
          >
            <Text style={[styles.body, item.mine && styles.bodyMine]}>{item.body}</Text>
            <Text style={[styles.stamp, item.mine && styles.stampMine]}>
              {new Date(item.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </Text>
            {item.reactions.length ? (
              <View style={styles.reactionLine}>
                {item.reactions.map((reaction) => (
                  <Text key={reaction.emoji} style={[styles.reactionChip, reaction.mine && styles.ownReaction]}>
                    {reaction.emoji} {reaction.count}
                  </Text>
                ))}
              </View>
            ) : null}
          </Pressable>
        )}
      />

      <Modal visible={!!reactionTarget} transparent animationType="fade" onRequestClose={() => setReactionTarget(null)}>
        <Pressable style={styles.reactionOverlay} onPress={() => setReactionTarget(null)}>
          <View style={styles.reactionPicker}>
            {['👍','❤️','😂','😮','😢','🙏','👌','🔥'].map((emoji) => (
              <Pressable key={emoji} style={styles.reactionOption} onPress={async () => {
                const target = reactionTarget;
                setReactionTarget(null);
                if (!target) return;
                try {
                  const result = await api.reactToMessage(target, emoji);
                  setBubbles((prev) => prev.map((bubble) => bubble.id === target ? { ...bubble, reactions: result.reactions } : bubble));
                } catch {
                  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
                }
              }}>
                <Text style={styles.reactionEmoji}>{emoji}</Text>
              </Pressable>
            ))}
            <View style={styles.deleteActions}>
              <Pressable style={styles.deleteAction} onPress={() => deleteTarget('me')}>
                <Text style={styles.deleteActionText}>Hapus untuk saya</Text>
              </Pressable>
              {bubbles.find((bubble) => bubble.id === reactionTarget)?.mine ? (
                <Pressable style={styles.deleteAction} onPress={() => deleteTarget('everyone')}>
                  <Text style={styles.deleteActionDanger}>Hapus untuk semua orang</Text>
                </Pressable>
              ) : null}
            </View>
          </View>
        </Pressable>
      </Modal>

      {peerTyping ? <Text style={styles.typing}>sedang menulis...</Text> : null}

      <View style={styles.bar}>
        <Pressable
          style={styles.callBtn}
          onPress={() => router.push(`/call/${id}?mode=audio&handle=${handle ?? ''}`)}
        >
          <Text style={styles.callGlyph}>☏</Text>
        </Pressable>
        <Pressable
          style={styles.callBtn}
          onPress={() => router.push(`/call/${id}?mode=video&handle=${handle ?? ''}`)}
        >
          <Text style={styles.callGlyph}>▣</Text>
        </Pressable>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={(v) => {
            setDraft(v);
            getSocket()?.emit('typing', { to: String(id), active: v.length > 0 });
          }}
          placeholder="Tulis pesan..."
          placeholderTextColor={colors.textDim}
          multiline
        />
        <Pressable style={styles.send} onPress={send} disabled={!draft.trim()}>
          <Text style={styles.sendGlyph}>↑</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  selectionBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, paddingHorizontal: space.md, paddingVertical: space.sm, backgroundColor: colors.panel, borderBottomWidth: 1, borderBottomColor: colors.lineDim },
  selectionCount: { color: colors.text, fontSize: 12, fontWeight: '800' },
  selectionCancel: { color: colors.textDim, fontSize: 12, fontWeight: '700' },
  selectionAction: { color: colors.accent, fontSize: 12, fontWeight: '700' },
  selectionDanger: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  list: { padding: space.md, gap: space.sm },
  bubble: {
    maxWidth: '84%',
    paddingVertical: 9,
    paddingHorizontal: 13,
    borderRadius: 16,
    borderWidth: 1,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: '#005C4B', borderColor: '#005C4B', borderBottomRightRadius: 5 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.panelAlt, borderColor: colors.lineDim, borderBottomLeftRadius: 5 },
  body: { color: colors.text, fontFamily: 'System', fontSize: 14, lineHeight: 21 },
  bodyMine: { color: '#E9EDEF' },
  stamp: { color: colors.textDim, fontFamily: 'System', fontSize: 10, marginTop: 4, textAlign: 'right' },
  stampMine: { color: '#A9DCCF' },
  reactionLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 6 },
  reactionChip: { color: colors.text, backgroundColor: '#263542', borderRadius: 12, overflow: 'hidden', paddingHorizontal: 7, paddingVertical: 2, fontSize: 11 },
  ownReaction: { borderWidth: 1, borderColor: colors.accent },
  reactionOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.72)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  reactionPicker: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', backgroundColor: colors.panel, borderColor: colors.line, borderWidth: 1, borderRadius: 18, padding: 10, maxWidth: 300 },
  reactionOption: { width: 58, height: 58, alignItems: 'center', justifyContent: 'center' },
  reactionEmoji: { fontSize: 29 },
  deleteActions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 10, marginTop: 14 },
  deleteAction: { paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, backgroundColor: colors.panelAlt },
  deleteActionText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  deleteActionDanger: { color: colors.danger, fontSize: 12, fontWeight: '700' },
  typing: {
    ...type.label,
    color: colors.textDim,
    paddingHorizontal: space.lg,
    paddingBottom: space.xs,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: space.sm,
    padding: space.sm,
    borderTopWidth: 1,
    borderTopColor: colors.lineDim,
    backgroundColor: colors.bg,
  },
  callBtn: {
    ...border.thin,
    borderRadius: 22,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callGlyph: { color: colors.accent, fontSize: 17 },
  input: {
    flex: 1,
    ...border.thin,
    borderRadius: 20,
    backgroundColor: colors.panelAlt,
    color: colors.text,
    fontFamily: 'System',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    maxHeight: 120,
    fontSize: 14,
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: 22,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendGlyph: { color: colors.bg, fontSize: 20, fontWeight: '900' },
});
