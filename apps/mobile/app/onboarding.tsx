import { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable, KeyboardAvoidingView,
  Platform, StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { VideoView, useVideoPlayer } from 'expo-video';
import { Field } from '../components/Field';
import { BrutalButton } from '../components/BrutalButton';
import { Avatar } from '../components/Avatar';
import { registerDevice } from '../lib/identity';
import { colors, space, type, radius, ACCENTS } from '../lib/theme';

const INTRO_VIDEO = require('../assets/video.mp4');

export default function Onboarding() {
  const [name, setName] = useState('');
  const [accent, setAccent] = useState(ACCENTS[1]);
  const [busy, setBusy] = useState(false);
  const [muted, setMuted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const player = useVideoPlayer(INTRO_VIDEO, (instance) => {
    instance.loop = true;
    instance.muted = false;
    instance.volume = 1;
    instance.audioMixingMode = 'duckOthers';
    instance.play();
  });

  function toggleAudio() {
    const next = !muted;
    setMuted(next);
    player.muted = next;
  }

  async function start() {
    if (!name.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await registerDevice(name.trim(), accent);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.replace('/(tabs)');
    } catch (err: any) {
      const message = String(err?.message || 'unknown_error');
      setError(
        message === 'handle_taken' ? 'ID sedang digunakan. Coba lagi.' :
        message === 'invalid_body' ? 'Data pendaftaran tidak valid. Perbarui aplikasi lalu coba lagi.' :
        message === 'network_error' ? 'Tidak dapat menjangkau server. Periksa internet.' :
        'Pendaftaran gagal: ' + message,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        contentFit="cover"
        nativeControls={false}
        allowsPictureInPicture={false}
      />
      <View pointerEvents="none" style={styles.scrim} />
      <SafeAreaView style={styles.safe}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flex}
        >
          <ScrollView
            contentContainerStyle={styles.scroll}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.topline}>
              <View style={styles.liveDot} />
              <Text style={styles.kicker}>PRIVATE MESSAGING NETWORK</Text>
              <Pressable onPress={toggleAudio} style={styles.audioButton} accessibilityRole="button">
                <Text style={styles.audioText}>{muted ? 'AUDIO OFF' : 'AUDIO ON'}</Text>
              </Pressable>
            </View>

            <View style={styles.hero}>
              <Text style={styles.eyebrow}>NO PHONE NUMBER. NO NOISE.</Text>
              <Text style={styles.title}>M4ZK<Text style={styles.titleAccent}>1</Text>PL4Y</Text>
              <Text style={styles.subtitle}>YOUR IDENTITY. YOUR DEVICE. YOUR CONVERSATION.</Text>
            </View>

            <View style={styles.formCard}>
              <View style={styles.cardHeading}>
                <View>
                  <Text style={styles.cardTitle}>BUAT IDENTITAS</Text>
                  <Text style={styles.cardSub}>Mulai dalam beberapa detik</Text>
                </View>
                <Text style={styles.step}>01 / 01</Text>
              </View>

              <View style={styles.identityPreview}>
                <View style={styles.avatarWrap}>
                  <Avatar name={name || 'MZ'} accent={accent} size={58} ring />
                </View>
                <View style={styles.previewCopy}>
                  <Text style={styles.previewLabel}>PREVIEW PROFIL</Text>
                  <Text style={styles.previewName}>{name.trim() || 'Nama kamu'}</Text>
                  <Text style={styles.previewHint}>ID dibuat otomatis di perangkat ini</Text>
                </View>
                <View style={styles.secureMark}><Text style={styles.secureMarkText}>●</Text></View>
              </View>

              <Field
                label="Nama tampilan"
                placeholder="Masukkan nama kamu"
                value={name}
                onChangeText={setName}
                maxLength={24}
                autoCapitalize="words"
              />

              <Text style={styles.label}>PILIH WARNA IDENTITAS</Text>
              <View style={styles.swatches}>
                {ACCENTS.map((c) => (
                  <Pressable
                    key={c}
                    accessibilityRole="button"
                    accessibilityLabel={'Pilih warna ' + c}
                    onPress={() => { setAccent(c); Haptics.selectionAsync(); }}
                    style={[styles.swatchOuter, accent === c && styles.swatchSelected]}
                  >
                    <View style={[styles.swatch, { backgroundColor: c }]} />
                  </Pressable>
                ))}
              </View>

              <View style={styles.privacyNote}>
                <Text style={styles.lock}>◇</Text>
                <Text style={styles.privacyText}>
                  Kunci privat dibuat dan disimpan di HP kamu. Kunci privat tidak dikirim ke server.
                  Simpan perangkat ini dengan aman.
                </Text>
              </View>

              {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}

              <BrutalButton
                label={busy ? 'MENYIAPKAN AKUN...' : 'BUAT AKUN  →'}
                onPress={start}
                loading={busy}
                disabled={!name.trim() || busy}
                style={styles.cta}
              />
              <Text style={styles.terms}>DENGAN MELANJUTKAN, KAMU MEMBUAT IDENTITAS PERANGKAT M4ZK.</Text>
            </View>

            <View style={styles.footer}>
              <Text style={styles.footerBrand}>M4ZK1PL4Y</Text>
              <Text style={styles.footerMeta}>PRIVATE BY DESIGN · BUILT FOR CONNECTION</Text>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#050607' },
  flex: { flex: 1 },
  safe: { flex: 1 },
  scroll: { flexGrow: 1, paddingHorizontal: 22, paddingTop: 12, paddingBottom: 24 },
  scrim: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(3,5,8,0.70)' },
  topline: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 30 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: '#FF4D35' },
  kicker: { color: '#D5D9E0', fontFamily: 'monospace', fontSize: 9, letterSpacing: 1.4, flex: 1 },
  audioButton: { borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
  audioText: { color: '#F4F6F8', fontFamily: 'monospace', fontSize: 9, letterSpacing: 1 },
  hero: { marginBottom: 24 },
  eyebrow: { color: '#FF624D', fontFamily: 'monospace', fontSize: 10, letterSpacing: 2, marginBottom: 7 },
  title: { color: '#FFFFFF', fontSize: 43, lineHeight: 49, fontWeight: '900', letterSpacing: -2 },
  titleAccent: { color: '#FF553F' },
  subtitle: { color: '#B8C0CA', fontFamily: 'monospace', fontSize: 9, letterSpacing: 1.2, marginTop: 8 },
  formCard: { backgroundColor: 'rgba(10,14,19,0.91)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)', borderRadius: 20, padding: 18 },
  cardHeading: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 },
  cardTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: 1 },
  cardSub: { color: '#8F9AA8', fontSize: 11, marginTop: 4 },
  step: { color: '#FF6B55', fontFamily: 'monospace', fontSize: 10, letterSpacing: 1 },
  identityPreview: { flexDirection: 'row', alignItems: 'center', padding: 12, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.06)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.09)', marginBottom: 18 },
  avatarWrap: { marginRight: 12 },
  previewCopy: { flex: 1 },
  previewLabel: { color: '#8793A2', fontFamily: 'monospace', fontSize: 8, letterSpacing: 1.2 },
  previewName: { color: '#FFFFFF', fontSize: 15, fontWeight: '700', marginTop: 3 },
  previewHint: { color: '#A0AAB6', fontSize: 9, marginTop: 3 },
  secureMark: { width: 24, height: 24, borderRadius: 12, backgroundColor: 'rgba(48,214,155,0.16)', alignItems: 'center', justifyContent: 'center' },
  secureMarkText: { color: '#42D6A4', fontSize: 10 },
  label: { color: '#C5CCD5', fontFamily: 'monospace', fontSize: 9, letterSpacing: 1.4, marginTop: 18, marginBottom: 9 },
  swatches: { flexDirection: 'row', gap: 10, marginBottom: 17 },
  swatchOuter: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: 'transparent' },
  swatchSelected: { borderColor: '#FFFFFF' },
  swatch: { width: 23, height: 23, borderRadius: 12 },
  privacyNote: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 12, backgroundColor: 'rgba(64,196,150,0.09)', borderWidth: 1, borderColor: 'rgba(64,196,150,0.20)' },
  lock: { color: '#54D7A7', fontSize: 18 },
  privacyText: { color: '#C4D5D0', fontSize: 10, lineHeight: 16, flex: 1 },
  error: { color: '#FF8A78', fontSize: 11, marginTop: 12 },
  cta: { marginTop: 18, borderRadius: 12 },
  terms: { color: '#76818E', fontFamily: 'monospace', fontSize: 8, lineHeight: 13, letterSpacing: 0.6, textAlign: 'center', marginTop: 12 },
  footer: { alignItems: 'center', paddingTop: 20, gap: 4 },
  footerBrand: { color: 'rgba(255,255,255,0.8)', fontFamily: 'monospace', fontWeight: '800', letterSpacing: 3, fontSize: 10 },
  footerMeta: { color: 'rgba(255,255,255,0.48)', fontFamily: 'monospace', fontSize: 7, letterSpacing: 1 },
});
