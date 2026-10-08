# No More Space: game design

A starship has picked up something it shouldn't have. A **Parasite** wears the face of a crew member, helped by **Saboteurs**. The crew must work out who to **airlock** before there's no more space left aboard.

Inspirations:
- **Blood on the Clocktower**: hidden roles with special abilities, night actions, a "demon" (Parasite) and "minions" (Saboteurs). Dead players stay in the game and get one ghost vote.
- **The Traitors**: the infiltrators know each other, and the crew doesn't know anyone.
- **Among Us**: the space setting, voting players out of the airlock, and later a 3D ship to walk around.

## Current rules (v0.1)

**Players:** 5–15. One player creates a ship and shares the 4-letter code.

**Teams**
| Role | Team | Ability |
|---|---|---|
| The Parasite | Infiltrator | Each night from night 2, consume one player. If the Parasite is airlocked, the crew wins. |
| Saboteur | Infiltrator | Knows the Parasite. No power, just lies. (1 per ~3 players) |
| Medic | Crew | Each night from night 2, shields one player. Can't pick the same player twice in a row. |
| Scanner | Crew | Each night, learns if a player is crew or infiltrator. |
| Captain | Crew | Airlock vote counts twice. |
| Crew Member | Crew | No ability. |

**Round loop**
1. **Night**: players with abilities choose a target. The night ends as soon as everyone has acted.
2. **Morning**: the ship learns who (if anyone) died.
3. **Day**: talk (voice chat or in person), then everyone votes to airlock someone, or skips. A player is airlocked if they get votes from at least half of the living players, more votes than "skip", and no tie for first place. The host can close voting early.

**Winning**
- **Crew** wins when the Parasite is airlocked.
- **Infiltrators** win when only 2 players remain alive.

Roles are only revealed when the game ends.

## Ideas to build next

Roughly easiest first:
- [ ] Day timer and a nomination step (BotC-style: someone nominates, then everyone votes on that person)
- [ ] More roles: *Engineer* (learns how many infiltrators sit next to them), *Stowaway* (crew member who shows up as an infiltrator to the Scanner), *Mimic* (Saboteur who shows up as crew)
- [ ] Text chat, plus private infiltrator chat at night
- [ ] Sound effects and a nicer ship-themed UI
- [ ] Ship map: rooms where tasks happen and sabotage can occur (Among Us-style)
- [ ] **3D**: a lightweight [Three.js](https://threejs.org) scene of the ship with player avatars. Loaded only in the browser, so it costs the server nothing extra.
