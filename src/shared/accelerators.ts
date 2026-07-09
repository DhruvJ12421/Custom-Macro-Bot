const modifierTokens = new Set([
  'Command',
  'Cmd',
  'Control',
  'Ctrl',
  'CommandOrControl',
  'CmdOrCtrl',
  'Alt',
  'Option',
  'AltGr',
  'Shift',
  'Super',
  'Meta',
  'Win',
]);

const acceleratorKeys = new Set([
  'Space',
  'Tab',
  'Capslock',
  'Numlock',
  'Scrolllock',
  'Backspace',
  'Delete',
  'Insert',
  'Return',
  'Enter',
  'Up',
  'Down',
  'Left',
  'Right',
  'Home',
  'End',
  'PageUp',
  'PageDown',
  'Escape',
  'Esc',
  'VolumeUp',
  'VolumeDown',
  'VolumeMute',
  'MediaNextTrack',
  'MediaPreviousTrack',
  'MediaStop',
  'MediaPlayPause',
  'PrintScreen',
  'Plus',
  'Minus',
  'Equal',
  'Comma',
  'Period',
  'Slash',
  'Backslash',
  'Semicolon',
  'Quote',
  'Backquote',
  'BracketLeft',
  'BracketRight',
]);

const keyCodeAliases: Record<string, string> = {
  Space: 'Space',
  Escape: 'Escape',
  Esc: 'Escape',
  Tab: 'Tab',
  Enter: 'Enter',
  NumpadEnter: 'Enter',
  Backspace: 'Backspace',
  Delete: 'Delete',
  Insert: 'Insert',
  Home: 'Home',
  End: 'End',
  PageUp: 'PageUp',
  PageDown: 'PageDown',
  ArrowUp: 'Up',
  ArrowDown: 'Down',
  ArrowLeft: 'Left',
  ArrowRight: 'Right',
  Backquote: 'Backquote',
  Minus: 'Minus',
  Equal: 'Equal',
  BracketLeft: 'BracketLeft',
  BracketRight: 'BracketRight',
  Backslash: 'Backslash',
  Semicolon: 'Semicolon',
  Quote: 'Quote',
  Comma: 'Comma',
  Period: 'Period',
  Slash: 'Slash',
  CapsLock: 'Capslock',
  NumLock: 'Numlock',
  ScrollLock: 'Scrolllock',
  PrintScreen: 'PrintScreen',
};

const electronAcceleratorKeyMap: Record<string, string> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Capslock: 'Capslock',
  Numlock: 'Numlock',
  Scrolllock: 'Scrolllock',
  Win: 'Super',
  Cmd: 'Command',
  Ctrl: 'Control',
  CmdOrCtrl: 'CommandOrControl',
  Esc: 'Escape',
};

const captureCodeMap: Record<string, string> = {
  Backquote: 'Backquote',
  Minus: 'Minus',
  Equal: 'Equal',
  BracketLeft: 'BracketLeft',
  BracketRight: 'BracketRight',
  Backslash: 'Backslash',
  Semicolon: 'Semicolon',
  Quote: 'Quote',
  Comma: 'Comma',
  Period: 'Period',
  Slash: 'Slash',
};

type KeyboardShortcutEvent = {
  altKey: boolean;
  ctrlKey: boolean;
  key: string;
  metaKey: boolean;
  shiftKey: boolean;
  code?: string;
};

export function parseAccelerator(value: string): string[] {
  return value
    .split('+')
    .map((part) => part.trim())
    .filter(Boolean);
}

export function isValidAccelerator(value: string): boolean {
  const parts = parseAccelerator(value);
  if (parts.length === 0) return false;
  const key = parts.at(-1);
  if (!key) return false;
  if (!isValidAcceleratorKey(key)) return false;
  return parts.slice(0, -1).every((part) => modifierTokens.has(part));
}

function isValidAcceleratorKey(key: string): boolean {
  return (
    acceleratorKeys.has(key) ||
    /^[A-Z]$/.test(key) ||
    /^[0-9]$/.test(key) ||
    /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(key) ||
    /^num(?:0|[1-9]|dec|add|sub|mult|div)$/i.test(key)
  );
}

export function normalizeAcceleratorForElectron(value: string): string {
  return parseAccelerator(value)
    .map((part) => electronAcceleratorKeyMap[part] ?? part)
    .join('+');
}

export function shortcutFromKeyboardEvent(event: KeyboardShortcutEvent): string | undefined {
  const key = acceleratorKeyFromKeyboardEvent(event);
  if (!key) return undefined;
  const parts = [
    event.ctrlKey || key === 'Control' ? 'Control' : undefined,
    event.altKey || key === 'Alt' ? 'Alt' : undefined,
    event.shiftKey || key === 'Shift' ? 'Shift' : undefined,
    event.metaKey || key === 'Meta' ? 'Meta' : undefined,
  ].filter((part): part is string => !!part);
  if (!['Control', 'Alt', 'Shift', 'Meta'].includes(key)) parts.push(key);
  return [...new Set(parts)].join('+');
}

function acceleratorKeyFromKeyboardEvent(event: KeyboardShortcutEvent): string | undefined {
  if (['Control', 'Shift', 'Alt', 'Meta'].includes(event.key)) return event.key;
  if (event.code && captureCodeMap[event.code]) return captureCodeMap[event.code];
  if (event.code?.startsWith('Digit')) return event.code.slice(5);
  if (event.code?.startsWith('Key')) return event.code.slice(3);
  if (event.code && /^F\d{1,2}$/.test(event.code)) return event.code;
  return (
    keyCodeAliases[event.key] ?? (event.key.length === 1 ? event.key.toUpperCase() : event.key)
  );
}
