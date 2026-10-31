# Credits

Herdr Empires ships only assets it may redistribute (SPEC §13). Everything not
listed here is generated in this repository by `art/*.ts` and is Apache-2.0.

## Fonts (SIL Open Font License 1.1)

| Family | Files | Copyright | License |
|---|---|---|---|
| Cinzel | `mods/empires/fonts/Cinzel[wght].ttf` | 2020 The Cinzel Project Authors (https://github.com/NDISCOVER/Cinzel) | `mods/empires/fonts/OFL-Cinzel.txt` |
| Alegreya Sans | `mods/empires/fonts/AlegreyaSans-{Regular,Medium,Bold,Italic}.ttf` | 2013 The Alegreya Sans Project Authors (https://github.com/huertatipografica/Alegreya-Sans) | `mods/empires/fonts/OFL-AlegreyaSans.txt` |
| Alegreya Sans SC | `mods/empires/fonts/AlegreyaSansSC-{Regular,Bold}.ttf` | 2013 The Alegreya Sans Project Authors | `mods/empires/fonts/OFL-AlegreyaSansSC.txt` |

Fetched unmodified from https://github.com/google/fonts (`ofl/cinzel`,
`ofl/alegreyasans`, `ofl/alegreyasanssc`). JetBrains Mono (terminals) ships
with Herdr itself.

## World art: 0 A.D. (CC BY-SA 3.0)

Everything under `mods/empires/packs/zeroad/` is a **derived work** of art
from **0 A.D.** by **Wildfire Games** (https://www.wildfiregames.com/),
licensed under **CC BY-SA 3.0** (https://creativecommons.org/licenses/by-sa/3.0/).
Sprites, terrain and icons were rendered or converted from the game's models,
textures and UI art by `art/zeroad/` at the commit recorded in
`mods/empires/packs/zeroad/pack.json`. These derived files are released under
the same license; the pack folder carries its own `LICENSE`, and
`pack.manifest.json` lists every output file with its source files. Some 0 A.D.
textures originate from CGTextures, which permitted their distribution under
CC BY-SA as part of 0 A.D. Code in this repository stays Apache-2.0.

## Patterns

The role router, drawing kit, `fitLayout()`, boot screen and generated-art
pipeline follow the "Herdr 98" layout shipped with the Herdr app
(https://github.com/herdrdev/herdr-app, Apache-2.0); see `NOTICE`.

## Not used

No files from any commercial game, no CC-NC or "free for personal use"
material. The only tier-D (CC BY-SA) material is the 0 A.D. pack above, kept in
its own folder. The optional local import (`tools/aoe2de-import/`) contains
code only; what it builds stays on the user's machine. Program icons shown in unit portraits
come from the person's own Herdr install (`icons/`), not from this repository.
