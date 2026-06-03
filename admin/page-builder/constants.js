import { getModuleDescriptors } from './module-descriptors.js';

export const MODULE_TYPES = getModuleDescriptors().map(({ type, label, icon, category }) => ({
  type,
  label,
  icon,
  category,
}));

export const LAYOUT_OPTIONS = [
  { value: '1', label: '1 col' },
  { value: '1-1', label: '1:1' },
  { value: '1-2', label: '1:2' },
  { value: '2-1', label: '2:1' },
  { value: '1-1-1', label: '1:1:1' },
  { value: '1-3-1', label: '1:3:1' },
];

export const THEME_COLORS = [
  { key: 'primary', label: 'Primary', default: '#00d9ff' },
  { key: 'secondary', label: 'Secondary', default: '#ff00ea' },
  { key: 'accent', label: 'Accent', default: '#ffed00' },
  { key: 'bgDark', label: 'Background Dark', default: '#0a0a12' },
  { key: 'bgPanel', label: 'Background Panel', default: '#1a1a2e' },
  { key: 'text', label: 'Text', default: '#ffffff' },
  { key: 'danger', label: 'Danger', default: '#ff3838' },
];

export const THEME_PRESETS = {
  cyberpunk: {
    name: 'Cyberpunk',
    theme: {
      primary: '#00d9ff',
      secondary: '#ff00ea',
      accent: '#ffed00',
      bgDark: '#0a0a12',
      bgPanel: '#1a1a2e',
      text: '#ffffff',
      danger: '#ff3838',
    },
  },
  retro: {
    name: 'Retro',
    theme: {
      primary: '#ff6b35',
      secondary: '#f7c59f',
      accent: '#efefd0',
      bgDark: '#004e64',
      bgPanel: '#00a5cf',
      text: '#ffffff',
      danger: '#ff3838',
    },
  },
  minimal: {
    name: 'Minimal',
    theme: {
      primary: '#2d3436',
      secondary: '#636e72',
      accent: '#0984e3',
      bgDark: '#ffffff',
      bgPanel: '#f5f5f5',
      text: '#2d3436',
      danger: '#d63031',
    },
  },
  neon: {
    name: 'Neon',
    theme: {
      primary: '#39ff14',
      secondary: '#ff00ff',
      accent: '#00ffff',
      bgDark: '#0d0d0d',
      bgPanel: '#1a1a1a',
      text: '#ffffff',
      danger: '#ff0000',
    },
  },
};
