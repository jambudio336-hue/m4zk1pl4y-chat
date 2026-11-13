import { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  Pressable,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useLocalSearchParams, useNavigation, router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { api, type WireMessage } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useSession, open, seal } from '../../lib/identity';
import { colors, space, type, border, radius } from '../../lib/theme';

type Bubble = { id: string; mine: boolean; body: string; at: number; kind: string };

export default function Chat() {
  const { id, handle } = useLocalSearchParams<{ id: string; handle?: string }>();
  const { session } = useSession();
  const navigation = useNavigation();
  const [peerBoxKey, setPeerBoxKey] = useState<string | null>(null);
  const [bubbles, setBubbles] = useState<Bubble[]>([]);
  const [draft, setDraft] = useState('');
  const [peerTyping, setPeerTyping] = useState(false);
  const listRef = useRef<FlatList<Bubble>>(null);

  useEffect(() => {
    if (handle) navigation.setOptions({ title: String(handle).toUpperCase() });
  }, [handle, navigation]);

  const decode = useCallback(
    (wire: WireMessage, key: string): Bubble => ({
      id: wire.id,
      mine: wire.senderId === session?.user.id,
      body: open(wire.ciphertext, wire.nonce, key) ?? '[tidak bisa didekripsi]',
      at: wire.createdAt,
      kind: wire.kind,
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
    const socket = getSocket();
    if (!socket || !peerBoxKey) return;

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
      socket.off('message:new', onNew);
      socket.off('typing', onTyping);
      socket.off('message:read', onRead);
      socket.off('connect', onReconnect);
    };
  }, [id, peerBoxKey, decode, load]);

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
      <FlatList
        ref={listRef}
        data={bubbles}
        keyExtractor={(b) => b.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={[styles.bubble, item.mine ? styles.mine : styles.theirs]}>
            <Text style={[styles.body, item.mine && styles.bodyMine]}>{item.body}</Text>
            <Text style={[styles.stamp, item.mine && styles.stampMine]}>
              {new Date(item.at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
            </Text>
          </View>
        )}
      />

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
  list: { padding: space.md, gap: space.sm },
  bubble: {
    maxWidth: '82%',
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    borderRadius: radius.sm,
    borderWidth: 2,
  },
  mine: { alignSelf: 'flex-end', backgroundColor: colors.accent, borderColor: colors.accent },
  theirs: { alignSelf: 'flex-start', backgroundColor: colors.panel, borderColor: colors.lineDim },
  body: { color: colors.text, fontFamily: 'monospace', fontSize: 14, lineHeight: 20 },
  bodyMine: { color: colors.bg },
  stamp: { color: colors.textDim, fontFamily: 'monospace', fontSize: 9, marginTop: 4 },
  stampMine: { color: '#5A5200' },
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
    borderTopWidth: 3,
    borderTopColor: colors.line,
    backgroundColor: colors.bg,
  },
  callBtn: {
    ...border.thin,
    borderRadius: radius.sm,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  callGlyph: { color: colors.accent, fontSize: 17 },
  input: {
    flex: 1,
    ...border.thin,
    borderRadius: radius.sm,
    backgroundColor: colors.panel,
    color: colors.text,
    fontFamily: 'monospace',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    maxHeight: 120,
    fontSize: 14,
  },
  send: {
    width: 42,
    height: 42,
    borderRadius: radius.sm,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendGlyph: { color: colors.bg, fontSize: 20, fontWeight: '900' },
});
