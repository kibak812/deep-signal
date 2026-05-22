export const SETTINGS_KEY = "abyssalArchive.settings.v1";

export const DEFAULT_SETTINGS = {
  volume: 0.35,
  musicVolume: 0.28,
  motionSpeed: 1,
  textScale: 1,
  highContrast: false,
  tacticalAdvisor: true
};

export function normalizeSettings(source = null) {
  const stored = source && typeof source === "object" ? source : {};
  return { ...DEFAULT_SETTINGS, ...stored };
}

export function loadSettingsFromStorage(storage) {
  if (!canUseSettingsStorage(storage)) return normalizeSettings();
  try {
    const raw = storage.getItem(SETTINGS_KEY);
    return raw ? normalizeSettings(JSON.parse(raw)) : normalizeSettings();
  } catch {
    return normalizeSettings();
  }
}

export function saveSettingsToStorage(storage, settings) {
  if (!canUseSettingsStorage(storage)) return false;
  try {
    storage.setItem(SETTINGS_KEY, JSON.stringify(normalizeSettings(settings)));
    return true;
  } catch {
    return false;
  }
}

function canUseSettingsStorage(storage) {
  return Boolean(storage && typeof storage.getItem === "function" && typeof storage.setItem === "function");
}
