// effect declares Channel.decodeText with the DOM-only TextDecoderOptions
// global. Bun and Node implement the same WHATWG options without exposing that
// global type, so this profile declares it instead of adding the browser DOM
// lib or skipping declaration checks. Delete this file once `tsc` passes
// without it.
export {};

declare global {
  interface TextDecoderOptions {
    fatal?: boolean;
    ignoreBOM?: boolean;
  }
}
