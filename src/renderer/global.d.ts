import type { MacroApi } from '../shared/api';
declare global {
  interface Window {
    macroApi: MacroApi;
  }
}
export {};
