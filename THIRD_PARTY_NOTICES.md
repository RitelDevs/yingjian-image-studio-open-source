# Third-party notices

The root MIT license covers this project's original code. It does not replace the licenses below.

## Fonts

The bundled font files and local UI subsets use the SIL Open Font License 1.1. Preserve the copyright and license text when redistributing:

- JetBrains Mono: `public/fonts/licenses/JetBrainsMono-OFL.txt`
- Outfit: `public/fonts/licenses/Outfit-OFL.txt`
- Noto Sans SC: `public/fonts/licenses/NotoSansSC-OFL.txt`
- Noto Serif SC: `public/fonts/licenses/NotoSerifSC-OFL.txt`

Canonical retrieval URLs are recorded in `public/fonts/licenses/SOURCES.json`. The Noto UI files are subsets used by the app; the license files remain unmodified.

## Style recipe adaptations

Some visual rules are Chinese translations, selections and app-specific adaptations of upstream references. Attribution, exact source snapshot, SHA-256, license and adaptation notes are recorded in `docs/style-sources/SOURCES.json` and the `STYLE_RECIPE_SOURCES` export in `server/style-recipes.mjs`.

- Jim Liu / baoyu-skills — MIT
- Krea AI / skills — MIT
- Replicate / skills — Apache-2.0
- Other specifically referenced source snapshots retain the license named in their corresponding entry.

License snapshots are included next to the reference text in `docs/style-sources/`. These are documentation and provenance records, not executable instructions. The notices embedded in recipe source files are also retained in the server bundle.

## Runtime and build dependencies

React / React DOM (MIT), Lucide (ISC), Vite (MIT), esbuild (MIT), and Playwright (Apache-2.0) are installed according to the exact versions recorded in `package-lock.json`. Their package licenses remain with the installed dependencies. `npm run release:package` copies dependency license notices into the deployment package.

## Demonstration artwork

The style market images are curated demonstration resources made for this project. Their prompt hashes, model labels and matching recipe versions are recorded in `shared/style-examples.mjs`. Reference/edited examples demonstrate the workflow and are not promises of identical model output.

The browser demonstration image `public/demo/sample.jpg` depicts Vincent van Gogh's flower still life. Other demonstration SVG illustrations in `public/editorial/` and `public/inspiration/` are project assets. Do not replace these examples with private user images in a public source release.
