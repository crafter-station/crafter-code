import { invoke } from "@tauri-apps/api/core";

export interface BrowserBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BrowserViewState {
  id: string;
  url: string;
  bounds: BrowserBounds;
  visible: boolean;
}

export async function createBrowserView(
  url: string,
  bounds: BrowserBounds,
): Promise<BrowserViewState> {
  return invoke<BrowserViewState>("create_browser_view", { url, bounds });
}

export async function navigateBrowser(
  id: string,
  url: string,
): Promise<void> {
  return invoke<void>("navigate_browser", { id, url });
}

export async function closeBrowserView(id: string): Promise<void> {
  return invoke<void>("close_browser_view", { id });
}

export async function resizeBrowserView(
  id: string,
  bounds: BrowserBounds,
): Promise<void> {
  return invoke<void>("resize_browser_view", { id, bounds });
}

export async function setBrowserVisible(
  id: string,
  visible: boolean,
): Promise<void> {
  return invoke<void>("set_browser_visible", { id, visible });
}

export async function listBrowserViews(): Promise<BrowserViewState[]> {
  return invoke<BrowserViewState[]>("list_browser_views");
}

export async function closeAllBrowserViews(): Promise<void> {
  return invoke<void>("close_all_browser_views");
}
