# 3D models and credits

Nearly everything in the game is built from code (shapes, canvas textures, synthesised sounds). A few rooms and characters also use **real 3D models**, from the KayKit packs by Kay Lousberg ([kaylousberg.com](https://www.kaylousberg.com)), released under **CC0** (public domain: free for any use, credit is optional but appreciated).

| Pack | Used for |
|---|---|
| KayKit Dungeon Pack | The Citadel of Traitors: wall torches, pillars, the Prize Pot chest and coins, bookcases, the banquet table and chairs, beds, barrels and crates, a mimic chest, keys |
| KayKit Halloween Bits | The Citadel: the burial ground by the Banishment Gate (gravestones, crypt, fences, dead trees, lantern posts), skull and ribcage in the Dungeon |
| KayKit Adventurers and Skeletons | The Citadel's end-game reveal: animated characters for the 9 Traitors roles (Mage = Seer, Rogue = Dagger Bearer, Knight = Guardian, Barbarian = Loyalist, hooded Rogue = Recruiter, Ranger = Mole, Engineer = Blackmailer, Skeleton Minion = Recruit, Necromancer = Head Traitor), and two skeleton prisoners in the Dungeon |
| KayKit Mystery Monthly characters | The end-game reveal for the other scripts: Space Ranger = Security Chief, Robot One = Droid, Cleric = Medic, Clown = Clown, Animatronic = Jester, Witch = Hexer, Paladin = Sentinel, Survivalist = Stowaway, Ninja = Hacker, Plant Warrior = Spore Host, Toy Soldier = Marine, Vampire = Coroner (the Engineer shares the Adventurer Engineer). Several hold a small prop in their right hand (a syringe, baton, staff, laptop, crate or balloon; see `ROLE_PROPS` in `models.js`). All of them share one rig, so one `anims.glb` (Idle_A, Idle_B) animates every character |
| KayKit Restaurant Bits | Black Hole Blues: a kitchen and dining tables in the Galley |
| KayKit Furniture Bits | Black Hole Blues: a lounge in the Crew Quarters |
| KayKit Space Base Bits | Black Hole Blues: cargo stacks in the Cargo Bay, space farms in Hydroponics |

The Parasite is not a model: `public/js/world/parasite.js` builds it from code (a veined, breathing body with a toothed maw, one big and many small eyes that follow the camera, writhing tentacles, and the empty helmet at its feet). The remaining roles are small cartoon people built from shapes in `models.js` (`person()`: faces, hands, boots, belt, plus a prop or hat per role).

## How it works

- `public/assets/models/<pack>/<name>.glb` are the models. Every model of a pack shares one painted texture next to them.
- `public/js/world/assets.js` loads them: `await loadModels([...])` then `model('dungeon/chair')` gives a copy (or `null` if it could not be loaded, and the room simply goes without). `cloneSkinned()` copies an animated character. The loader (`GLTFLoader`) is only downloaded when a script needs models.
- The server serves `three`'s loaders from `/vendor/three-addons/` and the models from `/assets/` (cached for a day).
- The Citadel's rooms (`traitors-rooms.js`) and exterior (`traitors-exterior.js`) fetch their models the first time the castle is shown. The station's rooms (`classic-rooms.js`) do the same; until its models arrive, the plain boxes that used to stand in those rooms stay (ship.js keeps them in a "fallback" group per room).
- Static models are merged into a few meshes per pack, so a whole castle costs a handful of draw calls. Animated characters and the Prize Pot's coins stay separate.

## Adding more

The source packs are not in this repository (only the models the game uses). To add a model:

```bash
node tools/pack-models.mjs "<pack>/Assets/gltf" "<pack>/textures/<texture>.png" public/assets/models/<pack-name> model_a model_b
node tools/pack-animations.mjs "<pack>/Animations/gltf/Rig_Medium/Rig_Medium_General.glb" public/assets/models/characters/anims.glb Idle_A Idle_B
```

`pack-models.mjs` turns each `.gltf` plus its `.bin` into one `.glb` (one request per model). `pack-animations.mjs` cuts a few clips out of an animation file, so the game only downloads what it plays (two idle loops are about 70 KB; the whole file is 800 KB). Then add the model's id to a `MODEL_NAMES` list and place it with `put(...)`.

Many more packs are free to use the same way (KayKit Prototype, Block, Board Game, City Builder, Forest Nature, Fantasy Weapons...), and the Kenney asset packs are CC0 as well.

# Icons, fonts and card art (the whole arcade)

**The games show ordinary emoji.** A custom icon set exists too, but it is **switched off**: open any page with `?icons=on` to see it (it is remembered in that browser) and `?icons=off` to go back. With it on, `public/js/icons.js` swaps each emoji for a small illustration as the page is drawn (and in canvas text such as name tags and the share card); emoji that are not in the map are left alone. With it off, `initIcons()` does nothing and `iconEl('skull')` gives the skull emoji. The default is one line (`ENABLED` in `icons.js`).

All of it is made from CC0 packs by Kenney ([kenney.nl](https://kenney.nl)) and KayKit:

| What | From | Where it lands |
|---|---|---|
| **Icon atlas**, 256 icons | 3D models (Kenney Cube Pets, Food Kit, Space Kit, Platformer Kit, Graveyard Kit, Furniture Kit, Weapon Pack, Blaster Kit..., KayKit Adventurers, Mystery Monthly, Skeletons, Halloween Bits, RPG Tools, Mixed Bag), Kenney Smilies, Game Icons, Board Game Icons, Generic Items, Medals, Alien UFO Pack, Planets, a few hand-made SVGs, and the game's own Parasite model | `public/assets/icons/atlas.webp` (one image, 16 icons wide) |
| **Card portraits**, 92 | The same models, drawn bigger: Cube Pets for the animal crew, KayKit characters for Captains and Crew, monsters for Void Beasts, and the object icons for Gear, Protocols and Boosts | `public/assets/phase/art/<card id>.webp` |
| **Fonts** | Kenney Future and Future Narrow, Kenney Mini Square, Rocket, Space, Pixel (CC0), plus Sixtyfour, Chakra Petch and Doto from Google Fonts | `public/assets/fonts/`, `public/css/fonts.css` and `typography.css` |
| **Effects** | Kenney Explosion Pack and Particle Pack | `public/assets/phase/fx/` |

The type system lives in `public/css/typography.css`: Sixtyfour for logos, **Kenney Future** for headings, buttons and labels, **Kenney Future Narrow** for card names, **Kenney Mini Square** for tiny capitals, and **Chakra Petch** for everything you read. It only swaps the font variables the stylesheets already use.

## Making the pictures

The source packs are not in this repository. `tools/art` has everything to rebuild the pictures from them:

```bash
node tools/art/serve.mjs                 # a local server for the tool pages (KENNEY_DIR and KAYKIT_DIR say where your packs are)

# icons: edit tools/art/icon-table.mjs (a name, the emoji it replaces, and its source), then
node tools/art/build-icons.mjs           # writes tools/art/icons.json, public/js/icon-map.js and public/css/icon-index.css
# open http://localhost:3055/art/icons.html?cols=16&size=48&save=1   (draws and saves public/assets/icons/atlas.*)

# card portraits: edit tools/art/portrait-table.mjs, then
node tools/art/build-portraits.mjs
# open http://localhost:3055/art/icons.html?spec=/art/portraits.json&sep=1&size=192&save=1
```

`tools/art/sheet.html` and `contact.html` are for browsing tile sheets and folders of images, and `fonts.html` shows fonts side by side. The model list the tool uses (`tools/art/models.json`) is generated from your packs and is not committed. If you change the icon table you must redraw the atlas: a test fails when `icon-map.js` and `atlas.json` disagree.
