import { arrayBufferToBase64, base64ToInt16, downsamplePcm, encodeWav, float32ToPcm16Base64 } from "../audio.encoder";

describe("audio.encoder", () => {
  describe("downsamplePcm", () => {
    it("should keep samples when target rate is not lower", () => {
      const samples = new Float32Array([0.1, 0.2, 0.3]);
      expect(downsamplePcm(samples, 16000, 16000)).toBe(samples);
      expect(downsamplePcm(samples, 16000, 48000)).toBe(samples);
    });

    it("should reduce sample count proportionally", () => {
      const samples = new Float32Array(48000); // 1 second @ 48kHz
      const result = downsamplePcm(samples, 48000, 16000);
      expect(result.length).toBe(16000);
    });

    it("should interpolate values", () => {
      const samples = new Float32Array([0, 1, 0, 1]);
      const result = downsamplePcm(samples, 4, 2);
      expect(result.length).toBe(2);
      expect(result[0]).toBe(0); // exact first sample
    });
  });

  describe("encodeWav", () => {
    it("should produce a valid RIFF/WAVE header", () => {
      const samples = new Float32Array([0, 0.5, -0.5, 1]);
      const wav = encodeWav(samples, 16000);
      const view = new DataView(wav);
      const str = (offset: number, len: number) =>
        String.fromCharCode(...new Uint8Array(wav.slice(offset, offset + len)));

      expect(wav.byteLength).toBe(44 + samples.length * 2);
      expect(str(0, 4)).toBe("RIFF");
      expect(str(8, 4)).toBe("WAVE");
      expect(str(12, 4)).toBe("fmt ");
      expect(str(36, 4)).toBe("data");
      expect(view.getUint16(20, true)).toBe(1); // PCM
      expect(view.getUint16(22, true)).toBe(1); // mono
      expect(view.getUint32(24, true)).toBe(16000); // sample rate
      expect(view.getUint16(34, true)).toBe(16); // bits per sample
      expect(view.getUint32(40, true)).toBe(samples.length * 2); // data size
    });

    it("should clamp out-of-range samples", () => {
      const wav = encodeWav(new Float32Array([2, -2]), 16000);
      const view = new DataView(wav);
      expect(view.getInt16(44, true)).toBe(0x7fff);
      expect(view.getInt16(46, true)).toBe(-0x8000);
    });
  });

  describe("PCM16 base64 round trip", () => {
    it("should encode and decode PCM16 preserving values", () => {
      const samples = new Float32Array([0, 0.25, -0.25, 0.999, -1]);
      const b64 = float32ToPcm16Base64(samples);
      const decoded = base64ToInt16(b64);

      expect(decoded.length).toBe(samples.length);
      expect(decoded[0]).toBe(0);
      expect(decoded[1]).toBeCloseTo(0.25 * 0x7fff, -1);
      expect(decoded[2]).toBeCloseTo(-0.25 * 0x8000, -1);
      expect(decoded[4]).toBe(-0x8000);
    });

    it("should handle large buffers (chunked btoa)", () => {
      const samples = new Float32Array(100_000).fill(0.5);
      const b64 = float32ToPcm16Base64(samples);
      const decoded = base64ToInt16(b64);
      expect(decoded.length).toBe(samples.length);
      expect(decoded[99_999]).toBeCloseTo(0.5 * 0x7fff, -1);
    });
  });

  describe("arrayBufferToBase64", () => {
    it("should encode bytes to base64", () => {
      const bytes = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
      expect(arrayBufferToBase64(bytes.buffer)).toBe(btoa("Hello"));
    });
  });
});
