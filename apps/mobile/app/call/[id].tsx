import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { api } from '../../lib/api';
import { getSocket } from '../../lib/socket';
import { useSession } from '../../lib/identity';
import { colors, space, type, border, radius } from '../../lib/theme';

type WebRTC = {
  RTCPeerConnection: any;
  RTCView: any;
  mediaDevices: any;
};

const ICE = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
};

export default function Call() {
  const { id, mode, handle } = useLocalSearchParams<{ id: string; mode?: string; handle?: string }>();
  const { session } = useSession();
  const [status, setStatus] = useState('menyambung...');
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);

  const rtc = useRef<WebRTC | null>(null);
  const pc = useRef<any>(null);
  const stream = useRef<any>(null);
  const callId = useRef(`call_${Math.random().toString(36).slice(2, 10)}`);

  const video = mode === 'video';

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let mod: any;
      try {
        mod = require('react-native-webrtc');
      } catch {
        setStatus('WebRTC belum ada — pakai dev build');
        return;
      }
      rtc.current = mod;

      const socket = getSocket();
      if (!socket || !session) return;

      const media = await mod.mediaDevices.getUserMedia({
        audio: true,
        video: video ? { facingMode: 'user' } : false,
      });
      if (cancelled) return;

      stream.current = media;
      setLocalUrl(media.toURL());

      const peer = new mod.RTCPeerConnection(ICE);
      pc.current = peer;

      media.getTracks().forEach((track: any) => peer.addTrack(track, media));

      peer.onicecandidate = (event: any) => {
        if (event.candidate) {
          socket.emit('call:ice', { to: String(id), callId: callId.current, candidate: event.candidate });
        }
      };

      peer.ontrack = (event: any) => {
        setRemoteUrl(event.streams[0].toURL());
        setStatus('tersambung');
      };

      peer.onconnectionstatechange = () => {
        if (peer.connectionState === 'connected') setStatus('tersambung');
        if (['failed', 'disconnected'].includes(peer.connectionState)) setStatus('terputus');
      };

      const onAnswer = async ({ sdp }: any) => {
        await peer.setRemoteDescription(new mod.RTCSessionDescription(sdp));
      };
      const onIce = async ({ candidate }: any) => {
        try {
          await peer.addIceCandidate(new mod.RTCIceCandidate(candidate));
        } catch {
          /* late candidate */
        }
      };
      const onEnd = () => hangup();

      socket.on('call:answer', onAnswer);
      socket.on('call:ice', onIce);
      socket.on('call:end', onEnd);

      const offer = await peer.createOffer();
      await peer.setLocalDescription(offer);
      socket.emit('call:offer', {
        to: String(id),
        callId: callId.current,
        sdp: offer,
        mode: video ? 'video' : 'audio',
      });

      return () => {
        socket.off('call:answer', onAnswer);
        socket.off('call:ice', onIce);
        socket.off('call:end', onEnd);
      };
    })();

    return () => {
      cancelled = true;
      stream.current?.getTracks().forEach((t: any) => t.stop());
      pc.current?.close?.();
    };
  }, [id, video, session?.user.id]);

  function hangup() {
    getSocket()?.emit('call:end', { to: String(id), callId: callId.current });
    stream.current?.getTracks().forEach((t: any) => t.stop());
    pc.current?.close?.();
    router.back();
  }

  function toggleMute() {
    stream.current?.getAudioTracks().forEach((t: any) => {
      t.enabled = muted;
    });
    setMuted(!muted);
  }

  function toggleCam() {
    stream.current?.getVideoTracks().forEach((t: any) => {
      t.enabled = camOff;
    });
    setCamOff(!camOff);
  }

  const RTCView = rtc.current?.RTCView;

  return (
    <SafeAreaView style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.kicker}>{video ? 'VIDEO CALL' : 'VOICE CALL'}</Text>
        <Text style={styles.who}>{handle ? `@${handle}` : 'panggilan'}</Text>
        <Text style={styles.status}>{status}</Text>
      </View>

      <View style={styles.stage}>
        {remoteUrl && RTCView ? (
          <RTCView streamURL={remoteUrl} style={styles.remote} objectFit="cover" />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderGlyph}>{video ? '▣' : '☏'}</Text>
            <Text style={styles.placeholderText}>{status}</Text>
          </View>
        )}

        {localUrl && video && RTCView ? (
          <View style={styles.pip}>
            <RTCView streamURL={localUrl} style={styles.pipVideo} objectFit="cover" />
          </View>
        ) : null}
      </View>

      <View style={styles.controls}>
        <Pressable style={[styles.ctrl, muted && styles.ctrlOn]} onPress={toggleMute}>
          <Text style={styles.ctrlGlyph}>{muted ? '✕' : '◍'}</Text>
          <Text style={styles.ctrlLabel}>{muted ? 'BISU' : 'MIC'}</Text>
        </Pressable>

        {video ? (
          <Pressable style={[styles.ctrl, camOff && styles.ctrlOn]} onPress={toggleCam}>
            <Text style={styles.ctrlGlyph}>{camOff ? '✕' : '▣'}</Text>
            <Text style={styles.ctrlLabel}>KAMERA</Text>
          </Pressable>
        ) : null}

        <Pressable style={[styles.ctrl, styles.ctrlEnd]} onPress={hangup}>
          <Text style={styles.ctrlGlyph}>■</Text>
          <Text style={styles.ctrlLabel}>TUTUP</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { padding: space.lg, borderBottomWidth: 3, borderBottomColor: colors.line, gap: space.xs },
  kicker: { ...type.label, color: colors.accent },
  who: { ...type.display, fontSize: 24, color: colors.text },
  status: { color: colors.textDim, fontFamily: 'monospace', fontSize: 12 },
  stage: { flex: 1, padding: space.md },
  remote: { flex: 1, borderRadius: radius.sm, backgroundColor: colors.panel },
  placeholder: {
    flex: 1,
    ...border.thin,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.md,
  },
  placeholderGlyph: { fontSize: 54, color: colors.accent },
  placeholderText: { color: colors.textDim, fontFamily: 'monospace', fontSize: 12 },
  pip: {
    position: 'absolute',
    right: space.lg,
    bottom: space.lg,
    width: 110,
    height: 150,
    borderWidth: 3,
    borderColor: colors.accent,
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  pipVideo: { flex: 1 },
  controls: { flexDirection: 'row', gap: space.md, padding: space.lg, justifyContent: 'center' },
  ctrl: {
    ...border.thick,
    borderRadius: radius.sm,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    gap: space.xs,
    minWidth: 84,
  },
  ctrlOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  ctrlEnd: { backgroundColor: colors.danger, borderColor: colors.danger },
  ctrlGlyph: { fontSize: 20, color: colors.text },
  ctrlLabel: { ...type.label, fontSize: 9, color: colors.text },
});
