import { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Modal,
  TextInput,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { Avatar } from '../../components/Avatar';
import { BrutalButton } from '../../components/BrutalButton';
import { api } from '../../lib/api';
import { useSession, open, seal } from '../../lib/identity';
import { colors, space, type, border, radius } from '../../lib/theme';

type Story = {
  id: string;
  userId: string;
  handle: string;
  displayName: string;
  accent: string;
  avatarUrl?: string | null;
  nonce: string;
  ciphertext: string;
  createdAt: number;
  viewCount: number;
  seen: boolean;
  mine: boolean;
};

export default function Stories() {
  const { session } = useSession();
  const [stories, setStories] = useState<Story[]>([]);
  const [active, setActive] = useState<Story | null>(null);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');

  const load = useCallback(async () => {
    const data = await api.stories();
    setStories(data.stories as Story[]);
  }, []);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => {});
    }, [load]),
  );

  function bodyOf(story: Story): string {
    const key = story.mine ? null : storyKey(story.userId);
    if (story.mine) {
      return openWithSelf(story) ?? '[story lo]';
    }
    return key ? open(story.ciphertext, story.nonce, key) ?? '···' : '···';
  }

  const [keyMap, setKeyMap] = useState<Record<string, string>>({});
  const storyKey = (userId: string) => keyMap[userId] ?? null;
  const openWithSelf = (s: Story) => open(s.ciphertext, s.nonce, session!.user.boxPublicKey);

  useFocusEffect(
    useCallback(() => {
      api
        .contacts()
        .then(({ contacts }) => {
          const map: Record<string, string> = {};
          contacts.filter((c) => c.status === 'accepted').forEach((c) => {
            map[c.peer.id] = c.peer.boxPublicKey;
          });
          setKeyMap(map);
        })
        .catch(() => {});
    }, []),
  );

  async function publish() {
    const text = draft.trim();
    if (!text) return;
    const { nonce, ciphertext } = seal(text, session!.user.boxPublicKey);
    const recipients = Object.entries(keyMap).map(([userId, publicKey]) => ({
      userId,
      ...seal(text, publicKey),
    }));
    await api.postStory(nonce, ciphertext, recipients);
    setDraft('');
    setComposing(false);
    load().catch(() => {});
  }

  async function view(story: Story) {
    setActive(story);
    if (!story.mine) api.viewStory(story.id).catch(() => {});
  }

  return (
    <View style={styles.root}>
      <View style={styles.head}>
        <Text style={styles.title}>STORY</Text>
        <BrutalButton compact label="+ STORY" onPress={() => setComposing(true)} />
      </View>

      <FlatList
        data={stories}
        keyExtractor={(s) => s.id}
        numColumns={2}
        columnWrapperStyle={{ gap: space.sm, paddingHorizontal: space.md }}
        contentContainerStyle={{ gap: space.sm, paddingBottom: space.xl }}
        ListEmptyComponent={<Text style={styles.empty}>Belum ada story aktif. Bikin satu.</Text>}
        renderItem={({ item }) => (
          <Pressable style={styles.card} onPress={() => view(item)}>
            <Avatar name={item.displayName} accent={item.accent} size={34} ring={!item.seen} imageUrl={item.avatarUrl} />
            <Text style={styles.cardName} numberOfLines={1}>
              {item.mine ? 'LO' : item.displayName}
            </Text>
            <Text style={styles.cardBody} numberOfLines={3}>
              {bodyOf(item)}
            </Text>
            <Text style={styles.cardMeta}>
              {item.mine ? `${item.viewCount} penonton` : `${Math.max(0, Math.round((Date.now() - item.createdAt) / 60000))}m lalu`}
            </Text>
          </Pressable>
        )}
      />

      <Modal visible={!!active} animationType="fade" transparent>
        <Pressable style={styles.viewer} onPress={() => setActive(null)}>
          {active ? (
            <View style={styles.viewerCard}>
              <Avatar name={active.displayName} accent={active.accent} size={40} imageUrl={active.avatarUrl} />
              <Text style={styles.viewerName}>{active.mine ? 'LO' : active.displayName}</Text>
              <Text style={styles.viewerBody}>{bodyOf(active)}</Text>
              <Text style={styles.viewerMeta}>
                {active.mine ? `${active.viewCount} penonton` : 'ketuk buat tutup'}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </Modal>

      <Modal visible={composing} animationType="slide" transparent>
        <View style={styles.composer}>
          <Text style={styles.composerTitle}>STORY BARU</Text>
          <TextInput
            style={styles.composerInput}
            value={draft}
            onChangeText={setDraft}
            placeholder="Apa yang lo pikirin?"
            placeholderTextColor={colors.textDim}
            multiline
            autoFocus
          />
          <View style={{ flexDirection: 'row', gap: space.sm }}>
            <BrutalButton label="BATAL" variant="ghost" onPress={() => setComposing(false)} style={{ flex: 1 }} />
            <BrutalButton label="POST" onPress={publish} style={{ flex: 1 }} />
          </View>
        </View>
      </Modal>
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
  empty: { color: colors.textDim, fontFamily: 'monospace', padding: space.lg, textAlign: 'center' },
  card: {
    ...border.thin,
    borderRadius: radius.sm,
    backgroundColor: colors.panel,
    padding: space.md,
    flex: 1,
    gap: space.xs,
    minHeight: 130,
  },
  cardName: { ...type.label, color: colors.text },
  cardBody: { color: colors.textDim, fontFamily: 'monospace', fontSize: 12, lineHeight: 17, flex: 1 },
  cardMeta: { color: colors.accent, fontFamily: 'monospace', fontSize: 9 },
  viewer: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.lg,
  },
  viewerCard: {
    ...border.thick,
    borderRadius: radius.sm,
    backgroundColor: colors.panel,
    padding: space.lg,
    width: '100%',
    gap: space.sm,
  },
  viewerName: { ...type.label, color: colors.accent },
  viewerBody: { color: colors.text, fontFamily: 'monospace', fontSize: 16, lineHeight: 24 },
  viewerMeta: { color: colors.textDim, fontFamily: 'monospace', fontSize: 10 },
  composer: {
    marginTop: 'auto',
    backgroundColor: colors.panel,
    borderTopWidth: 3,
    borderTopColor: colors.line,
    padding: space.lg,
    gap: space.md,
  },
  composerTitle: { ...type.display, fontSize: 18, color: colors.text },
  composerInput: {
    ...border.thin,
    borderRadius: radius.sm,
    color: colors.text,
    fontFamily: 'monospace',
    padding: space.md,
    minHeight: 110,
    textAlignVertical: 'top',
  },
});
