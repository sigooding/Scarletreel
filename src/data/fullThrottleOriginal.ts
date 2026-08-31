import type { Story } from "../types";
import type { SpriteSheet } from "../game/spriteSheet";

/**
 * FULL THROTTLE (the original opening, faithfully)
 * ------------------------------------------------
 * A true-to-the-original recreation of the opening act of LucasArts' 1995
 * Full Throttle — not a "reimagining". Ben is the leader of the Polecats; he
 * wakes in a dumpster behind the Kickstand with no keys and a headache, gets
 * them back off Quohog the bartender, and rides out after his gang.
 *
 * This story is the showcase for the two "feel" features the engine gained to
 * match the original:
 *
 *   • THE RIGHT-CLICK SKULL — the inventory is a flaming skull, opened with a
 *     RIGHT-CLICK (not a left-click "Jacket" drawer). Right-clicking an item
 *     pops the Full Throttle verb menu at the cursor: Inspect / Use on… /
 *     Combine. `inventoryDisplay.startClosed` + the right-click-to-open gesture
 *     in InventoryDock are what make it feel like the original's skull.
 *   • THE RIDE — the Rottwheeler duel is a STEERABLE road chase (choice.ride,
 *     RideGame.tsx), not a quick-time cutscene. Weave the lanes with ←/→ (or
 *     tap a lane) while the Rottwheelers bear down; survive to run the target
 *     off the road, crash to the game-over ending.
 *
 * Everything else reuses the authentic beats from fullThrottle.ts: the
 * dumpster punch, the wide scrolling alley, Quohog's topic-list conversation,
 * the piano gag, and Ben's own words ("When I'm on the road, I'm
 * indestructible…"). See docs/full-throttle-assessment.md.
 */

/** Ben's walk cycle — four frames, sliced from a flat-magenta plate by
 *  scripts/make-sprite-sheet.mjs (see docs/sprite-sheets.md). A Ben-like
 *  biker: leather vest, sunglasses, red bandana. */
const BEN_WALK: SpriteSheet = {
  image: "/assets/sprites/ft-ben-walk.png",
  frameWidth: 114,
  frameHeight: 208,
  animations: {
    idle: { frames: [0] },
    walk: { frames: [0, 1, 2, 3], fps: 8 },
  },
  pixelated: true,
};

/** Shared walker settings, per-room floor and furniture. The sprite itself is
 *  NOT set here — it comes from the story-wide `playerSprite`. */
const walker = (
  floor: { top: number; bottom: number },
  spawn: { x: number; y: number },
  obstacles: { x: number; y: number; w: number; h: number }[] = [],
  extra: Record<string, unknown> = {}
) => ({
  verbCoin: true,
  extendedVerbs: true, // 👢 boot · 👊 fist
  objectVerbMenu: true, // 💀 object-first (click the object, then pick a verb)
  objectMenuHold: true, // ⏱ hold-to-open the big skull pie
  playerScale: 1,
  playerNearScale: 1.15,
  playerFarScale: 0.62,
  keyboard: true,
  speed: 15,
  reach: 4,
  depthScale: 0.3,
  hints: "proximity" as const,
  floor,
  spawn,
  ...(obstacles.length ? { obstacles } : {}),
  ...extra,
});

export const FULL_THROTTLE_ORIGINAL: Story = {
  id: "full-throttle-original",
  title: "Full Throttle",
  tagline: "When I'm on the road, I'm indestructible. No one can stop me…",
  coverImage: "/img/ft-front.jpg",
  gameKind: "adventure",
  startSceneId: "fto_credits",
  // 🚶 Ben, defined once story-wide.
  playerSprite: { sheet: BEN_WALK },
  layout: {
    fto_credits: { x: 40, y: 40 },
    fto_dump: { x: 40, y: 280 },
    fto_alley: { x: 280, y: 280 },
    fto_bar: { x: 520, y: 280 },
    fto_ride: { x: 280, y: 520 },
    fto_ride2: { x: 360, y: 520 },
    fto_ride3: { x: 440, y: 520 },
    fto_ride_dead: { x: 120, y: 700 },
    fto_tbc: { x: 520, y: 520 },
  },
  briefing: {
    objective:
      "You come to inside a dumpster behind the Kickstand with no keys and a headache. Get out, get your bike keys back off the bartender, and ride after your gang.",
    winConditions: [
      "Punch your way out of the dumpster.",
      "Walk the wide alley around to the front of the Kickstand; kick in the door.",
      "Fist your keys out of Quohog and ride out after the Polecats.",
      "Beat the Rottwheeler on the road.",
    ],
    loseConditions: ["Lose the road fight — the chain takes you off the bike, and that's the end of that."],
  },
  // Cursor art: a pointing hand for use/take, an eye for look.
  cursorArt: {
    default: { image: "/assets/ui/cursor-hand.png", size: 34 },
    look: { image: "/assets/ui/cursor-eye.png", size: 30 },
    take: { image: "/assets/ui/cursor-hand.png", size: 34 },
    use: { image: "/assets/ui/cursor-hand.png", size: 34 },
  },
  // 💀 The skull-pie centrepiece — the flaming skull, used both for the
  // hold-to-open verb pie AND (below) for the right-click inventory.
  verbMenuIcon: "/img/ft-skull.png",
  // 💀 THE RIGHT-CLICK SKULL. The original opens the inventory with a
  // right-click on a flaming skull; here `startClosed` means the dock waits
  // closed until you right-click it open, and the items sit in the skull's
  // mouth. Right-clicking an item pops the verb menu (Inspect / Use on…).
  inventoryDisplay: {
    mode: "container",
    label: "Skull",
    image: "/img/ft-skull.png",
    anchor: "bottom-left",
    columns: 3,
    inset: 22,
    height: 210,
    startClosed: true,
  },
  // Wrong-verb answers in Ben's voice, varied so a failed verb doesn't loop.
  verbResponses: {
    look: ["Nothing you haven't seen before.", "You look. It doesn't get any prettier."],
    take: ["You're not gonna fit that in your jacket.", "Leave it. It's not going anywhere and neither are you, yet."],
    talk: ["Talking to it won't help.", "No answer. Not even a shrug."],
    use: ["That does nothing. Not even a good noise.", "Wrong move. Try it on something that'll fight back."],
    go: ["That's a wall, not a road.", "No exit there. Just bricks and a bad idea."],
    kick: ["You give it a boot. It gives you nothing back.", "That's how you scuff a boot and get squat."],
    punch: ["You take a swing. It does not swing back, which is worse.", "Save the fists for something that deserves 'em."],
  },
  flagNotes: {
    fto_free: "Ben punched his way out of the dumpster.",
    fto_door: "Ben kicked in the Kickstand's front door.",
    fto_noticed_keys: "The keys are gone — some joker took 'em.",
    fto_quohog_talked: "Quohog told Ben the Polecats rode out with Corley and the suit.",
    fto_rott_beaten: "The Rottwheeler left the road.",
  },
  characters: [
    { id: "narrator", name: "Ben", role: "V.O.", avatarUrl: "emoji:🎙", trustMeter: 0 },
    {
      id: "ben",
      name: "Ben",
      role: "Leader of the Polecats",
      avatarUrl: "emoji:💀",
      trustMeter: 0,
      voice: { pitch: 0.8, rate: 1 },
    },
    {
      id: "ripburger",
      name: "Adrian Ripburger",
      role: "The suit",
      avatarUrl: "emoji:🎩",
      trustMeter: -2,
      voice: { pitch: 1.05, rate: 0.98 },
    },
    {
      id: "quohog",
      name: "Quohog",
      role: "Bartender, The Kickstand",
      avatarUrl: "emoji:🍺",
      trustMeter: -1,
      voice: { pitch: 0.75, rate: 0.95 },
    },
    {
      id: "rott",
      name: "Rottwheeler",
      role: "Rival rider",
      avatarUrl: "emoji:🛞",
      trustMeter: -2,
      voice: { pitch: 0.68, rate: 0.9 },
    },
    {
      id: "miranda",
      name: "Miranda",
      role: "Reporter",
      avatarUrl: "emoji:📷",
      trustMeter: 0,
      voice: { pitch: 1.1, rate: 1.05 },
    },
  ],
  items: [
    {
      id: "fto_keys",
      name: "Ben's Keys",
      icon: "🔑",
      description: "The keys to your Corley. Quohog was holding them — somebody told him to.",
      flavorText: "Turns over on the third kick. Same as it ever was.",
      isClue: false,
    },
  ],
  scenes: [
    /* ─────────────────── 1 · OPENING CREDITS (the ambush) ───────────── */
    {
      id: "fto_credits",
      title: "Full Throttle",
      nodeType: "credits",
      background: "/img/ft-highway.jpg",
      ambientAudio: "drone",
      musicMode: "track",
      musicUrl: "/Soundtrack.mp3",
      letterbox: true,
      credits: {
        title: "FULL THROTTLE",
        subtitle: "the original opening",
        titleEntrance: "typewriter",
        stagger: 0.5,
        duration: 0.9,
        accentColor: "#ffb347",
        style: "fade-up",
        lines: [
          { role: "Starring", name: "Ben, leader of the Polecats" },
          { role: "and", name: "Adrian Ripburger" },
          { role: "The Kickstand", name: "Melonweed & the open road" },
        ],
      },
      prose:
        "\u201CWhen I'm on the road, I'm indestructible. No one can stop me…\u201D",
      choices: [
        { id: "ftoc_newgame", text: "▶ New Game", targetSceneId: "fto_dump", attitudeTag: "Neutral" },
      ],
      hotspots: [],
      dialogueBeats: [],
    },

    /* ─────────────────── 2 · INSIDE THE DUMPSTER ────────────────────── */
    {
      id: "fto_dump",
      title: "A Dumpster",
      background: "/img/ft-dumpster.jpg",
      ambientAudio: "drone",
      nodeType: "stage",
      prose: "",
      stage: {
        ...walker({ top: 72, bottom: 97 }, { x: 50, y: 92 }),
        enterCaption: "A dumpster. You're in a dumpster. Somewhere overhead, a bar is playing music you don't like.",
      },
      hotspots: [
        {
          id: "ftoh_lid",
          label: "the dumpster lid",
          bounds: { x: 26, y: 50, w: 48, h: 24 },
          cursor: "punch",
          verbs: {
            look: {
              type: "showText",
              text: "The lid of a dumpster, a couple of feet over your head. Somebody wanted you out of the way, and this is where they put you.",
            },
            kick: {
              type: "showText",
              text: "You boot the lid from the inside. It rattles like a church bell and stays shut. Fists, not feet, for this one.",
            },
            take: {
              type: "showText",
              text: "You could take the lid off — if you had a crowbar and the lid's cooperation. Neither is on offer.",
            },
          },
          action: {
            type: "showText",
            flagSet: "fto_free",
            text: "You punch the lid. It pops, flips, and hangs there like a challenge. Time to go.",
          },
        },
        {
          id: "ftoh_climb_out",
          label: "climb out",
          bounds: { x: 26, y: 50, w: 48, h: 24 },
          cursor: "go",
          gating: { requiresFlags: ["fto_free"] },
          action: {
            type: "goToScene",
            targetSceneId: "fto_alley",
            text: "You haul yourself up and over the lip, into the cool desert night. First thing that's gone right all evening.",
          },
        },
        {
          id: "ftoh_trash",
          label: "the trash",
          bounds: { x: 8, y: 82, w: 84, h: 13 },
          cursor: "look",
          isRepeatable: true,
          verbs: {
            punch: {
              type: "showText",
              text: "You punch the trash. It takes it like a champ. So does your hand.",
            },
          },
          action: {
            type: "showText",
            text: "The usual: newspapers with last week's scores, a lamp that gave up, and you.",
          },
        },
      ],
      dialogueBeats: [],
      choices: [],
    },

    /* ─────────────────── 3 · THE ALLEY (a WIDE WORLD) ───────────────── */
    {
      id: "fto_alley",
      title: "Behind the Kickstand",
      background: "/img/ft-alley-wide.jpg",
      ambientAudio: "drone",
      nodeType: "stage",
      prose: "",
      stage: {
        ...walker(
          { top: 66, bottom: 94 },
          { x: 30, y: 90 },
          [
            { x: 14, y: 66, w: 38, h: 14 }, // the dumpster
            { x: 118, y: 68, w: 26, h: 12 }, // the parked bike
            { x: 154, y: 66, w: 12, h: 14 }, // the door's step
          ],
          {
            worldWidth: 200,
            entrySpawns: {
              fto_dump: { x: 30, y: 90 },
              fto_bar: { x: 162, y: 90 },
            },
          }
        ),
        enterCaption:
          "Behind the Kickstand. You're out, you're alive, and your bike is around the corner — keys permitting.",
      },
      hotspots: [
        {
          id: "ftoh_dumpster",
          label: "the dumpster",
          bounds: { x: 14, y: 56, w: 38, h: 34 },
          cursor: "look",
          isRepeatable: true,
          verbs: {
            punch: {
              type: "showText",
              text: "You punch the dumpster. A dent blooms in the side and fades again. Cathartic, but not useful.",
            },
            talk: {
              type: "showText",
              text: "\u201CThanks for the bed.\u201D The dumpster says nothing. Rude.",
            },
          },
          action: {
            type: "showText",
            text: "A battered green dumpster. You were in it a minute ago. You're choosing not to dwell on that.",
          },
        },
        {
          id: "ftoh_bike",
          label: "your bike",
          bounds: { x: 116, y: 58, w: 30, h: 36 },
          cursor: "use",
          image: "/assets/sprites/adv-bike.png",
          imageFit: "contain",
          verbs: {
            look: {
              type: "showText",
              text: "A Corley. Your Corley. She's been through worse than one bad night.",
            },
            talk: {
              type: "showText",
              text: "You tell her you're leaving. She says nothing. She never says anything, but she's always right.",
            },
            punch: {
              type: "showText",
              text: "You don't punch your bike. Some lines you don't cross.",
            },
          },
          action: {
            type: "showText",
            flagSet: "fto_noticed_keys",
            text: "You swing a leg over and reach for the ignition. Nothing. You pat your jacket. Still nothing.\n\n\u201CSome joker took my keys. I don't like that.\u201D",
          },
        },
        {
          id: "ftoh_ride",
          label: "ride out",
          bounds: { x: 120, y: 60, w: 22, h: 32 },
          cursor: "use",
          gating: { requiresItems: ["fto_keys"] },
          verbs: {
            look: {
              type: "showText",
              text: "The road out of here. It's two lanes of maybe and a long way to Melonweed.",
            },
          },
          action: {
            type: "goToScene",
            targetSceneId: "fto_ride",
            text: "You slide the key in. She turns over on the third kick. You swing a leg over and point her at the road.",
          },
        },
        {
          id: "ftoh_door",
          label: "the Kickstand door",
          bounds: { x: 154, y: 50, w: 20, h: 44 },
          cursor: "kick",
          verbs: {
            look: {
              type: "showText",
              text: "The door's locked. The Kickstand's closed, and the only other way in is the one with your boot on it.",
            },
            punch: {
              type: "showText",
              text: "You rap your knuckles on it. Solid. You'll want your boot for this one.",
            },
          },
          action: {
            type: "goToScene",
            targetSceneId: "fto_bar",
            flagSet: "fto_door",
            text: "You kick the door. It splinters at the latch and swings wide. You step inside, cool as anything.",
          },
        },
      ],
      dialogueBeats: [],
      choices: [],
    },

    /* ─────────────────── 4 · INSIDE THE KICKSTAND ───────────────────── */
    {
      id: "fto_bar",
      title: "Inside the Kickstand",
      background: "/img/ft-bar.jpg",
      ambientAudio: "jazz",
      nodeType: "stage",
      prose: "",
      stage: {
        ...walker(
          { top: 68, bottom: 94 },
          { x: 30, y: 90 },
          [{ x: 6, y: 66, w: 30, h: 12 }],
          {
            exitEdges: {
              left: { targetSceneId: "fto_alley", label: "the alley" },
            },
          }
        ),
        enterCaption: "Empty, except for the bartender. The Polecats are long gone.",
      },
      hotspots: [
        {
          id: "ftoh_quohog",
          label: "Quohog the bartender",
          bounds: { x: 14, y: 50, w: 16, h: 42 },
          cursor: "talk",
          isRepeatable: true,
          verbs: {
            look: {
              type: "showText",
              text: "Quohog. Nose ring, dead eyes, wiping the same glass he's been wiping since you walked in.",
            },
            punch: {
              type: "showText",
              text: "Not yet. Talk to him first — find out what he knows before you start making new memories for him.",
            },
          },
          action: {
            type: "startDialogue",
            topicPrompt: "Quohog wipes the same glass. What do you want to ask?",
            topicLeaveLabel: "Walk away",
            topics: [
              {
                id: "fto_topic_gang",
                label: "Where's my gang?",
                beats: [
                  { id: "ftob_t1a", characterId: "ben", text: "I just want my keys. Where's my gang?" },
                  {
                    id: "ftob_t1b",
                    characterId: "quohog",
                    text: "They rode out with that Corley fella and the suit. 'Bout an hour ago. Said somethin' about the shareholders' meeting in Melonweed.",
                  },
                ],
              },
              {
                id: "fto_topic_suit",
                label: "What did the suit tell you?",
                beats: [
                  {
                    id: "ftob_t2a",
                    characterId: "quohog",
                    text: "The suit — the one with the cane and the soft hands — he told me to hang onto these. In case you came sniffing around.",
                  },
                ],
              },
              {
                id: "fto_topic_keys",
                label: "My keys, Quohog.",
                flagSet: "fto_quohog_talked",
                beats: [
                  { id: "ftob_t3a", characterId: "ben", text: "Give 'em here, Quohog." },
                  {
                    id: "ftob_t3b",
                    characterId: "quohog",
                    text: "Now hold on. There's been talk, Ben. Talk that you and the Polecats are in some kind of trouble. I ain't gettin' involved.",
                  },
                  { id: "ftob_t3c", characterId: "ben", text: "You're already involved. You're holding my keys." },
                ],
              },
            ],
          },
        },
        {
          id: "ftoh_quohog_grab",
          label: "grab Quohog",
          bounds: { x: 16, y: 54, w: 12, h: 26 },
          cursor: "punch",
          gating: { requiresFlags: ["fto_quohog_talked"] },
          verbs: {
            look: {
              type: "showText",
              text: "He's not looking you in the eye. A man who's holding something that isn't his.",
            },
          },
          action: {
            type: "giveItem",
            itemGranted: "fto_keys",
            flagSet: "fto_quohog_talked",
            text: "You grab him by the nose ring and yank. He gags, scrambles, and slaps your keys down on the bar.\n\nQuohog: \u201CThe Polecats rode out with that Corley fella! The suit said you'd gone on ahead to scout the route! Don't hit me!\u201D",
          },
        },
        {
          id: "ftoh_piano",
          label: "the piano",
          bounds: { x: 76, y: 62, w: 18, h: 30 },
          cursor: "look",
          isRepeatable: true,
          verbs: {
            kick: {
              type: "showText",
              text: "You boot the piano. It answers with a chord like a man falling down a flight of stairs.",
            },
            talk: {
              type: "showText",
              text: "\u201CIt's hard enough to play with your fingers.\u201D",
            },
          },
          action: {
            type: "showText",
            text: "Man, I wish they had a jukebox.",
          },
        },
        {
          id: "ftoh_bar_door",
          label: "back outside",
          bounds: { x: 44, y: 58, w: 14, h: 36 },
          cursor: "go",
          action: { type: "goToScene", targetSceneId: "fto_alley" },
        },
      ],
      dialogueBeats: [],
      choices: [],
    },

    /* ─────────────────── 5 · THE ROTTWHEELER DUEL (RIDE) ────────────── */
    {
      id: "fto_ride",
      title: "Highway 9, Heading North",
      background: "/img/ft-highway.jpg",
      ambientAudio: "drone",
      musicMode: "track",
      musicUrl: "/Soundtrack.mp3",
      letterbox: true,
      prose: "",
      dialogueBeats: [
        { id: "ftob_r1", characterId: "ben", text: "When I'm on the road, I'm indestructible. No one can stop me\u2026" },
        {
          id: "ftob_r2",
          characterId: "narrator",
          text: "A Rottwheeler drops into the lane beside you, chain in his fist. Somebody wants your bike — and they want it enough to fight for it.",
        },
        { id: "ftob_r3", characterId: "ben", text: "\u2026but they try." },
      ],
      choices: [
        {
          id: "ftoc_fight1",
          text: "Weave through the traffic — lose him!",
          targetSceneId: "fto_ride2",
          attitudeTag: "Aggressive",
          timedOutTargetSceneId: "fto_ride_dead",
          ride: {
            lanes: 3,
            durationSeconds: 16,
            prompt: "OUTRUN THE ROTTWHEELER",
            traffic: ["emoji:🚚", "emoji:🚗", "emoji:🚙", "emoji:🚓", "emoji:🏍"],
            vehicleImage: "emoji:🏍",
            winText: "You leave him eating your dust.",
            crashText: "The chain takes you down.",
          },
        },
      ],
      hotspots: [],
    },

    /* ─────────────────── 6 · THE DUEL, SECOND PASS ──────────────────── */
    {
      id: "fto_ride2",
      title: "The Duel",
      background: "/img/ft-highway.jpg",
      ambientAudio: "drone",
      musicMode: "track",
      musicUrl: "/Soundtrack.mp3",
      letterbox: true,
      prose: "",
      dialogueBeats: [
        {
          id: "ftob_r5",
          characterId: "narrator",
          text: "Your chain cracks his mirror. He comes back swinging — his chain takes you across the jacket and lays the leather open.",
        },
        { id: "ftob_r6", characterId: "rott", text: "Nice jacket! I'll keep it!" },
        { id: "ftob_r7", characterId: "ben", text: "You'll keep a hospital bed." },
      ],
      choices: [
        {
          id: "ftoc_fight2",
          text: "Boot his front wheel — knock him off the road!",
          targetSceneId: "fto_ride3",
          attitudeTag: "Aggressive",
          timedOutTargetSceneId: "fto_ride_dead",
          consequences: { setFlags: ["fto_rott_beaten"] },
          ride: {
            lanes: 4,
            durationSeconds: 18,
            spawnMs: 900,
            speed: 0.65,
            prompt: "BOOT HIM!",
            traffic: ["emoji:🚚", "emoji:🚗", "emoji:🚙", "emoji:🚓", "emoji:🏍", "emoji:🛻"],
            vehicleImage: "emoji:🏍",
            winText: "Your boot finds his front wheel.",
            crashText: "You went down at speed.",
          },
        },
      ],
      hotspots: [],
    },

    /* ─────────────────── 7 · THE CRASH (bookend) ────────────────────── */
    {
      id: "fto_ride3",
      title: "The Long Way to Melonweed",
      background: "/img/ft-highway.jpg",
      ambientAudio: "drone",
      musicMode: "track",
      musicUrl: "/Soundtrack.mp3",
      letterbox: true,
      prose: "",
      dialogueBeats: [
        {
          id: "ftob_r8",
          characterId: "narrator",
          text: "Your boot finds his front wheel. It wobbles, folds, and the Rottwheeler leaves the road in a shower of sparks. You don't look back.",
        },
        {
          id: "ftob_r9",
          characterId: "narrator",
          silent: true,
          text: "The front wheel shimmies. Somebody put a tool to the forks while you were in the dumpster. At speed, the wheel says goodbye, and so does the road.",
        },
        {
          id: "ftob_r10",
          characterId: "miranda",
          text: "Hey! Hey, are you okay? Oh, this is going to make a great story. Don't move, I'm getting my camera.",
        },
        {
          id: "ftob_r11",
          characterId: "narrator",
          silent: true,
          text: "And then, nothing but the smell of asphalt\u2026",
        },
      ],
      choices: [
        { id: "ftoc_r_end", text: "▶", targetSceneId: "fto_tbc", attitudeTag: "Neutral" },
      ],
      hotspots: [],
    },

    /* ─────────────────── 8 · LOSING THE DUEL (GAME OVER) ────────────── */
    {
      id: "fto_ride_dead",
      title: "The End of the Road",
      isEnding: true,
      background: "/img/ft-highway.jpg",
      letterbox: true,
      prose:
        "You hesitate — half a second too long. The chain whistles, the world tilts, and the road comes up sideways. The last thing you hear is your own bike, laying down on the asphalt at speed.\n\nThe Polecats will find the wreck in the morning. Somebody else will get the keys.",
      endingData: {
        tier: "gameover",
        headline: "KILLED ON HIGHWAY 9",
        recap: "You waited for the perfect moment. The Rottwheeler didn't. Full Throttle doesn't hand out second chances on the open road.",
      },
      hotspots: [],
      dialogueBeats: [],
      choices: [],
    },

    /* ─────────────────── 9 · PART ONE BREAK ─────────────────────────── */
    {
      id: "fto_tbc",
      title: "To Be Continued",
      isEnding: true,
      background: "/img/ft-highway.jpg",
      letterbox: true,
      prose:
        "You wake with the taste of dust in your mouth and a woman leaning over you holding a socket wrench. \u201CYour bike's a mess,\u201D she says, like it's a greeting. \u201CBut I can fix it. Free. No strings attached.\u201D\n\nHer name is Maureen. And that's when things get interesting.",
      endingData: {
        tier: "victory-silver",
        headline: "END OF PART ONE",
        recap: "Out of the dumpster, keys back off the bartender, and a rival off the road — but the suit with the cane is still out there, and the road to Melonweed isn't done with you yet.",
      },
      hotspots: [],
      dialogueBeats: [],
      choices: [],
    },
  ],
};
