# Funkdle

A [Wordle](https://www.nytimes.com/games/wordle/index.html)-inspired daily guessing game built on
Fallout 4 junk items. Guess an item and each guess tells you how its weight, value, components,
component counts and origin (base game, Far Harbor, Nuka-World) compare with the hidden target,
until you find it. Fan-made: not affiliated with or endorsed by Bethesda Softworks or ZeniMax
Media. Fallout is a trademark of ZeniMax Media.

Status: in development.

## Run it

Needs Node 24 or later.

```
npm install
npm run dev        # local dev server
npm run check      # typecheck, lint, test
npm run build      # production build into dist/
```

## Data pipeline

The item data comes from the Nukapedia "Fallout 4 junk items" page (CC BY-SA 3.0), snapshotted
under `pipeline/raw/` so every build is reproducible offline.

```
npm run data:fetch     # network: refresh the raw snapshot (rarely)
npm run data:build     # offline: snapshot + pipeline/overrides.yaml -> data/items.json
npm run data:audit     # writes data/audit-report.md
npm run data:simulate  # solver simulation, appended to the audit report
```

## Licences

Code: MIT ([LICENSE](LICENSE)). Item data: CC BY-SA 3.0 ([DATA_LICENSE.md](DATA_LICENSE.md)).
