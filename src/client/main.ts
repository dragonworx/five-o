import { fetchConfig, identify, type IdentifyResponse } from "./api";
import { getDeviceFingerprint } from "./fingerprint";
import { registerScreen, startRouter } from "./router";
import { getVisitorTokens } from "./storage";
import { config, initStore, setAmbiguous, setGuest, setSoftMatch } from "./store";
import * as landing from "./screens/landing";
import * as slides from "./screens/slides";
import * as details from "./screens/details";
import * as farewell from "./screens/farewell";
import * as confirmed from "./screens/confirmed";

function applyIdentify(res: IdentifyResponse): void {
  if (res.outcome === "auto") {
    setGuest(res.guest);
  } else if (res.outcome === "soft") {
    setSoftMatch({ guestId: res.candidate.guestId, name: res.candidate.name, claimToken: res.claimToken });
  } else if (res.outcome === "ambiguous") {
    setAmbiguous({ candidates: res.candidates, claimToken: res.claimToken });
  }
}

function applyTheme(): void {
  const mode = config().theme.darkMode;
  if (mode !== "auto") document.documentElement.dataset.theme = mode;
}

function registerScreens(): void {
  registerScreen("landing", landing.render);
  registerScreen("slides", slides.render);
  registerScreen("details", details.render);
  registerScreen("farewell", farewell.render);
  registerScreen("confirmed", confirmed.render);
}

async function boot(): Promise<void> {
  const app = document.getElementById("app");
  if (!app) return;

  // Independent, so run together: the fingerprint is the slow one.
  const [cfg, tokens, fingerprint] = await Promise.all([
    fetchConfig(),
    getVisitorTokens(),
    getDeviceFingerprint(),
  ]);
  const deviceSignals = { ...tokens, fingerprint };

  initStore({
    config: cfg,
    guest: null,
    signals: deviceSignals,
    overriddenFrom: null,
    softMatch: null,
    ambiguous: null,
    formIntent: null,
  });

  document.title = cfg.event.title;
  applyTheme();

  try {
    applyIdentify(await identify(deviceSignals));
  } catch {
    /* identify is best-effort; fall through as a new visitor */
  }

  registerScreens();
  startRouter(app, "landing");
}

try {
  await boot();
} catch (err: unknown) {
  const app = document.getElementById("app");
  const message = err instanceof Error ? err.message : "unknown error";
  if (app) app.textContent = `Failed to load: ${message}`;
}
