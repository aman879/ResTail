import { OPS } from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';
import type { TextItem } from 'pdfjs-dist/types/src/display/api';

/**
 * Measures the visual design of a PDF resume page so an AI can rebuild it in LaTeX.
 *
 * Text positions/fonts come from pdf.js; colors, shaded boxes and rules are
 * sampled from a rendered raster, because many resume builders (Canva, Word
 * templates) bake their design into a background image instead of vector shapes.
 */

/** A rendered page: RGBA pixels at `scale` pixels per PDF point. */
export interface Raster {
  data: Uint8ClampedArray | Uint8Array;
  width: number;
  height: number;
  scale: number;
}

type RGB = [number, number, number];

interface FontInfo {
  family: string;
  weight: string;
  italic: boolean;
  smallCaps: boolean;
}

interface Token {
  str: string;
  x: number;
  right: number;
  base: number;
  size: number;
  font: FontInfo;
}

type BoxKind = 'bar' | 'chip' | 'box';

interface Segment {
  text: string;
  x: number;
  /** x where the text after a leading bullet starts */
  textX: number;
  right: number;
  top: number;
  bottom: number;
  base: number;
  size: number;
  font: FontInfo;
  bullet: boolean;
  color: RGB;
  box: { kind: BoxKind; color: RGB } | null;
  icon: boolean;
  /** -1 = spans the full page width, otherwise column index */
  col: number;
  style?: string;
}

interface Rule {
  x0: number;
  x1: number;
  y: number;
  thickness: number;
  color: RGB;
}

interface VRule {
  x: number;
  y0: number;
  y1: number;
  thickness: number;
  color: RGB;
}

export interface PageLayout {
  width: number;
  height: number;
  pageBg: RGB;
  frame: { color: RGB; width: number } | null;
  columns: { x0: number; x1: number }[];
  segments: Segment[];
  rules: (Rule & { col: number })[];
  vrules: VRule[];
  backgroundImage: boolean;
  photo: { x: number; y: number; w: number; h: number } | null;
  fonts: Map<string, number>;
}

// ---------------------------------------------------------------- colors

const hex = (c: RGB) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

function pixel(r: Raster, xPt: number, yPt: number): RGB {
  const x = Math.min(r.width - 1, Math.max(0, Math.round(xPt * r.scale)));
  const y = Math.min(r.height - 1, Math.max(0, Math.round(yPt * r.scale)));
  const i = (y * r.width + x) * 4;
  return [r.data[i], r.data[i + 1], r.data[i + 2]];
}

/** Most common color in a pixel rectangle (colors bucketed to 3 bits per channel). */
function modeColor(r: Raster, x0: number, y0: number, x1: number, y1: number, step = 1): RGB {
  const counts = new Map<number, { n: number; sum: RGB }>();
  const px0 = Math.max(0, Math.floor(x0 * r.scale));
  const px1 = Math.min(r.width, Math.ceil(x1 * r.scale));
  const py0 = Math.max(0, Math.floor(y0 * r.scale));
  const py1 = Math.min(r.height, Math.ceil(y1 * r.scale));
  for (let y = py0; y < py1; y += step) {
    for (let x = px0; x < px1; x += step) {
      const i = (y * r.width + x) * 4;
      const key = ((r.data[i] >> 3) << 10) | ((r.data[i + 1] >> 3) << 5) | (r.data[i + 2] >> 3);
      const e = counts.get(key);
      if (e) {
        e.n++;
        e.sum[0] += r.data[i];
        e.sum[1] += r.data[i + 1];
        e.sum[2] += r.data[i + 2];
      } else {
        counts.set(key, { n: 1, sum: [r.data[i], r.data[i + 1], r.data[i + 2]] });
      }
    }
  }
  let best: { n: number; sum: RGB } | undefined;
  for (const e of counts.values()) if (!best || e.n > best.n) best = e;
  if (!best) return [255, 255, 255];
  return [best.sum[0] / best.n, best.sum[1] / best.n, best.sum[2] / best.n];
}

/** Ink color of text inside a box: average of the pixels farthest from the background. */
function inkColor(r: Raster, x0: number, y0: number, x1: number, y1: number, bg: RGB): RGB {
  const px: { d: number; c: RGB }[] = [];
  for (let y = Math.floor(y0 * r.scale); y < Math.ceil(y1 * r.scale); y++) {
    for (let x = Math.floor(x0 * r.scale); x < Math.ceil(x1 * r.scale); x++) {
      if (x < 0 || y < 0 || x >= r.width || y >= r.height) continue;
      const i = (y * r.width + x) * 4;
      const c: RGB = [r.data[i], r.data[i + 1], r.data[i + 2]];
      const d = dist(c, bg);
      if (d > 40) px.push({ d, c });
    }
  }
  if (px.length === 0) return [0, 0, 0];
  px.sort((a, b) => b.d - a.d);
  const top = px.slice(0, Math.max(1, Math.ceil(px.length * 0.15)));
  const sum: RGB = [0, 0, 0];
  for (const p of top) for (let k = 0; k < 3; k++) sum[k] += p.c[k];
  return [sum[0] / top.length, sum[1] / top.length, sum[2] / top.length];
}

/** Walks from (x,y) in direction (dx,dy) while the color stays close to `c`; returns the last matching coordinate. */
function scan(r: Raster, x: number, y: number, dx: number, dy: number, c: RGB, limit: number): number {
  const stepPt = 1 / r.scale;
  let cx = x;
  let cy = y;
  for (let i = 0; i < limit * r.scale; i++) {
    const nx = cx + dx * stepPt;
    const ny = cy + dy * stepPt;
    if (nx < 0 || ny < 0 || nx * r.scale >= r.width || ny * r.scale >= r.height) break;
    if (dist(pixel(r, nx, ny), c) > 12) break;
    cx = nx;
    cy = ny;
  }
  return dx !== 0 ? cx : cy;
}

// ---------------------------------------------------------------- fonts

const WEIGHTS = ['ExtraLight', 'UltraLight', 'SemiBold', 'DemiBold', 'ExtraBold', 'UltraBold', 'Thin', 'Light', 'Book', 'Regular', 'Medium', 'Bold', 'Black', 'Heavy'];

function parseFont(raw: string | undefined): FontInfo {
  const name = (raw ?? '').replace(/^[A-Z]{6}\+/, '');

  // TeX fonts: CMR10, CMBX12, CMTI10, CMCSC10, LMRoman10-Bold, ...
  // TeX bitmap/Type1 names: CMR10, CMBX12, CMCSC10 (Computer Modern), SFRM1000, SFXC1200 (CM-Super), ECRM1000 (EC).
  const tex = name.match(/^(CM|SF|EC|TC)([A-Z]+?)\d+$/);
  if (tex) {
    const code = tex[2];
    return {
      family: code.startsWith('SS') ? 'Computer Modern Sans' : 'Computer Modern',
      weight: /^(BX|B|SSBX|SSDC)/.test(code) ? 'Bold' : 'Regular',
      italic: /TI|IT|SL|MI|BI|SI/.test(code),
      smallCaps: /CSC|XC|CC/.test(code),
    };
  }

  const [familyPart, ...rest] = name.split(/[-,]/);
  const style = rest.join('') || (familyPart.match(/(Bold|Italic|Light|Medium|Black|Semibold)+$/i)?.[0] ?? '');
  const family = familyPart
    .replace(new RegExp(`(${WEIGHTS.join('|')}|Italic|Oblique)+$`, 'i'), '')
    .replace(/(PS)?MT$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  const weight = WEIGHTS.find((w) => new RegExp(w, 'i').test(style)) ?? (/bold/i.test(name) ? 'Bold' : 'Regular');
  return {
    family: family || 'Unknown',
    weight,
    italic: /italic|oblique/i.test(style),
    smallCaps: /caps|sc$/i.test(style),
  };
}

const isBold = (f: FontInfo) => /semibold|demibold|bold|black|heavy/i.test(f.weight);

// ---------------------------------------------------------------- matrices

type Mat = [number, number, number, number, number, number];
const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];
const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

/** Placements of raster images on the page, in viewport points. */
async function imageBoxes(page: PDFPageProxy, vp: Mat) {
  const ops = await page.getOperatorList();
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  const stack: Mat[] = [];
  let ctm: Mat = [1, 0, 0, 1, 0, 0];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.save) stack.push(ctm);
    else if (fn === OPS.restore) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.transform) ctm = mul(ctm, args as Mat);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push(ctm);
      if (Array.isArray(args?.[0]) || ArrayBuffer.isView(args?.[0])) ctm = mul(ctm, Array.from(args[0] as ArrayLike<number>) as Mat);
    } else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? ctm;
    else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject) {
      const m = mul(vp, ctm);
      const pts = [apply(m, 0, 0), apply(m, 1, 0), apply(m, 0, 1), apply(m, 1, 1)];
      const xs = pts.map((p) => p[0]);
      const ys = pts.map((p) => p[1]);
      const x = Math.min(...xs);
      const y = Math.min(...ys);
      boxes.push({ x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y });
    }
  }
  return boxes;
}

// ---------------------------------------------------------------- analysis

const BULLET = /^[•●▪■◦‣∙·–—*\-➢➤►▸»✓✔]$/u;
const PRIVATE_USE = /[-]/u;

export async function analyzePage(page: PDFPageProxy, raster: Raster): Promise<PageLayout> {
  const viewport = page.getViewport({ scale: 1 });
  const W = viewport.width;
  const H = viewport.height;
  const vp = viewport.transform as Mat;

  const images = await imageBoxes(page, vp);
  const content = await page.getTextContent();

  // Real font names are only available after the operator list loaded the fonts.
  const fontCache = new Map<string, FontInfo>();
  const fontOf = (id: string): FontInfo => {
    let f = fontCache.get(id);
    if (!f) {
      let name: string | undefined;
      try {
        name = (page.commonObjs.get(id) as { name?: string } | null)?.name;
      } catch {
        name = undefined;
      }
      f = parseFont(name ?? content.styles[id]?.fontFamily);
      fontCache.set(id, f);
    }
    return f;
  };

  // 1. Tokens in viewport coordinates (y grows downward).
  const tokens: Token[] = [];
  const iconMarks: { x: number; base: number; size: number }[] = [];
  for (const raw of content.items) {
    if (!('str' in raw)) continue;
    const it = raw as TextItem;
    if (!it.str.trim()) continue;
    const t = it.transform as Mat;
    if (Math.abs(t[1]) > Math.abs(t[0]) * 0.1) continue; // rotated text
    const m = mul(vp, t);
    const size = Math.hypot(m[2], m[3]);
    if (size < 3) continue;
    const x = m[4];
    const base = m[5];
    if (PRIVATE_USE.test(it.str) && it.str.trim().length <= 2) {
      // Icon fonts (Font Awesome etc.) use private-use code points.
      iconMarks.push({ x, base, size });
      continue;
    }
    tokens.push({ str: it.str, x, right: x + it.width, base, size, font: fontOf(it.fontName) });
  }

  // 2. Rows of tokens sharing a baseline, split into segments at wide gaps.
  tokens.sort((a, b) => a.base - b.base || a.x - b.x);
  const rows: Token[][] = [];
  for (const t of tokens) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].base - t.base) < Math.min(row[0].size, t.size) * 0.35) row.push(t);
    else rows.push([t]);
  }

  const segments: Segment[] = [];
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let cur: Token[] = [];
    const flush = () => {
      if (cur.length) segments.push(buildSegment(cur));
      cur = [];
    };
    for (const t of row) {
      const prev = cur[cur.length - 1];
      if (prev) {
        const gap = t.x - prev.right;
        const size = Math.max(prev.size, t.size);
        const afterBullet = cur.length === 1 && BULLET.test(prev.str.trim());
        if (gap > Math.max(size * 1.3, 10) && !afterBullet) flush();
      }
      cur.push(t);
    }
    flush();
  }

  function buildSegment(ts: Token[]): Segment {
    // Dominant font by character count.
    const weightBy = new Map<FontInfo, number>();
    for (const t of ts) weightBy.set(t.font, (weightBy.get(t.font) ?? 0) + t.str.length);
    const font = [...weightBy.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const size = Math.max(...ts.map((t) => t.size));
    // The bullet is either its own text item or glued to the start of the first one ("• Led ...").
    const separateBullet = BULLET.test(ts[0].str.trim()) && ts.length > 1;
    const gluedBullet = !separateBullet && /^[•●▪■◦‣∙·➢➤►▸»✓✔]\s/u.test(ts[0].str);
    const bullet = separateBullet || gluedBullet;

    let text = '';
    let boldOpen = false;
    ts.forEach((t, i) => {
      const prev = ts[i - 1];
      if (prev) {
        const gap = t.x - prev.right;
        const needsSpace = gap > t.size * 0.12 && !prev.str.endsWith(' ') && !t.str.startsWith(' ');
        if (needsSpace) text += ' ';
      }
      // Mark inline bold runs (e.g. "Languages:" labels) when the segment is mostly regular.
      const bold = !isBold(font) && isBold(t.font) && !(i === 0 && bullet);
      if (bold && !boldOpen) {
        text += '**';
        boldOpen = true;
      } else if (!bold && boldOpen) {
        text = text.replace(/(\s*)$/, '**$1');
        boldOpen = false;
      }
      text += t.str;
    });
    if (boldOpen) text = text.replace(/(\s*)$/, '**$1');

    const base = ts[0].base;
    return {
      text: text.replace(/\s+/g, ' ').trim(),
      x: ts[0].x,
      textX: separateBullet ? ts[1].x : gluedBullet ? ts[0].x + size * 1.2 : ts[0].x,
      right: Math.max(...ts.map((t) => t.right)),
      top: base - size * 0.78,
      bottom: base + size * 0.22,
      base,
      size,
      font,
      bullet,
      color: [0, 0, 0],
      box: null,
      icon: false,
      col: 0,
    };
  }

  // 3. Page background and colored frame.
  const pageBg = modeColor(raster, 0, 0, W, H, 4);
  let frame: PageLayout['frame'] = null;
  const edge = modeColor(raster, 0, H * 0.3, 2, H * 0.7);
  if (dist(edge, pageBg) > 10) {
    const inner = scan(raster, 1, H / 2, 1, 0, edge, W / 4);
    frame = { color: edge, width: Math.round(inner) };
  }

  // 4. Colors and backgrounds of each segment.
  for (const s of segments) {
    const localBg = modeColor(raster, s.x, s.top, s.right, s.bottom);
    s.color = inkColor(raster, s.textX, s.top, s.right, s.bottom, localBg);
    if (dist(localBg, pageBg) > 8) {
      const midY = (s.top + s.bottom) / 2;
      const seedX = s.x - 2;
      const left = scan(raster, seedX, midY, -1, 0, localBg, W);
      const right = scan(raster, s.right + 2, midY, 1, 0, localBg, W);
      const up = scan(raster, seedX, midY, 0, -1, localBg, H);
      const down = scan(raster, seedX, midY, 0, 1, localBg, H);
      s.box = { kind: 'box', color: localBg };
      Object.assign(s, { _box: { x0: left, x1: right, y0: up, y1: down } });
    }
  }

  // 5. Icons: small images or icon-font glyphs just left of a segment on the same line.
  const icons = [
    ...images.filter((b) => b.w < 24 && b.h < 24).map((b) => ({ x: b.x + b.w, mid: b.y + b.h / 2 })),
    ...iconMarks.map((m) => ({ x: m.x + m.size, mid: m.base - m.size * 0.35 })),
  ];
  for (const ic of icons) {
    const s = segments.find((g) => ic.mid > g.top - 3 && ic.mid < g.bottom + 3 && g.x >= ic.x - 2 && g.x - ic.x < 24);
    if (s) s.icon = true;
  }
  const backgroundImage = images.some((b) => b.w * b.h > W * H * 0.5);
  const photoBox = images.find((b) => b.w >= 30 && b.h >= 30 && b.w < W * 0.5 && b.w / b.h > 0.6 && b.w / b.h < 1.6);
  const photo = photoBox ? { x: photoBox.x, y: photoBox.y, w: photoBox.w, h: photoBox.h } : null;

  // 6. Columns: a vertical gutter that (almost) no text crosses.
  const coverage = new Uint16Array(Math.ceil(W) + 1);
  for (const s of segments) for (let x = Math.max(0, Math.floor(s.x)); x < Math.min(W, Math.ceil(s.right)); x++) coverage[x]++;
  const tolerance = Math.max(2, Math.round(segments.length * 0.08));
  let best: { a: number; b: number } | null = null;
  for (let x = Math.round(W * 0.2); x < W * 0.8; x++) {
    if (coverage[x] > tolerance) continue;
    let e = x;
    while (e + 1 < W * 0.8 && coverage[e + 1] <= tolerance) e++;
    if (e - x >= 8 && (!best || e - x > best.b - best.a)) best = { a: x, b: e };
    x = e;
  }
  let columns = [{ x0: 0, x1: W }];
  if (best) {
    const g = best;
    const left = segments.filter((s) => s.right <= g.a + 1);
    const right = segments.filter((s) => s.x >= g.b - 1);
    const span = (ss: Segment[]) => (ss.length ? Math.max(...ss.map((s) => s.bottom)) - Math.min(...ss.map((s) => s.top)) : 0);
    // Both sides must hold real content side by side, not just right-aligned dates.
    const overlapping = Math.min(span(left), span(right)) > H * 0.3;
    const rightIsProse = right.filter((s) => s.text.length > 25).length >= 3;
    if (left.length >= 4 && right.length >= 4 && overlapping && rightIsProse) {
      columns = [
        { x0: Math.min(...left.map((s) => s.x)), x1: Math.max(...left.map((s) => s.right)) },
        { x0: Math.min(...right.map((s) => s.x)), x1: Math.max(...right.map((s) => s.right)) },
      ];
      const mid = (g.a + g.b) / 2;
      for (const s of segments) {
        const spansBoth = s.x < columns[0].x1 - 20 && s.right > columns[1].x0 + 20;
        s.col = spansBoth ? -1 : (s.x + s.right) / 2 < mid ? 0 : 1;
      }
      columns = [0, 1].map((c) => {
        const ss = segments.filter((s) => s.col === c);
        return { x0: Math.min(...ss.map((s) => s.x)), x1: Math.max(...ss.map((s) => s.right)) };
      });
    }
  }
  if (columns.length === 1) {
    columns = [{ x0: Math.min(...segments.map((s) => s.x)), x1: Math.max(...segments.map((s) => s.right)) }];
  }

  // Classify boxes now that column widths are known.
  for (const s of segments) {
    const b = (s as Segment & { _box?: { x0: number; x1: number; y0: number; y1: number } })._box;
    if (!b || !s.box) continue;
    const colW = s.col >= 0 ? columns[s.col].x1 - columns[s.col].x0 : W;
    const w = b.x1 - b.x0;
    const h = b.y1 - b.y0;
    s.box.kind = h > s.size * 2.6 ? 'box' : w >= colW * 0.8 ? 'bar' : 'chip';
    delete (s as { _box?: unknown })._box;
  }

  // 7. Thin horizontal and vertical rules.
  const { rules, vrules } = findRules(raster, segments);
  const placedRules = rules.map((r) => {
    let col = -1;
    if (columns.length > 1) {
      if (r.x1 <= (columns[0].x1 + columns[1].x0) / 2 + 2) col = 0;
      else if (r.x0 >= (columns[0].x1 + columns[1].x0) / 2 - 2) col = 1;
    }
    return { ...r, col };
  });

  snapColors(segments);

  const fonts = new Map<string, number>();
  for (const s of segments) fonts.set(s.font.family, (fonts.get(s.font.family) ?? 0) + s.text.length);

  return { width: W, height: H, pageBg, frame, columns, segments, rules: placedRules, vrules, backgroundImage, photo, fonts };
}

/**
 * Anti-aliasing makes the same text color measure slightly differently per line.
 * Snap every color to a small palette, preferring the most used shade.
 */
function snapColors(segments: Segment[]) {
  const snap = (get: (s: Segment) => RGB | null, set: (s: Segment, c: RGB) => void, tolerance: number) => {
    const weight = new Map<string, { c: RGB; n: number }>();
    for (const s of segments) {
      const c = get(s);
      if (!c) continue;
      const k = hex(c);
      const e = weight.get(k);
      if (e) e.n += s.text.length;
      else weight.set(k, { c, n: s.text.length });
    }
    const palette: RGB[] = [];
    for (const { c } of [...weight.values()].sort((a, b) => b.n - a.n)) {
      if (!palette.some((p) => dist(p, c) < tolerance)) palette.push(c);
    }
    for (const s of segments) {
      const c = get(s);
      if (!c) continue;
      set(s, palette.reduce((best, p) => (dist(p, c) < dist(best, c) ? p : best), palette[0]));
    }
  };
  snap((s) => s.color, (s, c) => (s.color = c), 24);
  snap((s) => s.box?.color ?? null, (s, c) => s.box && (s.box.color = c), 10);
}

function findRules(r: Raster, segments: Segment[]) {
  const s = r.scale;
  const minLen = 40 * s;
  const off = Math.max(2, Math.round(2.5 * s));
  const at = (x: number, y: number): RGB => {
    const i = (y * r.width + x) * 4;
    return [r.data[i], r.data[i + 1], r.data[i + 2]];
  };
  const lum = (c: RGB) => c[0] * 0.3 + c[1] * 0.59 + c[2] * 0.11;
  /** Median color along a run, so one stray pixel doesn't decide it. */
  const darkest = (a: number, b: number, fixed: number, horizontal: boolean): RGB => {
    const cs: RGB[] = [];
    for (let i = a; i <= b; i += Math.max(1, Math.floor((b - a) / 25))) cs.push(horizontal ? at(i, fixed) : at(fixed, i));
    cs.sort((p, q) => lum(p) - lum(q));
    return cs[Math.floor(cs.length / 2)];
  };
  const inText = (xPt: number, yPt: number) => segments.some((g) => xPt >= g.x - 1 && xPt <= g.right + 1 && yPt >= g.top - 1 && yPt <= g.bottom + 1);

  // A pixel belongs to a thin line when it differs from the pixels a few points above and below (or left and right).
  const raw: Rule[] = [];
  for (let y = off; y < r.height - off; y++) {
    let start = -1;
    let c0: RGB = [0, 0, 0];
    for (let x = 0; x <= r.width; x++) {
      let ok = false;
      if (x < r.width) {
        const c = at(x, y);
        ok = dist(c, at(x, y - off)) > 20 && dist(c, at(x, y + off)) > 20 && (start < 0 || dist(c, c0) < 30);
        if (ok && start < 0) {
          start = x;
          c0 = c;
        }
      }
      if (!ok && start >= 0) {
        if (x - start >= minLen && !inText((start + x) / 2 / s, y / s)) {
          raw.push({ x0: start / s, x1: x / s, y: y / s, thickness: 1 / s, color: darkest(start, x - 1, y, true) });
        }
        start = -1;
      }
    }
  }
  // Anti-aliasing splits one line into pieces across neighbouring pixel rows; join overlapping pieces.
  const rules: Rule[] = [];
  for (const l of raw) {
    const prev = rules.find((p) => l.y - (p.y + p.thickness) < 1.5 / s && l.x0 <= p.x1 + 2 && l.x1 >= p.x0 - 2);
    if (prev) {
      prev.thickness = Math.max(prev.thickness, l.y - prev.y + 1 / s);
      prev.x0 = Math.min(prev.x0, l.x0);
      prev.x1 = Math.max(prev.x1, l.x1);
      if (lum(l.color) < lum(prev.color)) prev.color = l.color;
    } else rules.push({ ...l });
  }

  const rawV: VRule[] = [];
  for (let x = off; x < r.width - off; x++) {
    let start = -1;
    let c0: RGB = [0, 0, 0];
    for (let y = 0; y <= r.height; y++) {
      let ok = false;
      if (y < r.height) {
        const c = at(x, y);
        ok = dist(c, at(x - off, y)) > 20 && dist(c, at(x + off, y)) > 20 && (start < 0 || dist(c, c0) < 30);
        if (ok && start < 0) {
          start = y;
          c0 = c;
        }
      }
      if (!ok && start >= 0) {
        if (y - start >= minLen * 2) rawV.push({ x: x / s, y0: start / s, y1: y / s, thickness: 1 / s, color: darkest(start, y - 1, x, false) });
        start = -1;
      }
    }
  }
  const vrules: VRule[] = [];
  for (const l of rawV) {
    const prev = vrules.find((p) => l.x - (p.x + p.thickness) < 1.5 / s && l.y0 <= p.y1 + 2 && l.y1 >= p.y0 - 2);
    if (prev) {
      prev.thickness = Math.max(prev.thickness, l.x - prev.x + 1 / s);
      prev.y0 = Math.min(prev.y0, l.y0);
      prev.y1 = Math.max(prev.y1, l.y1);
      if (lum(l.color) < lum(prev.color)) prev.color = l.color;
    } else vrules.push({ ...l });
  }

  const round = (v: number) => Math.round(v * 2) / 2;
  return {
    rules: rules.map((l) => ({ ...l, thickness: Math.max(0.4, round(l.thickness)) })),
    vrules: vrules.map((l) => ({ ...l, thickness: Math.max(0.4, round(l.thickness)) })),
  };
}

// ---------------------------------------------------------------- LaTeX font mapping

/** Fonts the compile server (pdflatex, TeX Live) can load, matched by family name. */
const FONT_PACKAGES: [RegExp, string][] = [
  [/^computer modern sans|^cmu ?sans|^lm ?sans/i, '\\renewcommand{\\familydefault}{\\sfdefault}'],
  [/^computer modern|^latin modern|^lm ?roman|^cmu/i, ''],
  [/^roboto/i, '\\usepackage[sfdefault]{roboto}'],
  [/^lato/i, '\\usepackage[default]{lato}'],
  [/^open ?sans/i, '\\usepackage[default]{opensans}'],
  [/^source ?sans/i, '\\usepackage[default]{sourcesanspro}'],
  [/^source ?serif/i, '\\usepackage{sourceserifpro}'],
  [/^fira ?sans/i, '\\usepackage[sfdefault]{FiraSans}'],
  [/^raleway/i, '\\usepackage[default]{raleway}'],
  [/^montserrat|^proxima|^poppins|^avenir/i, '\\usepackage[default]{montserrat}'],
  [/^inter\b|^manrope|^dm ?sans|^work ?sans|^plus ?jakarta|^helvetica ?neue|^sf ?pro/i, '\\usepackage[sfdefault]{inter}'],
  [/^nunito|^mulish|^muli\b|^quicksand|^rubik/i, '\\usepackage[default]{nunito}'],
  [/^merriweather/i, '\\usepackage{merriweather}'],
  [/^libre ?baskerville|^baskerville/i, '\\usepackage{librebaskerville}'],
  [/garamond/i, '\\usepackage{ebgaramond}'],
  [/^cormorant/i, '\\usepackage{CormorantGaramond}'],
  [/^calibri|^carlito|^candara|^segoe/i, '\\usepackage[sfdefault]{carlito}'],
  [/^arial|^helvetica|^arimo|^liberation ?sans|^barlow|^tahoma|^verdana|^trebuchet/i, '\\usepackage[sfdefault]{roboto}'],
  [/^times|^tinos|^liberation ?serif/i, '\\usepackage{newtxtext}'],
  [/^cambria|^georgia|^charter|^bitstream ?charter/i, '\\usepackage{XCharter}'],
  [/^ibm ?plex ?sans/i, '\\usepackage[sfdefault]{plex-sans}'],
  [/^ibm ?plex ?serif/i, '\\usepackage{plex-serif}'],
  [/^cabin/i, '\\usepackage[sfdefault]{cabin}'],
  [/^libertin/i, '\\usepackage{libertine}'],
  [/^crimson/i, '\\usepackage{crimson}'],
  [/^playfair/i, '\\usepackage{PlayfairDisplay}'],
  [/^libre ?franklin|^franklin/i, '\\usepackage[sfdefault]{librefranklin}'],
  [/^gill ?sans/i, '\\usepackage[default]{gillius}'],
  [/^josefin/i, '\\usepackage[default]{josefin}'],
  [/^spectral/i, '\\usepackage{spectral}'],
  [/^palatino|^book ?antiqua|^pagella/i, '\\usepackage{mathpazo}'],
  [/^pt ?sans|^pt ?serif/i, '\\usepackage{paratype}'],
];

export function latexFontFor(family: string): { preamble: string; exact: boolean } {
  for (const [re, preamble] of FONT_PACKAGES) {
    if (re.test(family)) {
      const exact = new RegExp(`^${family.split(' ')[0]}`, 'i').test(preamble.match(/\{([^}]+)\}$/)?.[1] ?? 'computer modern');
      return { preamble, exact };
    }
  }
  return { preamble: /serif|times|roman|georgia/i.test(family) && !/sans/i.test(family) ? '\\usepackage{XCharter}' : '\\usepackage[sfdefault]{roboto}', exact: false };
}

// ---------------------------------------------------------------- output

/** Formats the measured layout as a compact spec plus the resume content in reading order. */
export function describeLayout(pages: PageLayout[]): string {
  const first = pages[0];
  const pt = (v: number) => Math.round(v);
  const styleIds = new Map<string, string>();
  const styleDefs: string[] = [];

  const styleOf = (s: Segment) => {
    const parts = [
      `${s.font.family} ${s.font.weight}${s.font.italic ? ' Italic' : ''}${s.font.smallCaps ? ' SmallCaps' : ''}`,
      `${Math.round(s.size * 2) / 2}pt`,
      hex(s.color),
    ];
    const letters = s.text.replace(/[^A-Za-z]/g, '');
    if (letters.length > 3 && letters === letters.toUpperCase()) parts.push('ALL CAPS');
    if (s.box) parts.push(s.box.kind === 'bar' ? `on full-width bar ${hex(s.box.color)}` : s.box.kind === 'chip' ? `inside chip/tag ${hex(s.box.color)}` : `inside shaded box ${hex(s.box.color)}`);
    const key = parts.join(', ');
    let id = styleIds.get(key);
    if (!id) {
      id = `S${styleIds.size + 1}`;
      styleIds.set(key, id);
      styleDefs.push(`${id}: ${key}`);
    }
    return id;
  };

  const body: string[] = [];
  /** For every wrapped (non-final) paragraph line: does it end at the column's right edge? Tells justified from ragged text. */
  const wrappedFlush: boolean[] = [];
  /** Baseline distance / font size for wrapped paragraph lines. */
  const lineRatios: number[] = [];
  pages.forEach((p, pi) => {
    if (pages.length > 1) body.push(`=== PAGE ${pi + 1} ===`);
    const twoCol = p.columns.length > 1;
    const colTop = twoCol ? Math.min(...p.segments.filter((s) => s.col >= 0).map((s) => s.top)) : Infinity;

    const emit = (title: string, segs: Segment[], rules: Rule[], col: { x0: number; x1: number }) => {
      if (!segs.length) return;
      body.push(`--- ${title} ---`);
      type Item = { y: number; line?: Segment[]; rule?: Rule };
      const items: Item[] = [];
      const sorted = [...segs].sort((a, b) => a.base - b.base || a.x - b.x);
      for (const s of sorted) {
        const last = items[items.length - 1];
        if (last?.line && Math.abs(last.line[0].base - s.base) < s.size * 0.35) last.line.push(s);
        else items.push({ y: s.top, line: [s] });
      }
      for (const r of rules) items.push({ y: r.y, rule: r });
      items.sort((a, b) => a.y - b.y);

      // Merge wrapped lines of one paragraph or bullet into a single entry.
      const out: { text: string; style: string; first: Segment; last: Segment; align: string; rights?: number[] }[] = [];
      for (const it of items) {
        if (it.rule) {
          out.push({ text: `[horizontal rule ${hex(it.rule.color)}, ${it.rule.thickness}pt]`, style: '', first: null as unknown as Segment, last: null as unknown as Segment, align: '' });
          continue;
        }
        const line = it.line!;
        if (line.length === 1) {
          const s = line[0];
          const style = styleOf(s);
          const prev = out[out.length - 1];
          const gap = prev?.last ? s.base - prev.last.base : Infinity;
          if (
            prev?.last &&
            prev.style === style &&
            !s.bullet &&
            gap > s.size * 0.9 &&
            gap < s.size * 1.75 &&
            (Math.abs(s.x - prev.last.textX) < 2.5 ||
              // continuation of a bullet whose text start could only be estimated
              (prev.first.bullet && s.x > prev.first.x + 1 && s.x < prev.first.textX + s.size * 0.6))
          ) {
            prev.text = prev.text.endsWith('-') ? prev.text + s.text : `${prev.text} ${s.text}`;
            (prev.rights ??= []).push(prev.last.right);
            lineRatios.push(gap / s.size);
            prev.last = s;
            continue;
          }
        }
        const colW = col.x1 - col.x0;
        const parts = line.map((s) => {
          const center = (s.x + s.right) / 2;
          let align = '';
          if (s.box?.kind === 'chip') align = '';
          else if (Math.abs(center - (col.x0 + colW / 2)) < 6 && s.x - col.x0 > 20) align = ' (centered)';
          else if (line.length > 1 && s !== line[0] && col.x1 - s.right < 6) align = ' (right-aligned)';
          return `[${styleOf(s)}${s.icon ? ', with icon' : ''}]${align} ${s.bullet ? s.text : s.text}`;
        });
        out.push({ text: parts.join('  ||  '), style: line.length === 1 ? styleOf(line[0]) : '', first: line[0], last: line[line.length - 1], align: '' });
      }
      for (const o of out) {
        body.push(o.text);
        for (const r of o.rights ?? []) wrappedFlush.push(col.x1 - r < 3);
      }
    };

    if (twoCol) {
      const full = p.segments.filter((s) => s.col === -1);
      const fullRules = p.rules.filter((r) => r.col === -1);
      const page = { x0: 0, x1: p.width };
      emit('FULL WIDTH (top)', full.filter((s) => s.top < colTop), fullRules.filter((r) => r.y < colTop), page);
      p.columns.forEach((c, i) =>
        emit(
          `${i === 0 ? 'LEFT' : 'RIGHT'} COLUMN`,
          p.segments.filter((s) => s.col === i),
          p.rules.filter((r) => r.col === i),
          c,
        ),
      );
      emit('FULL WIDTH (bottom)', full.filter((s) => s.top >= colTop), fullRules.filter((r) => r.y >= colTop), page);
    } else {
      emit('PAGE CONTENT', p.segments, p.rules, p.columns[0]);
    }
  });

  // Layout summary.
  const fonts = new Map<string, number>();
  for (const p of pages) for (const [f, n] of p.fonts) fonts.set(f, (fonts.get(f) ?? 0) + n);
  const fontList = [...fonts.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
  const bodyFont = fontList[0] ?? 'Unknown';
  const mapped = latexFontFor(bodyFont);

  const allSegs = first.segments;
  const marginL = Math.min(...allSegs.map((s) => s.x));
  const marginR = first.width - Math.max(...allSegs.map((s) => s.right));
  const marginT = Math.min(...allSegs.map((s) => s.top));
  const paper = Math.abs(first.width - 612) < 3 && Math.abs(first.height - 792) < 3 ? 'US Letter' : Math.abs(first.width - 595) < 3 ? 'A4' : `${pt(first.width)}x${pt(first.height)}pt`;

  const layout: string[] = [
    `Page: ${paper} (${pt(first.width)}x${pt(first.height)}pt), ${pages.length} page(s). Content margins ≈ left ${pt(marginL)}pt, right ${pt(marginR)}pt, top ${pt(marginT)}pt.`,
    `Page background: ${hex(first.pageBg)}.` + (first.frame ? ` Page edges have a ${hex(first.frame.color)} frame about ${first.frame.width}pt wide (content sits on the inner area).` : ''),
    `Fonts in the PDF: ${fontList.join(', ')}. Use this exact font line in the preamble: ${mapped.preamble || '(none, keep the LaTeX default Computer Modern)'}${mapped.exact ? '' : ` (closest available match for ${bodyFont})`}.`,
  ];
  if (first.columns.length > 1) {
    const [l, r] = first.columns;
    const textW = r.x1 - l.x0;
    layout.push(
      `Columns: 2. Left column x ${pt(l.x0)}–${pt(l.x1)}pt (${Math.round(((l.x1 - l.x0) / textW) * 100)}% of text width), right column x ${pt(r.x0)}–${pt(r.x1)}pt, gutter ${pt(r.x0 - l.x1)}pt.`,
    );
  } else {
    layout.push('Columns: 1.');
  }
  if (wrappedFlush.length >= 3) {
    layout.push(
      wrappedFlush.filter(Boolean).length / wrappedFlush.length > 0.8
        ? 'Paragraph alignment: justified (both edges flush).'
        : 'Paragraph alignment: left-aligned with a ragged right edge and no hyphenation (use \\raggedright and \\usepackage[none]{hyphenat}).',
    );
  }
  const contentBottom = Math.max(...allSegs.map((s) => s.bottom));
  const ratio = lineRatios.sort((a, b) => a - b)[Math.floor(lineRatios.length / 2)];
  layout.push(
    `Vertical rhythm: content runs down to y ${pt(contentBottom)}pt of ${pt(first.height)}pt` +
      (ratio ? `; wrapped lines use a baseline distance of about ${ratio.toFixed(2)}× the font size` : '') +
      '. Space sections and entries so the content fills the page to about the same depth.',
  );
  for (const v of first.vrules) layout.push(`Vertical divider line ${hex(v.color)}, ${v.thickness}pt, at x ${pt(v.x)}pt from y ${pt(v.y0)} to ${pt(v.y1)}pt.`);
  if (first.photo) layout.push(`The original has a profile photo (${pt(first.photo.w)}x${pt(first.photo.h)}pt at x ${pt(first.photo.x)}, y ${pt(first.photo.y)}). Leave it out.`);
  if (first.backgroundImage) layout.push('Decorative shapes in the original are part of a background image; reproduce only the boxes, bars, chips and rules listed here.');

  return [
    'LAYOUT (measured from the original PDF):',
    ...layout.map((l) => `- ${l}`),
    '',
    'TEXT STYLES (font, size, color, background):',
    ...styleDefs.map((d) => `- ${d}`),
    '',
    'CONTENT (reading order; [Sx] = text style, "||" separates items on the same line, "**" = inline bold):',
    ...body,
  ].join('\n');
}
