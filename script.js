const image = document.getElementById('sourceImage');
const canvas = document.getElementById('paint');
const ctx = canvas.getContext('2d', { willReadFrequently: true });
const status = document.getElementById('status');
const nameInput = document.getElementById('nameInput');
const sheetName = document.getElementById('sheetName');
const storageKey = 'panji-asmoro-bangun-worksheet-v1';

let color = '#e84747',
  mode = 'fill',
  boundary = null,
  w = 0,
  h = 0;
let history = [],
  position = -1,
  drawing = false,
  strokeRegion = null,
  lastPoint = null;
let saveTimer;

function message(text) {
  status.textContent = text;
}

function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          name: nameInput.value,
          painting: canvas.toDataURL('image/png'),
        })
      );
    } catch (_) {
      message(
        'Penyimpanan perangkat penuh. Unduh PNG agar karyamu tidak hilang.'
      );
    }
  }, 350);
}

function snapshot() {
  const next = canvas.toDataURL('image/png');
  if (history[position] === next) return;
  history = history.slice(0, position + 1);
  history.push(next);
  if (history.length > 18) history.shift();
  position = history.length - 1;
  save();
}

function restore(data) {
  ctx.clearRect(0, 0, w, h);
  if (!data) {
    save();
    return;
  }
  const saved = new Image();
  saved.onload = () => {
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(saved, 0, 0, w, h);
    save();
  };
  saved.src = data;
}

function selectMode(next) {
  mode = next;
  ['fill', 'brush', 'eraser'].forEach((key) =>
    document
      .getElementById(key + 'Tool')
      .setAttribute('aria-pressed', String(key === next))
  );
}

function point(event) {
  const box = canvas.getBoundingClientRect();
  return {
    x: Math.max(
      0,
      Math.min(w - 1, Math.floor(((event.clientX - box.left) * w) / box.width))
    ),
    y: Math.max(
      0,
      Math.min(h - 1, Math.floor(((event.clientY - box.top) * h) / box.height))
    ),
  };
}

function regionAt(x, y) {
  if (!boundary) return null;
  const start = y * w + x;
  if (boundary[start]) return null;
  const visited = new Uint8Array(w * h),
    queue = new Int32Array(w * h);
  let head = 0,
    tail = 0;
  queue[tail++] = start;
  visited[start] = 1;

  while (head < tail) {
    const i = queue[head++],
      px = i % w;
    const neighbors = [i - w, i + w, px ? i - 1 : -1, px < w - 1 ? i + 1 : -1];
    for (const n of neighbors) {
      if (n >= 0 && n < visited.length && !visited[n] && !boundary[n]) {
        visited[n] = 1;
        queue[tail++] = n;
      }
    }
  }
  return visited;
}

function fill(pointValue) {
  if (!boundary) {
    message(
      'Isi Bidang tidak tersedia untuk gambar ini. Pilih Kuas untuk mewarnai.'
    );
    return;
  }
  const region = regionAt(pointValue.x, pointValue.y);
  if (!region) {
    message('Ketuk bagian putih di dalam garis gambar.');
    return;
  }
  const pixels = ctx.getImageData(0, 0, w, h);
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));
  for (let i = 0; i < region.length; i++) {
    if (!region[i]) continue;
    const p = i * 4;
    pixels.data[p] = rgb[0];
    pixels.data[p + 1] = rgb[1];
    pixels.data[p + 2] = rgb[2];
    pixels.data[p + 3] = 205;
  }
  ctx.putImageData(pixels, 0, 0);
  snapshot();
  message('Bidang berhasil diwarnai!');
}

function dab(p) {
  const r = (Number(document.getElementById('brushSize').value) * w) / 366 / 2;
  const left = Math.max(0, Math.floor(p.x - r)),
    right = Math.min(w - 1, Math.ceil(p.x + r));
  const top = Math.max(0, Math.floor(p.y - r)),
    bottom = Math.min(h - 1, Math.ceil(p.y + r));
  const area = ctx.getImageData(left, top, right - left + 1, bottom - top + 1);
  const rgb = [1, 3, 5].map((i) => parseInt(color.slice(i, i + 2), 16));

  for (let y = top; y <= bottom; y++) {
    for (let x = left; x <= right; x++) {
      if ((x - p.x) ** 2 + (y - p.y) ** 2 > r * r) continue;
      const index = y * w + x;
      if (
        boundary &&
        (boundary[index] || (strokeRegion && !strokeRegion[index]))
      )
        continue;
      const k = ((y - top) * area.width + x - left) * 4;
      if (mode === 'eraser') {
        area.data[k + 3] = 0;
      } else {
        area.data[k] = rgb[0];
        area.data[k + 1] = rgb[1];
        area.data[k + 2] = rgb[2];
        area.data[k + 3] = 220;
      }
    }
  }
  ctx.putImageData(area, left, top);
}

function moveBrush(p) {
  if (!lastPoint) {
    dab(p);
    lastPoint = p;
    return;
  }
  const distance = Math.hypot(p.x - lastPoint.x, p.y - lastPoint.y);
  const steps = Math.max(1, Math.ceil(distance / Math.max(2, (w / 366) * 3)));
  const from = lastPoint;
  for (let i = 1; i <= steps; i++) {
    dab({
      x: from.x + ((p.x - from.x) * i) / steps,
      y: from.y + ((p.y - from.y) * i) / steps,
    });
  }
  lastPoint = p;
}

function prepareBoundary() {
  try {
    const source = document.createElement('canvas');
    source.width = w;
    source.height = h;
    const sourceCtx = source.getContext('2d', { willReadFrequently: true });
    sourceCtx.drawImage(image, 0, 0, w, h);
    const data = sourceCtx.getImageData(0, 0, w, h).data;
    boundary = new Uint8Array(w * h);
    for (let i = 0; i < boundary.length; i++) {
      const p = i * 4;
      boundary[i] =
        data[p] * 0.299 + data[p + 1] * 0.587 + data[p + 2] * 0.114 < 170
          ? 1
          : 0;
    }
  } catch (_) {
    boundary = null;
    message(
      'Pewarnaan kuas tersedia. Browser ini membatasi fitur Isi Bidang pada gambar.'
    );
  }
}

function initializeImage() {
  if (!image.naturalWidth || w) return;
  w = image.naturalWidth;
  h = image.naturalHeight;
  canvas.width = w;
  canvas.height = h;
  prepareBoundary();

  let saved = null;
  try {
    saved = JSON.parse(localStorage.getItem(storageKey) || 'null');
  } catch (_) {}
  if (saved) {
    nameInput.value = saved.name || '';
    sheetName.textContent = nameInput.value;
    if (saved.painting) {
      const old = new Image();
      old.onload = () => {
        ctx.drawImage(old, 0, 0, w, h);
        history = [canvas.toDataURL('image/png')];
        position = 0;
      };
      old.onerror = () => {
        history = [canvas.toDataURL('image/png')];
        position = 0;
      };
      old.src = saved.painting;
      return;
    }
  }
  history = [canvas.toDataURL('image/png')];
  position = 0;
}

image.addEventListener('load', initializeImage);
if (image.complete && image.naturalWidth) initializeImage();

document.getElementById('palette').addEventListener('click', (e) => {
  const button = e.target.closest('[data-color]');
  if (!button) return;
  color = button.dataset.color;
  document
    .querySelectorAll('[data-color]')
    .forEach((el) => el.setAttribute('aria-pressed', String(el === button)));
  if (mode === 'eraser') selectMode('brush');
});

['fill', 'brush', 'eraser'].forEach((key) =>
  document
    .getElementById(key + 'Tool')
    .addEventListener('click', () => selectMode(key))
);

nameInput.addEventListener('input', () => {
  sheetName.textContent = nameInput.value;
  save();
});

canvas.addEventListener('pointerdown', (e) => {
  if (!w) return;
  e.preventDefault();
  const p = point(e);
  if (mode === 'fill') {
    fill(p);
    return;
  }
  drawing = true;
  lastPoint = null;
  strokeRegion = regionAt(p.x, p.y);
  canvas.setPointerCapture(e.pointerId);
  moveBrush(p);
});

canvas.addEventListener('pointermove', (e) => {
  if (drawing) {
    e.preventDefault();
    moveBrush(point(e));
  }
});

function finishStroke() {
  if (!drawing) return;
  drawing = false;
  lastPoint = null;
  strokeRegion = null;
  snapshot();
}

canvas.addEventListener('pointerup', finishStroke);
canvas.addEventListener('pointercancel', finishStroke);

document.getElementById('undo').addEventListener('click', () => {
  if (position > 0) {
    restore(history[--position]);
    message('Langkah terakhir dibatalkan.');
  } else message('Belum ada langkah yang bisa dibatalkan.');
});

document.getElementById('redo').addEventListener('click', () => {
  if (position < history.length - 1) {
    restore(history[++position]);
    message('Langkah diterapkan kembali.');
  } else message('Belum ada langkah yang bisa diulangi.');
});

document
  .getElementById('reset')
  .addEventListener('click', () =>
    document.getElementById('resetConfirm').classList.remove('hidden')
  );
document
  .getElementById('cancelReset')
  .addEventListener('click', () =>
    document.getElementById('resetConfirm').classList.add('hidden')
  );

document.getElementById('confirmReset').addEventListener('click', () => {
  ctx.clearRect(0, 0, w, h);
  snapshot();
  document.getElementById('resetConfirm').classList.add('hidden');
  message('Warna dihapus. Nama tetap tersimpan.');
});

document.getElementById('download').addEventListener('click', () => {
  if (!w) {
    message('Gambar masih dimuat. Coba lagi sebentar.');
    return;
  }
  try {
    const output = document.createElement('canvas');
    output.width = w;
    output.height = h;
    const out = output.getContext('2d');
    out.fillStyle = '#fff';
    out.fillRect(0, 0, w, h);
    out.drawImage(image, 0, 0, w, h);
    out.globalCompositeOperation = 'multiply';
    out.drawImage(canvas, 0, 0);
    out.globalCompositeOperation = 'source-over';

    if (nameInput.value.trim()) {
      out.fillStyle = '#18222d';
      out.font = `bold ${Math.round(w * 0.032)}px "DM Sans", sans-serif`;
      out.textBaseline = 'middle';
      const maxWidth = w * 0.28,
        text = nameInput.value.trim();
      let size = Math.round(w * 0.032);
      while (out.measureText(text).width > maxWidth && size > 8) {
        size--;
        out.font = `bold ${size}px "DM Sans", sans-serif`;
      }
      out.fillText(text, w * 0.66, h * 0.078, maxWidth);
    }

    const link = document.createElement('a');
    link.download = 'topeng-panji-asmoro-bangun.png';
    link.href = output.toDataURL('image/png');
    link.click();
    message('PNG siap diunduh!');
  } catch (_) {
    message(
      'Browser membatasi unduhan gambar ini. Coba buka halaman di browser lain.'
    );
  }
});
