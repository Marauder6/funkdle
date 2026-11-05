import "./ui/styles.css";
import itemsJson from "../data/items.json";
import type { Dataset } from "./core/types";
import { GameStorage, browserStore } from "./storage/storage";
import { startApp } from "./ui/app";

// data/items.json is validated against the schema by the tests and by data:build.
const dataset = itemsJson as unknown as Dataset;

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("#app element missing from index.html");
startApp(root, dataset, new GameStorage(browserStore(() => window.localStorage)));
