import "./ui/styles.css";
import itemsJson from "../data/items.json";
import scheduleJson from "../data/schedule.json";
import type { Schedule } from "./core/daily";
import type { Dataset } from "./core/types";
import { GameStorage, browserStore } from "./storage/storage";
import { startApp } from "./ui/app";

// Both files are validated by the tests and by the scripts that write them.
const dataset = itemsJson as unknown as Dataset;
const schedule = scheduleJson as Schedule;

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("#app element missing from index.html");
startApp(root, dataset, schedule, new GameStorage(browserStore(() => window.localStorage)));
