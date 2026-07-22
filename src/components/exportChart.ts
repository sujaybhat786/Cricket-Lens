// Reliable chart→PNG export. html-to-image hangs in some engines while cloning
// the DOM and scanning stylesheets, so we roll a focused SVG serializer instead:
// find the panel's chart SVG(s), inline their *computed* styles (which resolves
// every var(--token) to a concrete value), rasterize via an <img>, and stamp a
// branded header/footer band onto a canvas. Works fully offline.

const STYLE_PROPS = [
  "fill", "fill-opacity", "stroke", "stroke-width", "stroke-dasharray",
  "stroke-linecap", "opacity", "font-family", "font-size", "font-weight",
  "text-anchor", "letter-spacing", "transform", "filter", "writing-mode",
] as const;

function inlineStyles(orig: Element, clone: Element) {
  const cs = getComputedStyle(orig);
  // Preserve any inline style already on the element (framer-motion writes
  // animated SVG geometry — y/height/transform — here); only append paint props.
  let decl = clone.getAttribute("style") ? clone.getAttribute("style") + ";" : "";
  for (const p of STYLE_PROPS) {
    const v = cs.getPropertyValue(p);
    if (v && v !== "none" && v !== "normal") decl += `${p}:${v};`;
  }
  if (decl) clone.setAttribute("style", decl);
  const oc = orig.children;
  const cc = clone.children;
  for (let i = 0; i < oc.length; i++) inlineStyles(oc[i], cc[i]);
}

function serialize(svg: SVGSVGElement): { data: string; w: number; h: number } {
  const rect = svg.getBoundingClientRect();
  const vb = svg.viewBox.baseVal;
  const w = vb && vb.width ? vb.width : rect.width;
  const h = vb && vb.height ? vb.height : rect.height;
  const clone = svg.cloneNode(true) as SVGSVGElement;
  inlineStyles(svg, clone);
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("width", String(w));
  clone.setAttribute("height", String(h));
  if (!clone.getAttribute("viewBox")) clone.setAttribute("viewBox", `0 0 ${w} ${h}`);
  const str = new XMLSerializer().serializeToString(clone);
  return { data: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(str)}`, w, h };
}

const load = (src: string) =>
  new Promise<HTMLImageElement>((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error("svg image load failed"));
    img.src = src;
  });

export async function exportPanelPng(panel: HTMLElement, title: string) {
  const svgs = Array.from(panel.querySelectorAll("svg")).filter(
    (s) => s.getBoundingClientRect().width > 40,
  ) as SVGSVGElement[];
  if (!svgs.length) throw new Error("no chart svg in panel");

  const scale = 2;
  const padX = 28;
  const headerH = 64;
  const footerH = 34;
  const gap = 18;

  const parts = svgs.map(serialize);
  const imgs = await Promise.all(parts.map((p) => load(p.data)));

  // lay charts out vertically, scaled to a common content width
  const contentW = Math.max(...parts.map((p) => p.w), 520);
  const scaled = parts.map((p) => ({ w: contentW, h: (p.h / p.w) * contentW }));
  const bodyH = scaled.reduce((s, p) => s + p.h, 0) + gap * (scaled.length - 1);
  const cw = (contentW + padX * 2) * scale;
  const ch = (headerH + bodyH + footerH) * scale;

  const canvas = document.createElement("canvas");
  canvas.width = cw;
  canvas.height = ch;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(scale, scale);
  const W = contentW + padX * 2;

  // background + accent rule
  ctx.fillStyle = "#0a0e14";
  ctx.fillRect(0, 0, W, headerH + bodyH + footerH);
  ctx.fillStyle = "#00ff88";
  ctx.fillRect(padX, headerH - 14, 34, 3);

  // header
  ctx.fillStyle = "#eef2f7";
  ctx.font = "700 22px 'Archivo', system-ui, sans-serif";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(title, padX, headerH - 22);
  ctx.fillStyle = "#5f6f83";
  ctx.font = "500 11px 'IBM Plex Mono', monospace";
  ctx.fillText("CRICLENS", W - padX - ctx.measureText("CRICLENS").width, headerH - 24);

  // charts
  let y = headerH;
  for (let i = 0; i < imgs.length; i++) {
    ctx.drawImage(imgs[i], padX, y, scaled[i].w, scaled[i].h);
    y += scaled[i].h + gap;
  }

  // footer
  ctx.fillStyle = "#5f6f83";
  ctx.font = "400 10px 'IBM Plex Mono', monospace";
  ctx.fillText("Data: Cricsheet (open data) · wagon wheels & pitch maps are statistical reconstructions", padX, headerH + bodyH + 20);

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("canvas export failed");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `criclens-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
