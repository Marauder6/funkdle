// Fonts are bundled (SIL Open Font License), not loaded from Google: no third-party requests.
import "@fontsource/ibm-plex-mono/latin-400.css";
import "@fontsource/ibm-plex-mono/latin-600.css";
import "@fontsource/vt323/latin-400.css";
import "./ui/styles.css";
import itemsJson from "../data/items.json";
import scheduleJson from "../data/schedule.json";
import type { Schedule } from "./core/daily";
import type { Dataset } from "./core/types";
import { GameStorage, browserStore } from "./storage/storage";
import { boot } from "./ui/boot";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("#app element missing from index.html");

// Both files are validated by the tests and by the scripts that write them.
boot(root, () => ({
  dataset: itemsJson as unknown as Dataset,
  schedule: scheduleJson as Schedule,
  storage: new GameStorage(browserStore(() => window.localStorage)),
}));
