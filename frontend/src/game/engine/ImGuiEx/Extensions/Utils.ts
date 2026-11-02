// Egt::ImGuiEx::SBool and SInt (Egt/ImGuiEx/Extensions/Utils.h): a debug window's setting kept between runs by its key,
// such as whether the window is open. C++ keeps them in imgui_params.ini; the browser keeps them in its local storage,
// per browser, and a page that cannot use it (a private window) starts with the defaults.

const StoragePrefix = 'egt-imgui:';

function LoadValue(key: string): string | null {
  try {
    return window.localStorage.getItem(StoragePrefix + key);
  } catch {
    return null;
  }
}

function SaveValue(key: string, value: string) {
  try {
    window.localStorage.setItem(StoragePrefix + key, value);
  } catch {
    // the setting lives for this run only
  }
}

export class SBool {
  value: boolean;
  private savedValue: boolean;

  constructor(readonly key: string, value = false) {
    this.value = value;
    this.savedValue = value;
  }

  Load() {
    const saved = LoadValue(this.key);
    if (saved !== null) this.value = saved === '1';
    this.savedValue = this.value;
  }

  Save() {
    if (this.value === this.savedValue) return;
    SaveValue(this.key, this.value ? '1' : '0');
    this.savedValue = this.value;
  }
}

export class SInt {
  value: number;
  private savedValue: number;

  constructor(readonly key: string, value = 0) {
    this.value = value;
    this.savedValue = value;
  }

  Load() {
    const saved = Number.parseInt(LoadValue(this.key) ?? '', 10);
    if (Number.isFinite(saved)) this.value = saved;
    this.savedValue = this.value;
  }

  Save() {
    if (this.value === this.savedValue) return;
    SaveValue(this.key, String(this.value));
    this.savedValue = this.value;
  }
}
