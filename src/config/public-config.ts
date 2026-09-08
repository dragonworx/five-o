import type {
  CopyConfig,
  EventConfig,
  FormConfig,
  PartyConfig,
  SlidesConfig,
  ThemeConfig,
} from "./config.types";

// The whitelisted subset the client is allowed to see. `admin`, `detection`
// thresholds and `server` are stripped by explicit construction — not by
// omission — so a newly-added secret can never leak into the public payload by
// accident.

export interface PublicConfig {
  event: EventConfig;
  theme: ThemeConfig;
  copy: CopyConfig;
  form: FormConfig;
  slides: SlidesConfig;
}

export function toPublicConfig(config: PartyConfig): PublicConfig {
  return {
    event: config.event,
    theme: config.theme,
    copy: config.copy,
    form: config.form,
    slides: config.slides,
  };
}
