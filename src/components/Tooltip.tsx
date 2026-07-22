import { create } from "zustand";
import type { ReactNode } from "react";

interface TipState {
  x: number;
  y: number;
  content: ReactNode | null;
  show: (x: number, y: number, content: ReactNode) => void;
  hide: () => void;
}

export const useTip = create<TipState>((set) => ({
  x: 0,
  y: 0,
  content: null,
  show: (x, y, content) => set({ x, y, content }),
  hide: () => set({ content: null }),
}));

/** Singleton host rendered once at app root. */
export function TooltipHost() {
  const { x, y, content } = useTip();
  if (!content) return null;
  const pad = 14;
  const w = 300;
  const left = Math.min(x + pad, window.innerWidth - w - 10);
  const top = y + pad > window.innerHeight - 160 ? y - 120 : y + pad;
  return (
    <div className="viz-tooltip" style={{ left, top }}>
      {content}
    </div>
  );
}
