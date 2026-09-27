// Shared look of the exported parent-facing posters (Weekly Menu, Daily Report):
// palette, fonts, contact details and PNG export. Components are in PosterParts.jsx.
import { toPng } from 'html-to-image';
import { saveFile } from '../../utils/native';
// Self-hosted so html-to-image can embed them in the exported PNG.
import '@fontsource-variable/fredoka';
import '@fontsource-variable/nunito';
import '@fontsource/caveat/700.css';
import '@fontsource-variable/noto-sans-tamil';

// Literal hex, not the app's CSS variables, so the PNG renders the same
// regardless of the admin panel's light/dark mode.
export const POSTER = {
  cream: '#FBF3E6',
  coral: '#E2665E',
  teal: '#7EC8C6',
  orange: '#E99A3E',
  deepTeal: '#4E7C7A',
  brown: '#AE7F5F',
  ink: '#2E2A26',
  inkDim: '#6F6A64',
  flake: '#F2E4CB',
  star: '#F6E27F',
};
export const POSTER_WIDTH = 1000;
export const DISPLAY_FONT = "'Fredoka Variable', 'Nunito Variable', system-ui, sans-serif";
export const BODY_FONT = "'Nunito Variable', system-ui, sans-serif";
export const TAMIL_FONT = "'Noto Sans Tamil Variable', 'Nunito Variable', system-ui, sans-serif";
export const SCRIPT_FONT = "'Caveat', cursive";
export const CONTACT = {
  phone: '+91 95 004 004 59',
  email: 'abhishriacademy@zohomail.in',
  web: 'www.abhishriacademy.in',
};

/** Render a poster node to a 2× PNG and hand it to the user (download, or the iOS share sheet). */
export async function exportPosterPng(node, filename) {
  await document.fonts.ready;
  // Two passes: html-to-image sometimes misses fonts/images on the very first render.
  const opts = { pixelRatio: 2, cacheBust: true, backgroundColor: POSTER.cream };
  await toPng(node, opts);
  const dataUrl = await toPng(node, opts);
  await saveFile(filename, dataUrl);
}

/** Lower-case, dash-separated file name from free text. */
export const fileSlug = (text, fallback) =>
  (text || '').replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/(^-|-$)/g, '') || fallback;
