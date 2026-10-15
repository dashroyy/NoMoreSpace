# 3D models and credits

Nearly everything in the game is built from code (shapes, canvas textures, synthesised sounds). A few rooms and characters also use **real 3D models**, from the KayKit packs by Kay Lousberg ([kaylousberg.com](https://www.kaylousberg.com)), released under **CC0** (public domain: free for any use, credit is optional but appreciated).

| Pack | Used for |
|---|---|
| KayKit Dungeon Pack | The Citadel of Traitors: wall torches, pillars, the Prize Pot chest and coins, bookcases, the banquet table and chairs, beds, barrels and crates, a mimic chest, keys |
| KayKit Halloween Bits | The Citadel: the burial ground by the Banishment Gate (gravestones, crypt, fences, dead trees, lantern posts), skull and ribcage in the Dungeon |
| KayKit Adventurers and Skeletons | The Citadel's end-game reveal: animated characters for the 9 Traitors roles (Mage = Seer, Rogue = Dagger Bearer, Knight = Guardian, Barbarian = Loyalist, hooded Rogue = Recruiter, Ranger = Mole, Engineer = Blackmailer, Skeleton Minion = Recruit, Necromancer = Head Traitor), and two skeleton prisoners in the Dungeon |
| KayKit Mystery Monthly characters | The end-game reveal for the other scripts: Space Ranger = Security Chief, Robot One = Droid, Cleric = Medic, Clown = Clown, Animatronic = Jester, Witch = Hexer, Paladin = Sentinel, Survivalist = Stowaway, Ninja = Hacker, Plant Warrior = Spore Host, Toy Soldier = Marine, Vampire = Coroner (the Engineer shares the Adventurer Engineer). Several hold a small prop in their right hand (a syringe, baton, staff, laptop, crate, balloon, wand, bottle, clipboard, flag...; see `ROLE_PROPS` in `models.js`). All of them share one rig, so one `anims.glb` (Idle_A, Idle_B) animates every character |
| KayKit Mystery Monthly, more characters | The rest of the cast: Protagonist A = Comms Officer, Lorekeeper = Archivist, Hiker = Navigator, Magical Girl = Scanner, Robot Two = Black Box, Marksman = Gunner, Superhero = First Officer, Caveman = Space Drunk, Avian Swordsman = Ambassador, Monster costume = Incubator and Patient Zero, Driver = Smuggler, Werewolf man = Lion Tamer, Helpers = Acrobat and Blood Donor, Tiefling = Palm Reader, Farmers = Ticket Taker, Stagehand and Hypochondriac, Mage = Magician, Animatronic (bear) = Method Actor, Rogue = Knife Thrower, Protagonist B = Contact Tracer, Action Figure = Biohazard Sensor, Skeleton Mage = Bioterrorist, Druid = Quack Doctor. `test/characters.test.js` checks that every role in the game has a model and every model file exists |
| KayKit Mystery Monthly series 4, 5 and 6 (more characters) | The newer roles: Hoarder = Quartermaster, Clanker = Diagnostics Tech, Space Ranger (flight mode) = Pathfinder, Paladin with helmet = Peacekeeper, Orc Brute = Barker, Werewolf (wolf form) = Sniffer Dog, Barbarian = Daredevil, Druid = Conspiracy Theorist, Frost Golem = Antibody, Black Knight = Mastermind, 4GTN robot = Signal Jammer, Monstrosity = Black-Market Pharmacist. The Magician is now the Driver in a top hat, and the Blackmailer the Tiefling |
| KayKit Skeletons (more characters) | Skeleton Minion in a beret = Mime, Skeleton Warrior = Framer, Skeleton Rogue = Pickpocket |
| KayKit Restaurant Bits | Black Hole Blues: a kitchen and dining tables in the Galley |
| KayKit Furniture Bits | Black Hole Blues: a lounge in the Crew Quarters |
| KayKit Space Base Bits | Black Hole Blues: cargo stacks in the Cargo Bay, space farms in Hydroponics |
| KayKit Mystery Monthly Combat Mech | Ruler of the Galaxy: Mecha-Nova Prime (animated with the shared `anims.glb`) |
| Kenney Space Station Kit (CC0) | The classic station (Black Hole Blues), in `assets/models/station/`: consoles along the Bridge's north wall and side walls and in the Navigation and Comms rooms, seats and a rail at the Observation Deck's window with a hologram table, three beds in the Medbay and in the Quarters, a locker and screens, containers in the Airlock, pipe rings in the Reactor. The models are about half a metre, so `classic-rooms.js` scales them up (2.2 to 2.6) to suit the crew. They all share one palette texture, `station/Textures/colormap.png` |
| Kenney Space Kit, more models (CC0) | The classic station, in `assets/models/spacekit/`: generators and barrels in the Reactor and the Engine Room, a cable box in Comms, and outside a docked cargo ship and a racer and one of the two patrol ships (`classic-exterior.js`). The same grid-offset models as Ruler's, with the offset fixed when they load (see below). The turret, the other patrol ship and the ring of rocks and meteors are **the very files Ruler of the Galaxy ships** (`assets/models/ruler/`), shared rather than copied |
| Kenney Space Kit (CC0, [kenney.nl](https://kenney.nl)) | Ruler of the Galaxy (`assets/models/ruler/`): the Chronos Syndicate's craft, the Goliath's turret, and the rocks and meteors of the asteroid belt. `test/ruler.test.js` checks every model the scene loads exists and every file there is used |

**Kenney's models.** Kenney's packs already ship as one `.glb` per model, so `tools/copy-models.mjs` just picks the ones the game uses (`node tools/copy-models.mjs "<pack>/Models/GLB format" public/assets/models/station --textures="<pack>/Models/GLB format/Textures" chair computer ...`). Two things to know. The Space Station Kit points every model at `Textures/colormap.png`, so that folder is copied next to them; `assets.js` shares one material between them and keeps the palette's colours crisp. And every Space Kit model sits off to one side of its own origin (its node is moved to a spot on a grid): `assets.js` puts the footprint back in the middle when a `spacekit/` model loads, and the exterior's `fit()` does the same for the shared `ruler/` ones. `test/stationmodels.test.js` makes sure every model the station asks for exists, is loaded before it is placed, and that no file goes unused.

The Parasite is not a model: `public/js/world/parasite.js` builds it from code (a veined, breathing body with a toothed maw, one big and many small eyes that follow the camera, writhing tentacles, and the empty helmet at its feet). The few roles that are not people are built from shapes in `models.js`: the Mimic, the Stage Double and the Hazmat Tech wear the same little astronaut the players do (`suited()`), the Reflection is a framed mirror and the Carrier a spotted blob.

**Every character has a dark cartoon outline**, so a whole cast of different models reads as one set and nobody vanishes against a bright wall. `public/js/world/outline.js` makes it: a copy of each mesh, pushed out along its smoothed normals and drawn back-faces only (no per-frame work; it follows skinned animation for free). `outlineGroup()` merges one shell around a still group (the astronaut's body and limbs), `outlineEach()` puts one on every mesh (hats, pets, shape-built roles) and `outlineSkinned()` copies a skinned character's skeleton. The Parasite skips it: it is hundreds of pieces already.

**The bigger characters.** Six of the newer characters (Black Knight, Clanker, Frost Golem, Monstrosity, 4GTN robot, Orc Brute) use KayKit's bigger skeleton, `Rig_Large`, which has proportions of its own. They play `anims_large.glb` (the large idle loops, packed with `tools/pack-animations.mjs` from `Rig_Large_General.glb`) instead of `anims.glb`. `LARGE_RIG` in `models.js` lists them, and `test/characters.test.js` checks the list against the files' real rigs.

**Hats and props.** A role can have a hand prop (`ROLE_PROPS`: a lantern, a megaphone, a goblet, a framed picture...) and a hat (`ROLE_HEADS`: the Magician's top hat, the Mime's beret, the Conspiracy Theorist's tin-foil cone, the Barker's boater, the Daredevil's stunt helmet). Hats are built one head wide and fitted to each character's head by `crown()`, so they sit right on a skeleton, an orc or a druid with antlers. The Cuckoo is built from shapes: a speckled bird with flapping wings in a nest of twigs, with an egg that is not its own. `test/characters.test.js` makes sure no two roles on one script share a character.

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

## The players' astronaut

`public/js/world/avatar.js` builds the suit from capsules and spheres: a chunky body under a big round glass helmet (the head is about as big as the body), glowing eyes behind a tinted visor, headset pods on both sides, a band over the top in the suit colour, a chest panel with blinking lights, cuffs, round gloves and boots. `SUIT_SCALE` shrinks the whole thing a touch so the crew fits the rooms, and `HAT_SCALE` fits the hats (drawn for a smaller helmet) to the big one. Everything is the same shape for everyone, so nobody can tell roles apart; colours, hats, visors and pets are cosmetic.

To look at the characters without playing, run `node tools/art/serve.mjs` and open `http://localhost:3055/art/characters.html` (`?view=avatars` for the suit with hats and visors, `?view=roles` for every role model, `?view=chars` for every character file in the assets folder; `&tile=`, `&cols=` and `&turn=` change the size, the width and the angle).

# Icons, fonts and card art (the whole arcade)

**The games show ordinary emoji.** A custom icon set exists too, but it is **switched off**: open any page with `?icons=on` to see it (it is remembered in that browser) and `?icons=off` to go back. With it on, `public/js/icons.js` swaps each emoji for a small illustration as the page is drawn (and in canvas text such as name tags and the share card); emoji that are not in the map are left alone. With it off, `initIcons()` does nothing and `iconEl('skull')` gives the skull emoji. The default is one line (`ENABLED` in `icons.js`).

All of it is made from CC0 packs by Kenney ([kenney.nl](https://kenney.nl)) and KayKit:

| What | From | Where it lands |
|---|---|---|
| **Icon atlas**, 256 icons | 3D models (Kenney Cube Pets, Food Kit, Space Kit, Platformer Kit, Graveyard Kit, Furniture Kit, Weapon Pack, Blaster Kit..., KayKit Adventurers, Mystery Monthly, Skeletons, Halloween Bits, RPG Tools, Mixed Bag), Kenney Smilies, Game Icons, Board Game Icons, Generic Items, Medals, Alien UFO Pack, Planets, a few hand-made SVGs, and the game's own Parasite model | `public/assets/icons/atlas.webp` (one image, 16 icons wide) |
| **Card portraits**, 92 | The same models, drawn bigger and with a bold dark outline (it grows with the picture size, so the same look as the characters in the ship): Cube Pets for the animal crew, KayKit characters for Captains and Crew, monsters for Void Beasts, and the object icons for Gear, Protocols and Boosts | `public/assets/phase/art/<card id>.webp` |
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
