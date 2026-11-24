# Ember Crypt

A small Diablo II–style isometric action RPG for phones, played in landscape. Play it at
**https://jim-avatech.github.io/ember-crypt/** (on iPhone: Share → Add to Home Screen for full screen).

## v0.1 — first playable slice

- **One class:** the Barbarian (Str 30 / Dex 20 / Vit 25 / Energy 10, D2 starting stats).
- **One dungeon:** the Ember Crypt — rooms and corridors generated from a seed, torches, darkness outside your light radius, an automap.
- **Two monsters + a boss:** slow, tough Zombies; fast Fallen that come in packs; and Rotfang the Hollow in the farthest room. Kill him to open stairs to a harder level.
- **Controls:** an invisible floating joystick on the left half (put your thumb down anywhere, drag to move, lift to stop). Attack button on the right — no auto-attack; hold to keep swinging. Three skill buttons and two potion buttons.
- **Skill tree:** all three D2 Barbarian tabs (Combat Skills, Combat Masteries, Warcries) with the classic names, level gates and prerequisites. Working now: Bash, Double Swing, Stun, Leap, Leap Attack, Sword/Axe/Mace Mastery, Iron Skin, Increased Speed, Howl, Find Potion, Shout, Battle Orders. The rest show as "coming soon".
- **Loot:** Normal (white) items only — swords, axes, maces, armor, helms, shields, gloves and boots with D2 base stats and Str/Dex requirements. Gold and healing/mana potions. Tap an item's name to pick it up; equip from the Bag.
- **Leveling:** XP from kills; each level gives 1 skill point and 5 stat points.
- Health and mana globes, enemy health bars, damage numbers, crits, hit flashes, knockback, screen shake, synthesized sound effects, a death and respawn screen.
- Progress saves on the device. Settings: show joystick (debug), sound, screen shake, item labels, new character.

## Develop

```bash
npm install
npm run dev          # http://localhost:5174/ember-crypt/
npm run build
node scripts/e2e.mjs # phone-landscape touch test (needs the dev server running)
```

Plain TypeScript + Canvas 2D, built with Vite. No game engine.
