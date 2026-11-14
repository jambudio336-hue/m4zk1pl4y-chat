import { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Alert, Pressable } from 'react-native';
import { router } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { Field } from '../../components/Field';
import { BrutalButton } from '../../components/BrutalButton';
import { Avatar } from '../../components/Avatar';
import { api } from '../../lib/api';
import { useSession, updateUser, signOut, wipeDevice } from '../../lib/identity';
import { colors, space, type, border, radius, ACCENTS } from '../../lib/theme';

export default function Settings() {
  const { session } = useSession();
  const [name, setName] = useState(session?.user.displayName ?? '');
  const [bio, setBio] = useState(session?.user.bio ?? '');
  const [accent, setAccent] = useState(session?.user.accent ?? ACCENTS[0]);
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  if (!session) return null;

  async function save() {
    setSaving(true);
    try {
      const res = await api.patchMe({ displayName: name.trim(), bio: bio.trim(), accent });
      updateUser({ ...session!.user, ...res.user });
      Alert.alert('TERSIMPAN', 'Profil diupdate.');
    } catch {
      Alert.alert('GAGAL', 'Coba lagi.');
    } finally {
      setSaving(false);
    }
  }

  async function chooseAvatar() {
    if (uploadingAvatar) return;
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) { Alert.alert('IZIN GALERI','Izinkan akses galeri untuk memilih foto profil.'); return; }
      const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes:['images'], allowsEditing:true, aspect:[1,1], quality:0.68, base64:true });
      if (result.canceled || !result.assets[0]?.base64) return;
      setUploadingAvatar(true);
      const asset=result.assets[0];
      const response=await api.uploadAvatar(asset.base64,String(asset.mimeType || 'image/jpeg'));
      updateUser({ ...session!.user, ...response.user });
      Alert.alert('FOTO DIPERBARUI','Foto profil sekarang tersimpan dan bisa dilihat kontakmu.');
    } catch (error:any) { Alert.alert('UPLOAD GAGAL',error?.message||'Periksa koneksi lalu coba lagi.'); }
    finally { setUploadingAvatar(false); }
  }

  async function removeAvatar() {
    try { const response=await api.deleteAvatar(); updateUser({ ...session!.user, ...response.user }); }
    catch (error:any) { Alert.alert('GAGAL',error?.message||'Foto profil tidak bisa dihapus.'); }
  }

  async function logout() {
    await signOut();
    router.replace('/onboarding');
  }

  function destroy() {
    Alert.alert('HAPUS AKUN', 'ID & kunci di HP ini hilang permanen. Lanjut?', [
      { text: 'BATAL', style: 'cancel' },
      {
        text: 'HAPUS',
        style: 'destructive',
        onPress: async () => {
          try {
            await api.deleteAccount();
            await wipeDevice();
            router.replace('/onboarding');
          } catch {
            Alert.alert(
              'PENGHAPUSAN GAGAL',
              'Server tidak mengonfirmasi penghapusan akun. Data dan kunci di perangkat tetap disimpan; periksa koneksi lalu coba lagi.',
            );
          }
        },
      },
    ]);
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: space.lg, paddingBottom: space.xl }}>
      <View style={styles.identity}>
        <Pressable onPress={chooseAvatar} disabled={uploadingAvatar}><Avatar name={name || 'MZ'} accent={accent} size={72} ring imageUrl={session.user.avatarUrl} /></Pressable>
        <View>
          <Text style={styles.handle}>{session.user.handle}</Text>
          <Text style={styles.sub}>ID lo — jangan share ke orang random</Text>
          <Pressable onPress={chooseAvatar} disabled={uploadingAvatar}><Text style={styles.avatarAction}>{uploadingAvatar?'MENGUNGGAH FOTO...':'GANTI FOTO PROFIL'}</Text></Pressable>
          {session.user.avatarUrl ? <Pressable onPress={removeAvatar}><Text style={styles.removeAvatar}>HAPUS FOTO</Text></Pressable> : null}
        </View>
      </View>

      <View style={styles.actions}>
        <BrutalButton compact label="LIHAT QR" onPress={() => router.push('/myqr')} />
        <BrutalButton compact variant="ghost" label="SCAN" onPress={() => router.push('/scan')} />
      </View>

      <Field label="Nama tampilan" value={name} onChangeText={setName} maxLength={24} />
      <Field
        label="Bio"
        value={bio}
        onChangeText={setBio}
        maxLength={120}
        multiline
        hint={`${bio.length}/120`}
      />

      <Text style={styles.label}>Warna aksen</Text>
      <View style={styles.swatches}>
        {ACCENTS.map((c) => (
          <Pressable
            key={c}
            onPress={() => setAccent(c)}
            style={[styles.swatch, { backgroundColor: c }, accent === c && styles.swatchActive]}
          />
        ))}
      </View>

      <BrutalButton label={saving ? 'MENYIMPAN...' : 'SIMPAN PROFIL'} onPress={save} loading={saving} />

      <Text style={styles.section}>AKUN</Text>
      <BrutalButton variant="ghost" label="KELUAR" onPress={logout} />
      <View style={{ height: space.sm }} />
      <BrutalButton variant="danger" label="HAPUS AKUN" onPress={destroy} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    ...border.thin,
    borderRadius: radius.sm,
    padding: space.md,
    backgroundColor: colors.panel,
    marginBottom: space.md,
  },
  handle: { ...type.display, fontSize: 17, color: colors.accent },
  avatarAction: { color: colors.accent, fontFamily: 'monospace', fontSize: 9, fontWeight: '800', marginTop: 7 },
  removeAvatar: { color: '#FF786B', fontFamily: 'monospace', fontSize: 9, marginTop: 5 },
  sub: { color: colors.textDim, fontFamily: 'monospace', fontSize: 10, marginTop: 2 },
  actions: { flexDirection: 'row', gap: space.sm, marginBottom: space.lg },
  label: { ...type.label, color: colors.textDim, marginBottom: space.sm },
  swatches: { flexDirection: 'row', gap: space.sm, marginBottom: space.lg },
  swatch: { width: 36, height: 36, borderRadius: radius.sm, borderWidth: 2, borderColor: colors.lineDim },
  swatchActive: { borderColor: colors.text, borderWidth: 3 },
  section: { ...type.label, color: colors.textDim, marginTop: space.xl, marginBottom: space.sm },
});
