// The committed inputs, built with the current config. Shared by data:build, the audit and tests.

import { INCLUDE_CREATION_CLUB } from "../../src/core/config";
import { buildDataset, type BuildResult } from "./build";
import { loadOverrides } from "./overrides";
import { loadSnapshot } from "./raw";

export function runBuild(): BuildResult {
  const { html, meta } = loadSnapshot("nukapedia");
  return buildDataset(html, meta, loadOverrides(), { includeCreationClub: INCLUDE_CREATION_CLUB });
}
