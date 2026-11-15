import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router } from 'expo-router';
import { api } from '../../lib/api';
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
  const { id, mode, handle, incoming, callId: incomingCallId, offer } = useLocalSearchParams<{ id: string; mode?: string; handle?: string; incoming?: string; callId?: string; offer?: string }>();
  const { session } = useSession();
  const [status, setStatus] = useState('menyambung...');
  const [muted, setMuted] = useState(false);
  const [camOff, setCamOff] = useState(false);
  const [remoteUrl, setRemoteUrl] = useState<string | null>(null);
  const [localUrl, setLocalUrl] = useState<string | null>(null);
  const [activeCallId, setActiveCallId] = useState(String(incomingCallId || ''));


  const rtc = useRef<WebRTC | null>(null);
  const pc = useRef<any>(null);
  const stream = useRef<any>(null);
  const pendingIce = useRef<any[]>([]);
  const signalCursor = useRef(0);
  const callId = useRef(String(incomingCallId || `call_${Math.random().toString(36).slice(2, 10)}`));

  const video = mode === 'video';

  useEffect(() => {
    let cancelled = false;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let pollBusy = false;
    let peer: any = null;
    let media: any = null;
    let callKey = String(incomingCallId || '');

    async function start() {
      try {
        if (!session) throw new Error('session_required');
        if (!callKey) {
          const created = await api.createCall(String(id), video ? 'video' : 'audio');
          callKey = created.callId;
        }
        if (cancelled) return;
        callId.current = callKey;
        setActiveCallId(callKey);

        const mod: WebRTC = require('react-native-webrtc');
        rtc.current = mod;
        media = await mod.mediaDevices.getUserMedia({
          audio: true,
          video: video ? { facingMode: 'user' } : false,
        });
        if (cancelled) {
          media.getTracks().forEach((track: any) => track.stop());
          return;
        }
        stream.current = media;
        setLocalUrl(media.toURL());

        peer = new mod.RTCPeerConnection(ICE);
        pc.current = peer;
        media.getTracks().forEach((track: any) => peer.addTrack(track, media));

        peer.onicecandidate = (event: any) => {
          if (event.candidate) {
            api.sendCallSignal(callKey, 'ice', { candidate: event.candidate }).catch(() => {});
          }
        };
        peer.ontrack = (event: any) => {
          if (event.streams?.[0]) setRemoteUrl(event.streams[0].toURL());
          setStatus('tersambung');
        };
        peer.onconnectionstatechange = () => {
          if (peer.connectionState === 'connected') setStatus('tersambung');
          if (['failed', 'disconnected'].includes(peer.connectionState)) setStatus('koneksi terputus');
        };

        if (incoming !== '1') {
          const outgoingOffer = await peer.createOffer();
          await peer.setLocalDescription(outgoingOffer);
          await api.sendCallSignal(callKey, 'offer', { sdp: outgoingOffer, mode: video ? 'video' : 'audio' });
          setStatus('memanggil...');
        } else {
          setStatus('menunggu penawaran panggilan...');
        }

        const poll = async () => {
          if (pollBusy || cancelled) return;
          pollBusy = true;
          try {
            const result = await api.pollCallSignals(callKey, signalCursor.current);
            signalCursor.current = Math.max(signalCursor.current, result.cursor || 0);
            for (const signal of result.signals) {
              if (signal.type === 'offer' && incoming === '1' && !peer.remoteDescription) {
                await peer.setRemoteDescription(new mod.RTCSessionDescription(signal.payload.sdp));
                for (const candidate of pendingIce.current.splice(0)) {
                  await peer.addIceCandidate(new mod.RTCIceCandidate(candidate)).catch(() => {});
                }
                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);
                await api.sendCallSignal(callKey, 'answer', { sdp: answer });
                setStatus('menjawab panggilan...');
              } else if (signal.type === 'answer' && incoming !== '1' && !peer.remoteDescription) {
                await peer.setRemoteDescription(new mod.RTCSessionDescription(signal.payload.sdp));
                for (const candidate of pendingIce.current.splice(0)) {
                  await peer.addIceCandidate(new mod.RTCIceCandidate(candidate)).catch(() => {});
                }
                setStatus('menghubungkan...');
              } else if (signal.type === 'ice' && signal.payload?.candidate) {
                const candidate = signal.payload.candidate;
                if (!peer.remoteDescription) pendingIce.current.push(candidate);
                else await peer.addIceCandidate(new mod.RTCIceCandidate(candidate)).catch(() => {});
              } else if (signal.type === 'end' || signal.type === 'reject') {
                setStatus(signal.type === 'reject' ? 'panggilan ditolak' : 'panggilan berakhir');
                hangup(false);
                return;
              }
            }
            if (result.status === 'ended' || result.status === 'rejected') {
              setStatus('panggilan berakhir');
              hangup(false);
            }
          } catch {
            // A transient network failure is retried on the next poll.
          } finally {
            pollBusy = false;
          }
        };
        await poll();
        pollTimer = setInterval(() => { void poll(); }, 900);
      } catch (error) {
        setStatus(error instanceof Error && error.message === 'session_required'
          ? 'sesi tidak tersedia'
          : 'gagal memulai panggilan');
      }
    }

    void start();
    return () => {
      cancelled = true;
      if (pollTimer) clearInterval(pollTimer);
      media?.getTracks().forEach((track: any) => track.stop());
      peer?.close?.();
      stream.current = null;
      pc.current = null;
    };
  }, [id, video, session?.user.id, incoming, incomingCallId]);

  function hangup(notifyPeer = true) {
    if (notifyPeer && activeCallId) api.sendCallSignal(activeCallId, 'end').catch(() => {});
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

        <Pressable style={[styles.ctrl, styles.ctrlEnd]} onPress={() => hangup()}>
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
