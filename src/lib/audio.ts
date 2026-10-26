// Browser-only: turn a recorded clip (webm/opus, mp4...) into 16 kHz mono PCM16 WAV, the only format
// Muse Voice Transcribe accepts.
export async function aWav(clip: Blob, hz = 16000): Promise<Blob> {
  const ctx = new AudioContext();
  try {
    const buf = await ctx.decodeAudioData(await clip.arrayBuffer());
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(buf.duration * hz)), hz);
    const src = off.createBufferSource();
    src.buffer = buf;
    src.connect(off.destination);
    src.start();
    const mono = (await off.startRendering()).getChannelData(0);
    const out = new DataView(new ArrayBuffer(44 + mono.length * 2));
    const txt = (o: number, s: string) => { for (let i = 0; i < s.length; i++) out.setUint8(o + i, s.charCodeAt(i)); };
    txt(0, "RIFF"); out.setUint32(4, 36 + mono.length * 2, true); txt(8, "WAVE");
    txt(12, "fmt "); out.setUint32(16, 16, true); out.setUint16(20, 1, true); out.setUint16(22, 1, true);
    out.setUint32(24, hz, true); out.setUint32(28, hz * 2, true); out.setUint16(32, 2, true); out.setUint16(34, 16, true);
    txt(36, "data"); out.setUint32(40, mono.length * 2, true);
    for (let i = 0; i < mono.length; i++) {
      const s = Math.max(-1, Math.min(1, mono[i]));
      out.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([out.buffer], { type: "audio/wav" });
  } finally {
    await ctx.close();
  }
}
