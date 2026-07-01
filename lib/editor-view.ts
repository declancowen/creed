"use client";

import { useSyncExternalStore } from "react";

// Persisted editor "view" preferences (canvas width + text scale). Stored in
// localStorage so a chosen view survives reloads and navigation, and applied
// to the document/Creed editor canvas. Defaults: narrow width + large text.
//
// Scope note: this is a per-browser preference. A single shared value enforced
// for every workspace member would need a Supabase-backed workspace setting
// (and a migration); this store keeps the feature working without one.

export type EditorTextScale = "small" | "large";
export type EditorWidth = "narrow" | "wide";

export type EditorViewPreferences = {
  textScale: EditorTextScale;
  width: EditorWidth;
};

export const DEFAULT_EDITOR_VIEW: EditorViewPreferences = {
  textScale: "large",
  width: "narrow",
};

// Numeric mappings applied to the canvas.
export const EDITOR_WIDTH_PX: Record<EditorWidth, number> = {
  narrow: 920,
  wide: 1240,
};
export const EDITOR_FONT_SCALE: Record<EditorTextScale, number> = {
  large: 1,
  small: 0.85,
};

const STORAGE_KEY = "creed:editor-view";

let current: EditorViewPreferences = DEFAULT_EDITOR_VIEW;
let hydrated = false;
const listeners = new Set<() => void>();

function isTextScale(value: unknown): value is EditorTextScale {
  return value === "small" || value === "large";
}
function isWidth(value: unknown): value is EditorWidth {
  return value === "narrow" || value === "wide";
}

function hydrateFromStorage() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Partial<EditorViewPreferences>;
    current = {
      textScale: isTextScale(parsed.textScale) ? parsed.textScale : DEFAULT_EDITOR_VIEW.textScale,
      width: isWidth(parsed.width) ? parsed.width : DEFAULT_EDITOR_VIEW.width,
    };
  } catch {
    current = DEFAULT_EDITOR_VIEW;
  }
}

function emit() {
  for (const listener of listeners) listener();
}

export function getEditorView(): EditorViewPreferences {
  hydrateFromStorage();
  return current;
}

export function setEditorView(patch: Partial<EditorViewPreferences>) {
  hydrateFromStorage();
  const next: EditorViewPreferences = {
    textScale: patch.textScale ?? current.textScale,
    width: patch.width ?? current.width,
  };
  if (next.textScale === current.textScale && next.width === current.width) return;
  current = next;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
    } catch {
      // Ignore quota / privacy-mode failures; the in-memory value still applies.
    }
  }
  emit();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useEditorView(): EditorViewPreferences {
  return useSyncExternalStore(subscribe, getEditorView, () => DEFAULT_EDITOR_VIEW);
}
