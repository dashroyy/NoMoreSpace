// Proximity voice chat. Browsers connect directly to each other (WebRTC); the
// server only passes the connection details along. The closer someone is on
// the ship, the louder they are. During meetings everyone hears everyone, and
// at night everyone is asleep (muted).
import { socket, store } from './store.js';
import { problem, toast } from './util.js';
import { audioContext } from './audio.js';

const HEAR_RADIUS = 11;
let localStream = null;
let enabled = false;
const peers = new Map(); // id -> { pc, audio }
const remoteOn = new Set();
let world = null;

// Who is talking: a level meter on each voice (and your own mic), so their
// avatar and seat light up. Meters are never connected to the speakers.
const meters = new Map(); // id -> { analyser, data, loudUntil }
let meterCtx = null;

function meter(id, stream) {
  try {
    meterCtx ||= audioContext() || new (window.AudioContext || window.webkitAudioContext)();
    const analyser = meterCtx.createAnalyser();
    analyser.fftSize = 512;
    meterCtx.createMediaStreamSource(stream).connect(analyser);
    meters.set(id, { analyser, data: new Float32Array(analyser.fftSize), loudUntil: 0 });
  } catch (err) {
    console.warn('voice meter', err);
  }
}

// Overall voice chat volume (the Settings slider), 0..1.
let voiceLevel = 1;
try {
  const v = parseFloat(localStorage.getItem('nms-vol-voice'));
  if (Number.isFinite(v)) voiceLevel = Math.max(0, Math.min(1, v));
} catch {}
export function getVoiceVolume() {
  return voiceLevel;
}
export function setVoiceVolume(value) {
  voiceLevel = Math.max(0, Math.min(1, Number(value) || 0));
  try {
    localStorage.setItem('nms-vol-voice', String(voiceLevel));
  } catch {}
  updateVolumes();
}

// Your own volume for each player (mute a loud mic, or turn someone down). Just for you.
const userVolume = new Map(); // id -> 0..1
export function peerVolume(id) {
  return userVolume.has(id) ? userVolume.get(id) : 1;
}
export function setPeerVolume(id, level) {
  userVolume.set(id, Math.max(0, Math.min(1, level)));
  updateVolumes();
}
export function hasVoice(id) {
  return peers.has(id);
}

// ids of everyone talking right now (short pauses between words still count)
export function speakingIds() {
  const now = performance.now();
  const out = new Set();
  const night = store.state?.phase === 'night' && !store.state?.you?.isCaptain;
  for (const [id, m] of meters) {
    if (id === store.me && night) continue; // your mic is muted at night
    m.analyser.getFloatTimeDomainData(m.data);
    let sum = 0;
    for (const v of m.data) sum += v * v;
    if (Math.sqrt(sum / m.data.length) > 0.02) m.loudUntil = now + 350;
    if (now < m.loudUntil) out.add(id);
  }
  return out;
}

export function initVoice(w) {
  world = w;
  socket.on('voice', ({ id, on }) => {
    if (on) {
      remoteOn.add(id);
      if (enabled) socket.emit('rtc', { to: id, data: { hello: true } });
      if (enabled && store.me < id) call(id);
    } else {
      remoteOn.delete(id);
      close(id);
    }
  });
  socket.on('rtc', async ({ from, data }) => {
    if (!enabled) return;
    try {
      if (data.hello) {
        remoteOn.add(from);
        if (store.me < from && !peers.has(from)) call(from);
        return;
      }
      if (data.sdp) {
        const peer = ensure(from);
        await peer.pc.setRemoteDescription(data.sdp);
        if (data.sdp.type === 'offer') {
          const answer = await peer.pc.createAnswer();
          await peer.pc.setLocalDescription(answer);
          socket.emit('rtc', { to: from, data: { sdp: peer.pc.localDescription } });
        }
      }
      if (data.candidate) await ensure(from).pc.addIceCandidate(data.candidate);
    } catch (err) {
      console.warn('voice', err);
    }
  });
  setInterval(updateVolumes, 200);
}

export function voiceEnabled() {
  return enabled;
}

export async function toggleVoice() {
  if (enabled) {
    enabled = false;
    meters.delete(store.me);
    socket.emit('voice', { on: false });
    for (const id of [...peers.keys()]) close(id);
    localStream?.getTracks().forEach((t) => t.stop());
    localStream = null;
    return false;
  }
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch {
    problem('Microphone blocked. Allow mic access in your browser to use voice chat.');
    return false;
  }
  enabled = true;
  meter(store.me, localStream);
  socket.emit('voice', { on: true });
  toast('🎙️ Voice on. People near you on the ship can hear you.');
  return true;
}

function ensure(id) {
  if (peers.has(id)) return peers.get(id);
  const pc = new RTCPeerConnection({ iceServers: store.data.iceServers });
  localStream?.getTracks().forEach((t) => pc.addTrack(t, localStream));
  const audio = new Audio();
  audio.autoplay = true;
  pc.onicecandidate = (e) => e.candidate && socket.emit('rtc', { to: id, data: { candidate: e.candidate } });
  pc.ontrack = (e) => {
    audio.srcObject = e.streams[0];
    audio.play().catch(() => {});
    meter(id, e.streams[0]);
  };
  pc.onconnectionstatechange = () => {
    if (['failed', 'closed'].includes(pc.connectionState)) close(id);
  };
  const peer = { pc, audio };
  peers.set(id, peer);
  return peer;
}

async function call(id) {
  const peer = ensure(id);
  const offer = await peer.pc.createOffer();
  await peer.pc.setLocalDescription(offer);
  socket.emit('rtc', { to: id, data: { sdp: peer.pc.localDescription } });
}

function close(id) {
  const peer = peers.get(id);
  if (!peer) return;
  peer.pc.close();
  peer.audio.srcObject = null;
  peers.delete(id);
  meters.delete(id);
}

function updateVolumes() {
  const state = store.state;
  if (!state || !enabled) return;
  const phase = state.phase;
  const night = phase === 'night';
  localStream?.getAudioTracks().forEach((t) => (t.enabled = !night || !!state.you?.isCaptain));
  const pos = world?.positions() || {};
  const mine = pos[store.me];
  const captainId = state.you?.isCaptain ? store.me : null;
  for (const [id, peer] of peers) {
    let volume = 1;
    if (night) volume = 0;
    else if (phase === 'roam' && mine && pos[id] && !captainId) {
      const d = Math.hypot(pos[id].x - mine.x, pos[id].z - mine.z);
      volume = Math.max(0, Math.min(1, 1 - (d - 2.5) / (HEAR_RADIUS - 2.5)));
    } else if (phase === 'roam' && !pos[id]) volume = 1; // the Captain speaks over the intercom
    peer.audio.volume = volume * peerVolume(id) * voiceLevel;
  }
}
