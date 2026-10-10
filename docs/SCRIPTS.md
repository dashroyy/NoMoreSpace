# Scripts

A **script** is a whole cast of characters plus a story, exactly like Blood on the Clocktower's *Trouble Brewing*, *Bad Moon Rising* and *Sects & Violets*. The host picks one in the docking bay; ARIA (or the Captain) only deals roles that are on it, and the wiki, the claim menu and the notebook only list those roles.

| Script | Players | Feel |
|---|---|---|
| 🕳️ **Black Hole Blues** (`classic`) | 3–15 | The original game: a ship falling into a black hole. The gentlest script, built on *Trouble Brewing*. |
| 🎪 **Cosmic Carnival** (`carnival`) | 5–15 | A space circus with a Parasite in the troupe. Twins, tricks, pies, a method actor and a mirror demon. |

Everything about scripts lives in a few places:

- `server/scripts.js`: the registry (name, icon, story, rules, role lists, which demons can appear).
- `server/roles.js` + `server/roles-carnival.js`: every role. Roles are shared across scripts; a script just lists the ids it uses.
- `server/storyteller.js`: dealing a cast for a script (`pickRoles(n, random, script)`), plus the stories each script tells.
- `server/engine.js`: the rules. Abilities that need more than "choose a player and learn something" are coded here.

---

## What the research said

I read the BotC wiki and the official script pages, and looked at what the community builds (Teensyville scripts, the recommended custom scripts and the "Script of the Day" write-ups).

**The official scripts each have one big idea.**
- *Trouble Brewing*: clean information and simple lies. The learning script.
- *Bad Moon Rising*: "a death extravaganza". Demons kill several times a night, so the good team has to work out *how* each person died. It adds protections, resurrection and risky abilities (the Gambler, the Innkeeper, the Professor, the Moonchild).
- *Sects & Violets*: "the craziest of the three". Characters change alignment, players change characters, and madness appears for the first time. Which Demon is in play decides how far you can trust any information (the Vortox makes all of it false).

**What the designers say makes a good script.**
- *No obvious "should".* If one team has a clearly correct strategy, rethink the design.
- *Build in conflict.* If an information role can never be wrong, add something that can make it wrong (a Recluse for the Empath).
- *Design for your group.* Complicated scripts only work for groups that like that kind of game.
- Smaller casts are easier to get right (Teensyville scripts use 6 Townsfolk, 2 Outsiders, 2 Minions, 1 or 2 Demons).

**What community scripts reward.** The popular ones each build around one hook: a no-death night and a final choice (*Executionology*), an execution that triggers a last stand (*Ride the Cyclone*), trust falls when things go wrong (*The Certainty Paradox*), legion paranoia (*Rhetoric*), "equivalent exchange" with characters that swap things (*Alchemy 101*).

**What worked best for a space party game.** Out of the whole pool, these mechanics produce public, dramatic moments rather than private bookkeeping, and they work with our night prompts, proximity chat and ghost play:
1. *Guessing games with a stake* (Exorcist): pick who you think the Demon is.
2. *Confident liars* (Lunatic): a good player who is certain they are the Demon.
3. *Last acts that can lose the game* (Klutz): a dying pie-throw.
4. *Twins* (Evil Twin): the crew cannot win while both twins live.
5. *Traps* (Witch): a curse that kills whoever nominates.
6. *Second chances* (Professor, Fool): resurrection and nets.
7. *A demon that changes the rules* (Vortox): all clues false, and you must execute every day.

---

## 🎪 Cosmic Carnival

*Roll up, roll up! The Greatest Show in the Galaxy begins. Above the Big Top, the Great Grin hangs in the sky, a clown moon with a bottomless mouth, waiting for the final act. Somewhere in the troupe, something hungry is wearing a costume.*

### A disaster of its own: the Great Grin

Every script has a **theme** in `server/scripts.js`: what the disaster is called, and the words each screen uses for it. Black Hole Blues is about a black hole. The Carnival is **not** about a black hole at all. The troupe's travelling Big Top has drifted into the orbit of the **Great Grin**, a colossal clown-faced moon with a rainbow wig, a pulsing red nose and a bottomless mouth. Like the black hole, it creeps closer every night and every death, and when only two players are left alive it swallows the Big Top ("the final curtain falls: no more show").

What changes when a ship plays the Carnival:

- **Sky and windows.** The windows, the Observation Deck and the sea of stars under the ship show the Great Grin (growing as the show nears its end) among drifting confetti instead of a black hole. The table hologram becomes a bobbing red clown nose.
- **Words.** The HUD meter, the dawn warning ("The Big Top shudders…"), the win and lose titles, the end-of-game reveal, the share card, the replay card, the narrator's name tag, the night subtitle, the Captain's announcement buttons, the wiki's story page and every ending told by the engine all use the Carnival's theme.
- **Rooms.** The ship's rooms get circus names: the Bridge is **The Center Ring**, the Observation Deck is **The Ferris Wheel**, Navigation is **The Carousel**, Comms is **The Calliope**, the Medbay is **The Clown Clinic**, the Galley is **The Snack Stand**, the Reactor is **The Spark Tent**, the Engine Room is **The Cannon Bay**, Hydroponics is **The Topiary Garden**, the Airlock is **The Human Cannon**, Crew Quarters is **The Caravans** and the Cargo Bay is **The Prop Room**. Room ids and rules are unchanged; only the names are.
- **Room dressing** (`public/js/world/carnival-rooms.js`). The space-station props, pipes, panels, server racks and ambience particles are hidden, and each room becomes the thing its name promises: a rotating **Ferris wheel** on the Observation Deck, a **carousel** with bobbing horses in Navigation, a steam **calliope** wagon and little stage in Comms, a **clown clinic** with polka-dot beds, a giant red nose and a balloon dog, a **snack stand** (striped awning, popcorn machine, spinning cotton candy, lollipops), two **Tesla coils** that arc and a **high striker** whose puck climbs to the bell in the Spark Tent, two striped **circus cannons** that fire confetti in the Cannon Bay (and a bigger one in the Human Cannon), a **topiary garden** (a snowman hedge, a balloon tree, a fountain, sunflowers), **caravans** and a **clown car** stuffed with hats, and a **prop room** with giant dice, trunks, juggling pins, top hats, a unicycle and the Magician's starry cabinet. Every room also gets a tent-pattern floor, striped poles, a string of bunting along the north wall and a circus-coloured light; the corridors get red and gold runners; the Center Ring gets a ringmaster's podium. All of it is painted with shapes and canvas patterns (no image files), merged into a few meshes, and only built into the picture while the script is the Carnival.
- **Room sounds.** Each room has circus sounds instead of the station's hums (`CARNIVAL_SOUNDS` in `public/js/world/soundscape.js`): a music-box tune and ratchet clicks at the Ferris Wheel, an oom-pah-pah waltz at the Carousel, a wheezing calliope run in Comms, squeaky toys and honks in the Clown Clinic, popcorn pops and a till ding at the Snack Stand, zaps and the high striker's bell in the Spark Tent, a whistle and a fwump from the Cannon Bay, a drum roll and a BOOM at the Human Cannon, a campfire and a clown-car horn in the Caravans, and a rubber chicken in the Prop Room. They swap in and out as the host changes script.
- **The outside.** Instead of solar wings, a comms mast and a shuttle, the Big Top is ringed by the rest of the fairground (`public/js/world/carnival-exterior.js`): a **roller coaster** with cars running off the Caravans, a **swing ride** at the end of a striped boardwalk off the Human Cannon, a sunken **big top tent** behind the Prop Room, a **"The Greatest Show in the Galaxy" banner** and balloon clusters behind the Ferris Wheel, a striped **circus rocket** with a red nose where the shuttle docked, and a giant striped drum under the Center Ring. Bulbs chase round the tent, the coaster and the lamp posts. Nothing here is above the places people walk.

The big idea: **every role has a moment on stage**. The roles that matter are public gambles and surprises, not private bookkeeping, and half of them can swing the whole game with one dramatic reveal.

### The cast

| Role | Type | Inspired by | What it does |
|---|---|---|---|
| 🦁 Lion Tamer | Crew | Exorcist | Each night*, guess who the Parasite is (never the same player twice in a row). A right guess stops it that night and unmasks the tamer. |
| 🤸 Acrobat | Crew | Fool | The first attack or airlocking is caught by a safety net. |
| 🖐️ Palm Reader | Crew | Dreamer | Each night, see two roles for a player: one real, one a decoy from the other side. |
| 🎟️ Ticket Taker | Crew | Flowergirl | Each night*, learn if the Parasite voted today. |
| 🎪 Stagehand | Crew | Chambermaid | Each night, learn how many of two players were woken by their abilities. |
| 🎩 Magician | Crew | Professor | Once per game, bring a dead Crew member back to life. |
| 🎈 Clown | Drifter | Klutz | When you die, throw a pie at a living player. If they are evil, the crew loses. (A slow Clown throws blind.) |
| 🎬 Method Actor | Drifter | Lunatic | Believes they are the Parasite and "kills" every night. Nothing happens; the real Parasite sees it all. |
| 🗡️ Knife Thrower | Saboteur | Assassin | Once per game, kill someone through any protection. |
| 👯 Stage Double | Saboteur | Evil Twin | Has a good twin they know. Airlock the twin and evil wins. The crew cannot win while both live. |
| 🧙 Hexer | Saboteur | Witch | Each night, hex a player: if they nominate tomorrow, they die. |
| 🪞 The Reflection | Demon | Vortox | All Crew clues are false. If a day ends with nobody airlocked, evil wins. |

The script also borrows seven Crew roles from Black Hole Blues (Engineer, Scanner, Coroner, Medic, Black Box, First Officer, Gunner) and four staples (Space Drunk, Stowaway, Hacker, Incubator). That makes 13 Crew, 4 Drifters, 5 Saboteurs and 2 Demons.

One of the two Demons is in play: the Parasite, or (7+ players, about 4 games in 10) the Reflection. Nobody is told which.

### Why it should be fun (and how it was checked)

- **Information is a trap in the best way.** With the Reflection possible, a clue is only worth what you believe about the Demon. Palm Reader visions that never add up are a tell.
- **Dilemmas, not solutions.** With a Stage Double aboard, executing the Parasite is not enough; executing the wrong twin loses at once. With a Reflection aboard, doing nothing loses.
- **Reversals everywhere.** Safety nets, resurrections, a Demon being stopped by a guess, a Clown's pie, a method actor discovering he was never the Parasite.
- **Scenarios for the wiki.** The wiki's Scripts page lists six "moments" (the Great Pie Fight, the Lion Tamer's gamble, twin trouble, the method actor, poof, the mirror cracks) so a new group knows what the game feels like before they play.

Robot-only simulation (about 1,100 games, 6 to 15 players) was used to catch rules that stall, never trigger or swamp the game:

- Every game finishes, and the crew wins 26% of all-robot games (Black Hole Blues: 27%). Robots are worse than people at deduction, so human crews win more.
- Per game, on average: about 1 hex curse (and a hexed nominator in 2 of 3 games), about 1 Lion Tamer guess (1 in 9 hits), a resurrection in 1 game in 3, a safety net or a knife in about 1 game in 7, and a Clown's pie in roughly 1 game in 11.
- How games end: 52% evil reaches two survivors, 26% the Parasite is airlocked, 9% the crew airlocks the good twin, 7% the Reflection wins by a day with no airlocking, 6% a Clown's pie lands on a villain.
- No role's games stray far from the average (crew win rate between 17% and 32% for every role).

It also found two things that were fixed: robots tying a vote (a second nomination with equal votes cancels the first), which made the Reflection nearly unbeatable; and a real engine bug where a player dying while "on the block" made dusk wait forever.

### Making a new script

1. Add roles to a `roles-<name>.js` file (the same fields as in `roles.js`) and merge them in `roles.js`.
2. Add an entry to `server/scripts.js`: id, name, icon, minimum players, blurb, rules, role ids, which demons can appear, and a `theme` (what the disaster is called, the win and lose lines, optional room names). If the disaster looks different from a black hole, add a painter for it in `public/js/world/sky.js` (`paintDoom`, `buildBackdrop`).
3. Put each new ability in `engine.js`: night prompts in `promptFor`/`computeDraft`, day triggers in `nominate`/`execute`/`beginDusk`/`kill`, and win rules in `checkWin`.
4. Teach the robots (`server/bots.js`): night targets in `nightTargets`, any new public moves.
5. Give each role a 3D model in `public/js/world/models.js` for the end-game reveal, and captions in `reveal.js` for new kinds of events.
6. Add a `SCENARIOS`-style "moments" list to the wiki, a story voice in `storyteller.js`, and tests (see `test/carnival.test.js`).

### Ideas for the next scripts

- **Outbreak** (from *Bad Moon Rising*'s Pukka and Zombuul, and the community's "poison and cure" scripts): the Parasite *infects* instead of killing; the infected person's abilities malfunction and they burst the next night unless cured. Executing the carrier cures everyone. Roles: a Vaccinator, a Contact Tracer (does the infected sit next to X?), a Lab Technician (how many abilities malfunctioned?), a Quarantine Officer.
- **Quantum Rift** (from *Sects & Violets*): clones and swaps. A Cryo Technician who swaps roles with the Parasite when they pick it (the Snake Charmer), a Copycat that borrows an ability (the Philosopher), a Re-roller (the Pit-Hag), and a Reflection that makes everything false.
- **Mutiny at the Hub** (from *Trouble Brewing* plus Traveller ideas): late joiners who arrive mid-game as stowaways with a one-night ability.
- **Cult Night** (from the Cult Leader and Fearmonger): a secret "join us" vote where the crew can win by all agreeing.

### Sources

- [Bad Moon Rising](https://wiki.bloodontheclocktower.com/Bad_Moon_Rising), [Sects & Violets](https://wiki.bloodontheclocktower.com/Sects_%26_Violets) (the BotC wiki)
- Character pages used for the adaptations: [Exorcist](https://wiki.bloodontheclocktower.com/Exorcist), [Fool](https://wiki.bloodontheclocktower.com/Fool), [Dreamer](https://wiki.bloodontheclocktower.com/Dreamer), [Flowergirl](https://wiki.bloodontheclocktower.com/Flowergirl), [Chambermaid](https://wiki.bloodontheclocktower.com/Chambermaid), [Professor](https://wiki.bloodontheclocktower.com/Professor), [Klutz](https://wiki.bloodontheclocktower.com/Klutz), [Lunatic](https://wiki.bloodontheclocktower.com/Lunatic), [Assassin](https://wiki.bloodontheclocktower.com/Assassin), [Evil Twin](https://wiki.bloodontheclocktower.com/Evil_Twin), [Witch](https://wiki.bloodontheclocktower.com/Witch), [Vortox](https://wiki.bloodontheclocktower.com/Vortox)
- [Teensyville scripts](https://bloodontheclocktower.com/teensyville) and the "Script of the Day" write-ups
- The official script design guidance (no obvious "should", build in conflict, design for your group)
