import { FLATLINE_FRAME_THRESHOLD } from "../shared/constants";

export interface MicMonitorCallbacks {
  isRunning: () => boolean;
  isSpeakingName: () => boolean;
  isHardwareMuted: () => boolean;
  onHardwareMuteChange: (muted: boolean, customMessage?: string) => void;
  onVuLevel: (percent: number) => void;
}

/**
 * Monitors live microphone input via MediaStreamTrack events AND raw Web Audio
 * time-domain flatline detection (all samples == 128 for ~1.75s) to catch
 * Lenovo/Realtek hardware mic-mute keys.
 *
 * Protected by a monotonic session token so pausing/closing before getUserMedia
 * resolves never leaks an active MediaStreamTrack or AudioContext.
 */
export class MicMonitor {
  private audioCtx: AudioContext | null = null;
  private micStream: MediaStream | null = null;
  private gainNode: GainNode | null = null;
  private vuAnimId: number | null = null;
  private flatlineFrames = 0;
  private sessionToken = 0;

  public async start(initialGain: number, callbacks: MicMonitorCallbacks): Promise<void> {
    this.stop(callbacks.onVuLevel);
    const token = ++this.sessionToken;
    this.flatlineFrames = 0;

    if (!navigator.mediaDevices?.getUserMedia) {
      callbacks.onHardwareMuteChange(true, "⚠️ Microphone API unavailable on this page.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: false,
          autoGainControl: true
        }
      });

      // Guard against async race: user paused/closed before getUserMedia resolved
      if (token !== this.sessionToken || !callbacks.isRunning()) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      this.micStream = stream;
      const audioTrack = stream.getAudioTracks()[0];
      if (!audioTrack || audioTrack.readyState === "ended") {
        callbacks.onHardwareMuteChange(true, "🔇 Microphone disconnected! Check audio device.");
        return;
      }

      if (audioTrack.muted) {
        callbacks.onHardwareMuteChange(true);
      }

      audioTrack.onmute = () => {
        if (token === this.sessionToken && callbacks.isRunning()) {
          callbacks.onHardwareMuteChange(true);
        }
      };
      audioTrack.onunmute = () => {
        this.flatlineFrames = 0;
        if (token === this.sessionToken && callbacks.isRunning()) {
          callbacks.onHardwareMuteChange(false);
        }
      };
      audioTrack.onended = () => {
        if (token === this.sessionToken && callbacks.isRunning()) {
          callbacks.onHardwareMuteChange(
            true,
            "🔇 Mic disconnected! Click Retry after reconnecting."
          );
        }
      };

      const AudioCtxCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtxCtor) return;

      const ctx = new AudioCtxCtor();
      this.audioCtx = ctx;

      const source = ctx.createMediaStreamSource(stream);
      const filter = ctx.createBiquadFilter();
      filter.type = "bandpass";
      filter.frequency.value = 1200;
      filter.Q.value = 0.7;

      const gainNode = ctx.createGain();
      gainNode.gain.value = initialGain;
      this.gainNode = gainNode;

      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;

      // Tap unfiltered input for accurate digital-zero (128) flatline detection
      const rawAnalyser = ctx.createAnalyser();
      rawAnalyser.fftSize = 256;

      source.connect(rawAnalyser);
      source.connect(filter);
      filter.connect(gainNode);
      gainNode.connect(analyser);

      const freqData = new Uint8Array(analyser.frequencyBinCount);
      const timeData = new Uint8Array(rawAnalyser.fftSize);

      const updateMeter = (): void => {
        if (token !== this.sessionToken || !callbacks.isRunning()) {
          callbacks.onVuLevel(0);
          return;
        }

        // 1. Detect hardware-muted digital flatline (all samples identically 128)
        rawAnalyser.getByteTimeDomainData(timeData);
        let maxDev = 0;
        for (let i = 0; i < timeData.length; i++) {
          const d = Math.abs(timeData[i] - 128);
          if (d > maxDev) maxDev = d;
        }

        if (maxDev === 0) {
          if (!callbacks.isSpeakingName()) {
            this.flatlineFrames++;
            if (this.flatlineFrames >= FLATLINE_FRAME_THRESHOLD && !callbacks.isHardwareMuted()) {
              callbacks.onHardwareMuteChange(true);
            }
          }
        } else {
          this.flatlineFrames = 0;
          if (callbacks.isHardwareMuted() && !audioTrack.muted) {
            callbacks.onHardwareMuteChange(false);
          }
        }

        // 2. Render boosted VU bar
        analyser.getByteFrequencyData(freqData);
        let sum = 0;
        for (let i = 0; i < freqData.length; i++) sum += freqData[i];
        const avg = sum / freqData.length;
        const level = maxDev === 0 ? 0 : Math.min(100, Math.round((avg / 128) * 100));
        callbacks.onVuLevel(level);

        this.vuAnimId = requestAnimationFrame(updateMeter);
      };

      updateMeter();
    } catch (err) {
      if (token !== this.sessionToken) return;
      const errName = err instanceof DOMException ? err.name : "";
      const msg =
        errName === "NotFoundError"
          ? "🔇 No microphone detected on this PC."
          : "⚠️ Mic permission blocked or unavailable.";
      callbacks.onHardwareMuteChange(true, msg);
    }
  }

  public setGain(value: number): void {
    if (this.gainNode) {
      this.gainNode.gain.value = value;
    }
  }

  public stop(onVuReset?: (percent: number) => void): void {
    this.sessionToken++;

    if (this.vuAnimId !== null) {
      cancelAnimationFrame(this.vuAnimId);
      this.vuAnimId = null;
    }

    if (this.micStream) {
      this.micStream.getTracks().forEach((track) => {
        track.onmute = null;
        track.onunmute = null;
        track.onended = null;
        track.stop();
      });
      this.micStream = null;
    }

    if (this.audioCtx && this.audioCtx.state !== "closed") {
      this.audioCtx.close().catch(() => {});
    }
    this.audioCtx = null;
    this.gainNode = null;
    this.flatlineFrames = 0;
    onVuReset?.(0);
  }
}
