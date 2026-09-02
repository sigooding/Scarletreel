import type { Story } from "../types";
import type { SpriteSheet } from "../game/spriteSheet";

/**
 * SOUTH PARK: THE RECESS WARS — beta build.
 *
 * A pure 🚶 walkable-stage game (no prose scenes outside the two ending
 * cards): AI-generated paper-cut backgrounds and sprite sheets, the VERB
 * MENU on in every room, NPCs with patrol routes, one USE-item puzzle, a
 * room-entry cutscene at the pond, and language as wholesome as the real
 * fourth grade's. Assets live in /assets/southpark/ (generated + keyed by
 * scripts/southpark-prep.mjs).
 *
 * PASS-1 ASSET SET (10/10). A second pass (talking sheets, title card,
 * cafe + playground rooms, officer Barbrady, props) lands next; the data
 * below only uses what exists on disk.
 *
 * Sheets: every character is ONE sheet image — a frame grid with named
 * "walk" / "idle" animations. Cartman's mood grid (2x2: arms crossed,
 * point-smug, laugh) is drawn ON his pond marker as object art.
 */

/** Stan — the walker. 6-frame side-view walk strip; idle = standing frame. */
const SP_STAN_SHEET: SpriteSheet = {
  image: "assets/southpark/sp-stan-walk.png",
  frameWidth: 115,
  frameHeight: 222,
  animations: {
    idle: { frames: [0] },
    walk: { frames: [0, 1, 2, 3, 4, 5], fps: 8 },
  },
};

/** Cartman — the waddle. 6 frames facing RIGHT (the walker mirrors left). */
const SP_CARTMAN_SHEET: SpriteSheet = {
  image: "assets/southpark/sp-cartman-walk.png",
  frameWidth: 156,
  frameHeight: 211,
  animations: {
    idle: { frames: [0] },
    walk: { frames: [0, 1, 2, 3, 4, 5], fps: 7 },
  },
};

/** Kyle — 3x2 grid, 6 frames facing LEFT. */
const SP_KYLE_SHEET: SpriteSheet = {
  image: "assets/southpark/sp-kyle-walk.png",
  frameWidth: 175,
  frameHeight: 185,
  animations: {
    idle: { frames: [0] },
    walk: { frames: [0, 1, 2, 3, 4, 5], fps: 8 },
  },
};

/** Kenny — muffled orange burrito, 6 frames facing LEFT. */
const SP_KENNY_SHEET: SpriteSheet = {
  image: "assets/southpark/sp-kenny-walk.png",
  frameWidth: 132,
  frameHeight: 210,
  animations: {
    idle: { frames: [0] },
    walk: { frames: [0, 1, 2, 3, 4, 5], fps: 8 },
  },
};

/** Cartman's MOODS — 2x2: (0,1) arms-crossed angry, (2) point-smug, (3) laugh.
 *  Drawn on his pond confrontation marker so the object itself is Cartman. */
const SP_CARTMAN_MOODS: SpriteSheet = {
  image: "assets/southpark/sp-cartman-moods.png",
  frameWidth: 247,
  frameHeight: 289,
  animations: {
    angry: { frames: [0, 1], fps: 1.5 },
    smug: { frames: [2] },
    laugh: { frames: [3] },
  },
};

/** Spare pass-1 sheet: Stan's idle blink (2 frames) — polished player idle. */
export const SP_STAN_IDLE_SHEET: SpriteSheet = {
  image: "assets/southpark/sp-stan-idle.png",
  frameWidth: 241,
  frameHeight: 427,
  animations: {
    idle: { frames: [0, 1], fps: 1.2 },
  },
};

/** Shared stage tuning: snow town floor band, brisk fourth-grade walk. */
const stageBase = {
  speed: 20,
  reach: 4,
  keyboard: true,
  floor: { top: 58, bottom: 94 },
  depthScale: 0.35,
  hints: "proximity" as const,
  verbCoin: true,
  extendedVerbs: true,
};

export const SOUTH_PARK: Story = {
  id: "south-park-beta",
  title: "South Park: The Recess Wars",
  tagline: "Cartman repoed the sled. The fourth grade will burn. Language may occur.",
  startSceneId: "sp_bus",
  coverImage: "assets/southpark/sp-bg-busstop.png",
  verbMenuEnabled: true,
  playerSprite: { sheet: SP_STAN_SHEET },
  characters: [
    { id: "sp_stan", name: "Stan", role: "Fourth grader with a sled grudge", avatarUrl: "emoji:🧢", trustMeter: 0 },
    { id: "sp_kyle", name: "Kyle", role: "The sane one (barely)", avatarUrl: "emoji:🧒", trustMeter: 0 },
    { id: "sp_cartman", name: "Cartman", role: "King of Recess (self-declared)", avatarUrl: "emoji:🤬", trustMeter: 0 },
    { id: "sp_kenny", name: "Kenny", role: "Mmph mmph", avatarUrl: "emoji:🥶", trustMeter: 0 },
  ],
  items: [
    {
      id: "sp_snowball",
      name: "A Perfect Snowball",
      icon: "❄️",
      description: "Hand-packed at the bus stop. Legally a weapon inside South Park city limits.",
      flavorText: "It's the good snow. The packing kind.",
    },
    {
      id: "sp_key",
      name: "Frozen Locker Key",
      icon: "🗝️",
      description: "Cartman's sled key, pulled out of locker 27's vent solid as a puck.",
      flavorText: "Cold as a dump in January.",
    },
    {
      id: "sp_sled",
      name: "Lightning Muscle 3000",
      icon: "🛷",
      description: "The fastest sled on the fourth-grade black market. Repossessed by right of conquest.",
      flavorText: "'FOR OFFICIAL KING DUTIES ONLY' — fat magic marker, Cartman's handwriting.",
    },
  ],
  scenes: [
    /* ── SCENE 1 — THE BUS STOP ───────────────────────────────────── */
    {
      id: "sp_bus",
      title: "The Bus Stop",
      note:
        "BETA SCENE 1. Verb menu is ON (stage.verbCoin + extendedVerbs): pick a verb, click the world. " +
        "Cartman and Kyle are INTERACTABLE NPCs — walk to Cartman (or press N) to talk; the conversation sets sp_met_cartman. " +
        "The snow pile is the TAKE marker (a Perfect Snowball). Kick the black ice for a gag. Exit: walk off the RIGHT edge to school.",
      background: "assets/southpark/sp-bg-busstop.png",
      nodeType: "stage",
      stage: {
        ...stageBase,
        spawn: { x: 50, y: 88 },
        enterCaption: "Monday. Minus twenty. The sled is gone, and Cartman's smug waddle echoes across the snow.",
        enterScript: [{ do: "wait", seconds: 0.8 }, { do: "say", text: "Another shit-tastic Monday in South Park." }],
        enterScriptFlag: "sp_seen_bus",
        exitEdges: { right: { targetSceneId: "sp_hall", label: "South Park Elementary" } },
        npcs: [
          {
            id: "sp_cartman_npc",
            image: "emoji:😡",
            sheet: SP_CARTMAN_SHEET,
            x: 32,
            y: 86,
            speed: 6,
            talkHotspotId: "sp_bus_cartman",
            patrol: [
              { x: 32, y: 86, pause: 3, say: "Bow before the king, peasants." },
              { x: 66, y: 88, pause: 3, say: "The sled stays with the crown. Crown rules." },
            ],
          },
          {
            id: "sp_kyle_npc",
            image: "emoji:🧒",
            sheet: SP_KYLE_SHEET,
            x: 72,
            y: 91,
            speed: 6,
            facing: "left",
            patrol: [
              { x: 72, y: 91, pause: 4, say: "This is some bogus bullshit, Stan." },
              { x: 46, y: 92, pause: 4, say: "Just take the damn sled back." },
            ],
          },
        ],
      },
      prose: "",
      dialogueBeats: [
        { id: "sp_b_bus1", characterId: "sp_cartman", text: "Screw you guys — the sled is REPOED. Coon and Friends needs it for patrols. Also I'm King of Recess now. Those are the rules. I don't make the rules. Yes I do." },
        { id: "sp_b_bus2", characterId: "sp_stan", text: "It's OUR sled, you fat fuck. Your mom bought it with MY dad's money." },
        { id: "sp_b_bus3", characterId: "sp_cartman", text: "Fuck you, Stan. Possession is nine-tenths of the law, and I have all ten tenths. It's padlocked in my lair, and the key is hidden SO brilliantly even I don't know where it is." },
        { id: "sp_b_bus4", characterId: "sp_kyle", text: "That's not brilliant, that's a concussion with extra steps." },
        { id: "sp_b_bus5", characterId: "sp_cartman", text: "Whatever, hippie. Come take it. I daaaaare you." },
      ],
      hotspots: [
        {
          id: "sp_bus_cartman",
          label: "Cartman, gloating",
          bounds: { x: 30, y: 52, w: 22, h: 26 },
          cursor: "talk",
          isRepeatable: true,
          action: { type: "startDialogue", flagSet: "sp_met_cartman" },
        },
        {
          id: "sp_bus_snow",
          label: "A pile of perfect packing snow",
          bounds: { x: 12, y: 66, w: 12, h: 14 },
          cursor: "take",
          isRepeatable: false,
          showItemImage: true,
          action: { type: "giveItem", itemGranted: "sp_snowball" },
        },
        {
          id: "sp_bus_ice",
          label: "A sheet of black ice",
          bounds: { x: 58, y: 74, w: 14, h: 10 },
          cursor: "look",
          isRepeatable: true,
          customFailMessage: "The ice ignores your verbs, as ice does.",
          action: { type: "showText", text: "Black ice. The only honest politician in town." },
          verbs: {
            kick: { type: "showText", text: "Stan drop-kicks the ice. The ice wins. The ice always wins." },
            punch: { type: "showText", text: "You punch the black ice. Somewhere, a hip files a complaint." },
          },
        },
      ],
      choices: [],
    },

    /* ── SCENE 2 — THE SCHOOL HALLWAY ─────────────────────────────── */
    {
      id: "sp_hall",
      title: "South Park Elementary — Hallway",
      note:
        "BETA SCENE 2 and the USE-item puzzle: arm the snowball (verb coin, USE), then click Cartman's locker. " +
        "The snowball detonates, the vent pops, the frozen key drops. The trophy case is pure set dressing with opinions. " +
        "The janitor's stairs (marker) drop to the basement; the LEFT edge walks back to the bus stop.",
      background: "assets/southpark/sp-bg-hallway.png",
      nodeType: "stage",
      stage: {
        ...stageBase,
        spawn: { x: 12, y: 88 },
        enterCaption: "Twenty years of government-issue floor wax. Somewhere in here: locker 27, Cartman's starving vault.",
        entrySpawns: { sp_bus: { x: 10, y: 88 }, sp_basement: { x: 55, y: 88 } },
        exitEdges: { left: { targetSceneId: "sp_bus", label: "back to the bus stop" } },
      },
      prose: "",
      dialogueBeats: [],
      hotspots: [
        {
          id: "sp_hall_locker",
          label: "Locker 27 (the one with the fat face drawn on it)",
          bounds: { x: 30, y: 48, w: 14, h: 22 },
          cursor: "use",
          isRepeatable: true,
          // The USE-item puzzle: arm the snowball, click the locker. The
          // engine answers only when the accepted item is armed (and
          // consumes it), replying with the authored itemResponses line.
          action: { type: "useItem", itemConsumed: "sp_snowball", itemGranted: "sp_key", flagSet: "sp_got_key" },
          acceptsItems: ["sp_snowball"],
          itemResponses: {
            sp_snowball: "The snowball detonates against the vent. Something clinks, rattles, and drops: a key frozen solid — Cartman's sled padlock key. He hid it in his SCHOOL locker. Nobody said he was smart.",
          },
          verbs: {
            look: { type: "showText", text: "Locker 27. It hums with the gravitational pull of half-eaten Cheesy Poofs. The vent above the handle looks loose." },
            punch: { type: "showText", text: "You punch the locker. The locker feels nothing. Somewhere, Cartman's chin wobbles in sympathy." },
            talk: { type: "showText", text: "You tell locker 27 about your feelings. It stores them with everything else Cartman hides." },
          },
          customFailMessage: "Arm the snowball (USE) and click the locker — that vent isn't going to blow itself.",
        },
        {
          id: "sp_hall_trophy",
          label: "The trophy case",
          bounds: { x: 62, y: 46, w: 14, h: 18 },
          cursor: "look",
          isRepeatable: true,
          action: { type: "showText", text: "Kyle's science fair trophy: 'Most Radioactive Volcano, Grade 4.' The volcano later sued." },
          verbs: {
            kick: { type: "showText", text: "One day that trophy will be worth money. Today it just judges you." },
          },
        },
        {
          id: "sp_hall_basement",
          label: "The janitor's stairs (they lead to Cartman's basement somehow)",
          bounds: { x: 84, y: 62, w: 11, h: 18 },
          cursor: "go",
          isRepeatable: true,
          action: { type: "goToScene", targetSceneId: "sp_basement" },
        },
      ],
      choices: [],
    },

    /* ── SCENE 3 — CARTMAN'S BASEMENT ─────────────────────────────── */
    {
      id: "sp_basement",
      title: "Cartman's Basement (The Lair)",
      note:
        "BETA SCENE 3. The sled is gated on the frozen key: TAKE is refused until sp_key is in the satchel. " +
        "Cartman stands in his lair as an interactable NPC — talk first for the full Cartman experience. " +
        "Taking the sled sets sp_got_sled, which unlocks the RIGHT edge to Stark's Pond (yellow arrow until then).",
      background: "assets/southpark/sp-bg-basement.png",
      nodeType: "stage",
      stage: {
        ...stageBase,
        spawn: { x: 12, y: 88 },
        enterCaption: "The lair smells like Cheesy Poofs and tyranny. The Lightning Muscle 3000 sits under a padlock that has never known love.",
        entrySpawns: { sp_hall: { x: 10, y: 88 } },
        exitEdges: {
          left: { targetSceneId: "sp_hall", label: "back up to school" },
          right: {
            targetSceneId: "sp_pond",
            label: "Stark's Pond",
            gating: { requiresFlags: ["sp_got_sled"] },
            lockedLine: "Walk to Stark's Pond WITHOUT the sled? And break the whole third act? Get the sled.",
          },
        },
        npcs: [
          {
            id: "sp_cartman_lair",
            image: "emoji:😡",
            sheet: SP_CARTMAN_SHEET,
            x: 62,
            y: 84,
            speed: 4,
            talkHotspotId: "sp_base_cartman",
            patrol: [{ x: 62, y: 84, pause: 5, say: "It's not a basement, it's a LAIR, you poor piece of shit." }],
          },
        ],
      },
      prose: "",
      dialogueBeats: [
        { id: "sp_b_base1", characterId: "sp_cartman", text: "Respect my authoritah! This is my fortress of solitude. Mom says I can have the basement until she needs the dryer." },
        { id: "sp_b_base2", characterId: "sp_stan", text: "Give us the sled back, Cartman, or I swear to God—" },
        { id: "sp_b_base3", characterId: "sp_cartman", text: "SWEAR TO WHO? Also there is DEFINITELY no key in my locker at school. Locker 27? Never heard of her. Ignore this entire sentence, which I am saying out loud." },
        { id: "sp_b_base4", characterId: "sp_cartman", text: "Get out of my lair before I unleash my entire army of nobody on you." },
      ],
      hotspots: [
        {
          id: "sp_base_cartman",
          label: "Cartman, defending his lair",
          bounds: { x: 52, y: 54, w: 20, h: 26 },
          cursor: "talk",
          isRepeatable: true,
          action: { type: "startDialogue" },
        },
        {
          id: "sp_base_sled",
          label: "The Lightning Muscle 3000 (HIS, allegedly)",
          bounds: { x: 18, y: 66, w: 18, h: 16 },
          cursor: "take",
          isRepeatable: false,
          showItemImage: true,
          customFailMessage: "A fat little padlock guards the sled. The key is hidden back at school — because of course it is.",
          action: { type: "giveItem", itemGranted: "sp_sled", flagSet: "sp_got_sled" },
          gating: { requiresItems: ["sp_key"] },
          verbs: {
            look: { type: "showText", text: "Fastest sled in the fourth grade. Nine.speed settings and a cassette deck. He never once waxed the runners." },
            kick: { type: "showText", text: "You kick the padlock. The padlock files it under 'cute'." },
          },
        },
        {
          id: "sp_base_chest",
          label: "A toy chest marked PROPERTY OF MANKIND",
          bounds: { x: 76, y: 62, w: 12, h: 14 },
          cursor: "look",
          isRepeatable: true,
          action: { type: "showText", text: "Inside: a Dark Lord action figure, still in the box. Mint. He will never know joy like this again, and honestly, neither will it." },
          verbs: {
            use: { type: "showText", text: "You reach in. Something bites you. It's Cartman's anger, manifest as a stapler." },
          },
        },
      ],
      choices: [],
    },

    /* ── SCENE 4 — STARK'S POND ───────────────────────────────────── */
    {
      id: "sp_pond",
      title: "Stark's Pond",
      note:
        "BETA SCENE 4 — the finale. The room-entry cutscene (enterScript) walks Kenny onto the thin ice and does what the show does: " +
        "'Oh my God, the ice killed Kenny!' / 'You bastards!' Kenny's NPC keeps patrolling anyway — nobody in South Park ever learns. " +
        "Cartman's confrontation marker draws his MOODS sprite sheet as object art (smug frame). Talk to him with the sled; " +
        "the conversation ends, the scene's two CHOICES appear, and each walks you into a different ending card.",
      background: "assets/southpark/sp-bg-pond.png",
      nodeType: "stage",
      stage: {
        ...stageBase,
        spawn: { x: 16, y: 90 },
        enterCaption: "Stark's Pond. Romantic. Historic. Frozen to a depth nobody has ever bothered to measure. Until today.",
        entrySpawns: { sp_basement: { x: 12, y: 90 } },
        enterScript: [
          { do: "wait", seconds: 0.8 },
          { do: "say", text: "Kenny! The ice is thin, dude, get off it!" },
          { do: "npcWalkTo", npcId: "sp_kenny_npc", x: 62, y: 78 },
          { do: "wait", seconds: 1.2 },
          { do: "say", text: "Oh my God! The ice killed Kenny!" },
          { do: "say", text: "You bastards!" },
          { do: "wait", seconds: 0.8 },
        ],
        enterScriptFlag: "sp_pond_seen",
        npcs: [
          {
            id: "sp_kenny_npc",
            image: "emoji:🥶",
            sheet: SP_KENNY_SHEET,
            x: 55,
            y: 80,
            speed: 5,
            patrol: [
              { x: 55, y: 80, pause: 3 },
              { x: 62, y: 78, pause: 3, say: "Mmph mmph mmph!" },
              { x: 48, y: 82, pause: 3 },
            ],
          },
        ],
      },
      prose: "",
      dialogueBeats: [
        { id: "sp_b_pond1", characterId: "sp_cartman", text: "Put. The sled. Down, Stan. That is KING'S property. Interfering with the king is treason, and treason is a butt-whooping I am legally allowed to deliver." },
        { id: "sp_b_pond2", characterId: "sp_stan", text: "It's over, Cartman. We have the key, we have the sled, and we're done with your stupid kingdom. Fuck you, Cartman." },
        { id: "sp_b_pond3", characterId: "sp_cartman", text: "...What did you just say to me? Say it again. Say it into these mittens." },
        { id: "sp_b_pond4", characterId: "sp_kenny", text: "(Muffled, from under the ice: something surprisingly supportive.)" },
        { id: "sp_b_pond5", characterId: "sp_stan", text: "Kenny gets it. So what's it gonna be — do we settle this the old way, or do we act like it never happened?" },
      ],
      hotspots: [
        {
          id: "sp_pond_cartman",
          label: "Cartman, smug across the ice",
          bounds: { x: 66, y: 50, w: 16, h: 24 },
          cursor: "talk",
          isRepeatable: true,
          customFailMessage: "Cartman waves from the bank. 'Come back with the sled, you goddamn thieves!'",
          gating: { requiresFlags: ["sp_got_sled"] },
          sheet: SP_CARTMAN_MOODS,
          image: "assets/southpark/sp-cartman-moods.png",
          action: { type: "startDialogue" },
        },
        {
          id: "sp_pond_sign",
          label: "The Stark's Pond sign",
          bounds: { x: 6, y: 54, w: 10, h: 14 },
          cursor: "look",
          isRepeatable: true,
          action: { type: "showText", text: "'STARK'S POND — EST. FOREVER. NO SWIMMING. NO SKATING. (One signature: K. McCormick, age 6, in crayon.)'" },
          verbs: {
            kick: { type: "showText", text: "You kick the sign. The town logs it as free speech." },
          },
        },
      ],
      choices: [
        {
          id: "sp_c_punch",
          text: "Sled first. Punch him now.",
          targetSceneId: "sp_end_fight",
        },
        {
          id: "sp_c_talk",
          text: "Take the high road — and still tell him fuck you on the way out.",
          targetSceneId: "sp_end_friend",
        },
      ],
    },

    /* ── ENDING A — THE PLAYGROUND PURGE ──────────────────────────── */
    {
      id: "sp_end_fight",
      title: "The Playground Purge",
      note: "BETA ENDING A (silver): you chose violence. Correctly.",
      background: "assets/southpark/sp-bg-pond.png",
      nodeType: "stage",
      stage: {
        ...stageBase,
        spawn: { x: 50, y: 88 },
        enterCaption: "The swing set. High noon. The sled between you like a line in the snow that can't be uncrossed.",
      },
      prose: "",
      dialogueBeats: [
        { id: "sp_b_fight1", characterId: "sp_cartman", text: "MOM! MOM! STAN'S BEING A WAR CRIMINAL! THIS IS A HATE CRIME AGAINST A KING!" },
        { id: "sp_b_fight2", characterId: "sp_stan", text: "Sled. Home. Recess. Saved. Some things you don't need a verb menu for." },
      ],
      hotspots: [],
      choices: [],
      isEnding: true,
      endingData: {
        tier: "victory-silver",
        headline: "THE PLAYGROUND PURGE",
        recap:
          "You chose violence. Correctly. Cartman cried to his mom, the sled came home, and the fourth grade drafted a new constitution at the swing set. Kenny is still technically on the ice. Detention is on Tuesday. Worth it.",
      },
    },

    /* ── ENDING B — PEACE IN OUR TIME ─────────────────────────────── */
    {
      id: "sp_end_friend",
      title: "Peace in Our Time (Until Lunch)",
      note: "BETA ENDING B (gold): diplomacy, with the sled secured and the profanity delivered.",
      background: "assets/southpark/sp-bg-busstop.png",
      nodeType: "stage",
      stage: {
        ...stageBase,
        spawn: { x: 50, y: 88 },
        enterCaption: "You walk away with the sled and the last word. Cartman respects exactly one of those.",
        // background swap: the walk home

      },
      prose: "",
      dialogueBeats: [
        { id: "sp_b_friend1", characterId: "sp_cartman", text: "Respect. You spoke to me in my love language: profanity, delivered cold." },
        { id: "sp_b_friend2", characterId: "sp_kyle", text: "This changes nothing and absolutely everything." },
      ],
      hotspots: [],
      choices: [],
      isEnding: true,
      endingData: {
        tier: "victory-gold",
        headline: "PEACE IN OUR TIME (UNTIL LUNCH)",
        recap:
          "You told Cartman to fuck off WITH the sled secured — diplomacy AND firepower. The fourth grade signed a truce at the swings; Cartman keeps his crown as long as everyone remembers it's made of paper. Kenny got a long nap under the ice. Everybody won, mostly.",
      },
    },
  ],
};
