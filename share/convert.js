/* 영상 변환: HEVC(H.265) 영상은 윈도우 PC에서 화면이 안 나와서, 올리기 전에 H.264로 바꿔요.
   변환은 이 기기의 브라우저 안에서 일어나요. (ffmpeg.wasm, share/vendor/ffmpeg 에 같이 들어 있어요) */
(function () {
  const VENDOR = new URL('vendor/ffmpeg/', document.currentScript.src).href;
  const MP4_RE = /\.(mp4|m4v|mov)$/i;

  const looksLikeMp4 = f => MP4_RE.test(f.name) || /^video\/(mp4|quicktime|x-m4v)$/.test(f.type);

  // 파일 맨 위쪽 상자(box)를 따라가서 moov를 찾고, 그 안에 HEVC 표시(hvc1/hev1)가 있는지 봐요.
  async function isHevc(file) {
    const u8 = async (a, b) => new Uint8Array(await file.slice(a, b).arrayBuffer());
    let p = 0;
    for (let n = 0; n < 64 && p + 8 <= file.size; n++) {
      const h = await u8(p, p + 16);
      const dv = new DataView(h.buffer);
      let size = dv.getUint32(0);
      const type = String.fromCharCode(h[4], h[5], h[6], h[7]);
      if (size === 1) size = Number(dv.getBigUint64(8));
      else if (size === 0) size = file.size - p;
      if (size < 8) return false;
      if (type === 'moov') {
        const body = await u8(p, Math.min(p + size, p + 16 * 1024 * 1024));
        const txt = new TextDecoder('latin1').decode(body);
        return txt.includes('hvc1') || txt.includes('hev1');
      }
      p += size;
    }
    return false;
  }

  function loadScript(src) {
    return new Promise((ok, bad) => {
      const s = document.createElement('script');
      s.src = src; s.onload = ok; s.onerror = () => bad(new Error('변환 도구를 불러오지 못했어요.'));
      document.head.appendChild(s);
    });
  }

  let ffPromise = null;
  function getFfmpeg() {
    if (!ffPromise) {
      ffPromise = (async () => {
        await loadScript(VENDOR + 'ffmpeg.js');
        const ff = new FFmpegWASM.FFmpeg();
        await ff.load({ coreURL: VENDOR + 'ffmpeg-core.js', wasmURL: VENDOR + 'ffmpeg-core.wasm' });
        return ff;
      })().catch(e => { ffPromise = null; throw e; });
    }
    return ffPromise;
  }

  // HEVC 영상을 H.264(+AAC) mp4로 바꿔 새 File로 돌려줘요. onProgress(0~1)
  async function convertToH264(file, onProgress) {
    const ff = await getFfmpeg();
    const onP = ({ progress }) => { if (onProgress && progress >= 0) onProgress(Math.min(1, progress)); };
    ff.on('progress', onP);
    try {
      await ff.writeFile('in.mp4', new Uint8Array(await file.arrayBuffer()));
      const code = await ff.exec([
        '-i', 'in.mp4',
        '-c:v', 'libx264', '-preset', 'superfast', '-crf', '28', '-pix_fmt', 'yuv420p',
        '-c:a', 'aac', '-b:a', '128k',
        '-movflags', '+faststart', '-y', 'out.mp4'
      ]);
      if (code !== 0) throw new Error('변환에 실패했어요.');
      const data = await ff.readFile('out.mp4');
      const name = file.name.replace(/\.[^.]+$/, '') + '.mp4';
      return new File([data], name, { type: 'video/mp4' });
    } finally {
      ff.off('progress', onP);
      try { await ff.deleteFile('in.mp4'); } catch (e) {}
      try { await ff.deleteFile('out.mp4'); } catch (e) {}
    }
  }

  window.VideoFix = { looksLikeMp4, isHevc, convertToH264 };
})();
