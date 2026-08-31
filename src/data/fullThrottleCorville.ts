import type { Story } from "../types";
import type { SpriteSheet } from "../game/spriteSheet";

/**
 * FULL THROTTLE — THE CORVILLE RUN (a new version, built on every feature)
 * -----------------------------------------------------------------------
 * A reimagined opening for LucasArts' Full Throttle, rebuilt from scratch
 * in this engine's adventure mode to exercise EVERY new feature the engine
 * has gained since the original `full-throttle` recreation:
 *
 *   • NEW player sprite sheet (Ben) with named POSE animations — idle,
 *     walk, bend, crouch, reach — sliced from a generated magenta plate.
 *   • `stage.playerPose` — a scene-wide default pose (Ben is CROUCHED in
 *     the dumpster).
 *   • `setPlayerPose` hotspots — Ben BENDS to look under the dumpster and
 *     REACHES over the bar (transient, plays once).
 *   • Object-first verb menu + HOLD-TO-OPEN skull pie, with a NEW flaming
 *     skull centrepiece (`verbMenuIcon`) and `extendedVerbs` (kick/punch).
 *   • Wide-world scrolling + camera follow (the alley is one 200% strip).
 *   • Walk-off-screen exits (`exitEdges`) + per-source entry spawns.
 *   • A walkable PATH polygon (`floorPoints`) on the bar floor.
 *   • Obstacles (A* routing around the dumpster and crates).
 *   • TOPIC-LIST dialogue — ask the bartender things instead of reading a
 *     linear conversation.
 *   • A quick-time duel with a real game-over if you hesitate.
 *
 * Art: the NEW sprites live in /assets/sprites/ft2-*.png; backgrounds and
 * music reuse the existing /img/ft-*.jpg and /Soundtrack.mp3.
 */

/** Ben — a fresh 5-pose walk sheet for this version (see docs/sprite-sheets.md).
 *  Frames: 0 idle · 1 walk · 2 bend · 3 crouch · 4 reach. */
const BEN2: SpriteSheet = {
  image: "/assets/sprites/ft2-ben.png",
  frameWidth: 163,
  frameHeight: 256,
  animations: {
    idle: { frames: [0] },
    walk: { frames: [0, 1], fps: 8 },
    bend: { frames: [2] },
    crouch: { frames: [3] },
    reach: { frames: [4] },
  },
  pixelated: true,
};

/** Shared walker settings — every room opts into the Full Throttle controls:
 *  object-first (💀 skull) + hold-to-open, kick/punch, and the walker itself
 *  comes from the story-wide playerSprite (Ben, defined once). */
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

export const FULL_THROTTLE_CORVILLE: Story = {
  id: "full-throttle-corville",
  title: "Full Throttle — The Corville Run",
  tagline: "Keys first. Answers later. The road waits for nobody.",
  coverImage: "/img/ft-front.jpg",
  gameKind: "adventure",
  startSceneId: "ft2_credits",
  // 🚶 Ben, once story-wide (the In-game theme's Player character). The new
  // sheet carries the pose animations the setPlayerPose hotspots use.
  playerSprite: { sheet: BEN2 },
  // 💀 The new flaming-skull centrepiece for the hold-to-open skull pie.
  verbMenuIcon: "/assets/sprites/ft2-skull.png",
  // Ben carries everything in his jacket.
  inventoryDisplay: {
    mode: "container",
    label: "Jacket",
    anchor: "bottom-left",
    columns: 3,
    inset: 18,
    height: 220,
  },
  layout: {
    ft2_credits: { x: 40, y: 40 },
    ft2_dump: { x: 40, y: 280 },
    ft2_alley: { x: 280, y: 280 },
    ft2_bar: { x: 520, y: 280 },
    ft2_ride: { x: 280, y: 520 },
    ft2_ride_dead: { x: 120, y: 700 },
    ft2_tbc: { x: 520, y: 520 },
  },
  briefing: {
    objective:
      "You come to inside a dumpster behind the Kickstand with no keys and a headache. Get out, get your bike keys back off the bartender, and ride after your gang.",
    winConditions: [
      "Punch your way out of the dumpster.",
      "Walk the wide alley around to the front of the Kickstand; kick in the door.",
      "Ask the bartender for your keys, then take them back.",
      "Beat the Rottwheeler on the road.",
    ],
    loseConditions: ["Hesitate on the open road — the chain takes you, and that's the end of that."],
  },
  // Cursor art: pointing hand / eye, as close as the engine's opt-in gets.
  cursorArt: {
    default: { image: "/assets/ui/cursor-hand.png", size: 34 },
    look: { image: "/assets/ui/cursor-eye.png", size: 30 },
    take: { image: "/assets/ui/cursor-hand.png", size: 34 },
    use: { image: "/assets/ui/cursor-hand.png", size: 34 },
  },
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
    ft2_free: "Ben punched his way out of the dumpster.",
    ft2_door: "Ben kicked in the Kickstand's front door.",
    ft2_noticed_keys: "The keys are gone — some joker took 'em.",
    ft2_quohog_talked: "Quohog told Ben the Polecats rode off with Corley.",
  },
  characters: [
    { id: "narrator", name: "Ben", role: "V.O.", avatarUrl: "emoji:🎙", trustMeter: 0 },
    { id: "ben", name: "Ben", role: "Leader of the Polecats", avatarUrl: "emoji:💀", trustMeter: 0, voice: { pitch: 0.8, rate: 1 } },
    { id: "quohog", name: "Quohog", role: "Bartender, The Kickstand", avatarUrl: "emoji:🍺", trustMeter: -1, voice: { pitch: 0.75, rate: 0.95 } },
    { id: "rott", name: "Rottwheeler", role: "Rival rider", avatarUrl: "emoji:⛓", trustMeter: -2, voice: { pitch: 0.65, rate: 0.9 } },
    { id: "miranda", name: "Miranda", role: "Reporter", avatarUrl: "emoji:📷", trustMeter: 0, voice: { pitch: 1.1, rate: 1.05 } },
  ],
  items: [
    {
      id: "ft2_keys",
      name: "Ben's Keys",
      icon: "🔑",
      description: "The keys to your Corley. Quohog was holding them — somebody told him to.",
      flavorText: "Turns over on the third kick. Same as it ever was.",
      isClue: false,
    },
  ],
  scenes: [
    /* ─────────────────────── 1 · OPENING CREDITS ────────────────────── */
    {
      id: "ft2_credits",
      title: "Full Throttle — The Corville Run",
      nodeType: "credits",
      background: "/img/ft-highway.jpg",
      ambientAudio: "drone",
      musicMode: "track",
      musicUrl: "/Soundtrack.mp3",
      letterbox: true,
      credits: {
        title: "FULL THROTTLE",
        subtitle: "The Corville Run",
        titleEntrance: "typewriter",
        stagger: 0.5,
        duration: 0.9,
        accentColor: "#ffb347",
        style: "fade-up",
        lines: [
          { role: "Starring", name: "Ben, leader of the Polecats" },
          { role: "and", name: "Quohog, the bartender" },
          { role: "The Kickstand", name: "Melonweed & the open road" },
        ],
      },
      prose:
        "\u201CWhenever I smell asphalt, I think of Maureen. That's the last sensation I had, before I blacked out. And the first thing I saw when I woke up was her face. Yeah, when I think of Maureen I think of two things: asphalt\u2026 and trouble.\u201D",
      choices: [{ id: "ft2c_start", text: "\u25B6 New Game", targetSceneId: "ft2_dump", attitudeTag: "Neutral" }],
      hotspots: [],
      dialogueBeats: [],
    },

    /* ─────────────────── 2 · INSIDE THE DUMPSTER (crouched) ─────────── */
    {
      id: "ft2_dump",
      title: "A Dumpster",
      background: "/img/ft-dumpster.jpg",
      ambientAudio: "drone",
      nodeType: "stage",
      prose: "",
      stage: {
        ...walker({ top: 72, bottom: 97 }, { x: 50, y: 92 }),
        // 🧍 SCENE DEFAULT POSE — Ben is CRAMPED in the dumpster, so the whole
        // room starts him in the "crouch" animation instead of idle.
        playerPose: "crouch",
        enterCaption: "A dumpster. You're in a dumpster. Somewhere overhead, a bar is playing music you don't like.",
      },
      hotspots: [
        {
          id: "ft2h_lid",
          label: "the dumpster lid",
          bounds: { x: 26, y: 50, w: 48, h: 24 },
          cursor: "punch",
          verbs: {
            look: { type: "showText", text: "The lid of a dumpster, a couple of feet over your head. Somebody wanted you out of the way, and this is where they put you." },
            talk: { type: "showText", text: "You could talk to the inside of a dumpster. It would only echo." },
            kick: { type: "showText", text: "You boot the lid from the inside. It rattles like a church bell and stays shut. Fists, not feet, for this one." },
            take: { type: "showText", text: "You could take the lid off — if you had a crowbar and the lid's cooperation. Neither is on offer." },
          },
          action: {
            type: "showText",
            flagSet: "ft2_free",
            text: "You punch the lid. It pops, flips, and hangs there like a challenge. Time to go.",
          },
        },
        {
          id: "ft2h_climb",
          label: "climb out",
          bounds: { x: 34, y: 44, w: 32, h: 18 },
          cursor: "go",
          gating: { requiresFlags: ["ft2_free"] },
          action: { type: "goToScene", targetSceneId: "ft2_alley" },
        },
      ],
      dialogueBeats: [],
      choices: [],
    },

    /* ─────────── 3 · THE ALLEY — A WIDE WORLD (200% strip) ──────────── */
    {
      id: "ft2_alley",
      title: "Behind the Kickstand",
      background: "/img/ft-alley-wide.jpg",
      ambientAudio: "drone",
      nodeType: "stage",
      prose: "",
      stage: {
        ...walker(
          { top: 66, bottom: 95 },
          { x: 8, y: 90 },
          [
            // 🚧 OBSTACLES — the dumpster you just climbed out of, and a stack
            // of crates mid-strip. Click-to-walk routes AROUND them.
            { x: 4, y: 66, w: 40, h: 30 },
            { x: 128, y: 70, w: 14, h: 24 },
          ]
        ),
        // 🖼 WIDE WORLD — one continuous 200%-wide strip; the camera pans to
        // follow Ben as he walks from the dumpster to the front door.
        worldWidth: 200,
        // 🚪 ENTRY SPAWNS — where you appear depends on the room you came from.
        entrySpawns: {
          ft2_dump: { x: 8, y: 90 },
          ft2_bar: { x: 168, y: 88 },
        },
        enterCaption: "Behind the Kickstand. You're out, you're alive, and your bike is around the corner — keys permitting.",
      },
      hotspots: [
        {
          id: "ft2h_under",
          label: "look under the dumpster",
          bounds: { x: 8, y: 82, w: 22, h: 12 },
          cursor: "look",
          verbs: {
            look: { type: "showText", text: "You bend low and squint into the dark. Nothing but muck, a dead lighter, and somebody's torn-up ticket stub." },
          },
          // 🧍 SET PLAYER POSE — a quick tap makes Ben BEND down and straighten
          // back up (transient), rather than switching the default pose.
          action: { type: "setPlayerPose", playerPose: "bend", playerPoseOnce: true },
        },
        {
          id: "ft2h_dumpster",
          label: "the dumpster",
          bounds: { x: 6, y: 62, w: 42, h: 30 },
          cursor: "look",
          verbs: {
            look: { type: "showText", text: "Your recent residence. You'd rather not go back in." },
            kick: { type: "showText", text: "You kick it. It doesn't apologize." },
            talk: { type: "showText", text: "It's heard everything you had to say already." },
          },
          action: { type: "showText", text: "The dumpster. You're not sentimental about it." },
        },
        {
          id: "ft2h_bike",
          label: "your bike",
          bounds: { x: 116, y: 58, w: 30, h: 36 },
          cursor: "use",
          image: "/assets/sprites/adv-bike.png",
          imageFit: "contain",
          verbs: {
            look: { type: "showText", text: "A Corley. Your Corley. She's been through worse than one bad night." },
            talk: { type: "showText", text: "You tell her you're leaving. She says nothing. She never says anything, but she's always right." },
            kick: { type: "showText", text: "You give the front tire a boot. It holds. You'd rather it not hold at the exact moment you're asking it to." },
            punch: { type: "showText", text: "You don't punch your bike. Some lines you don't cross." },
          },
          action: {
            type: "showText",
            flagSet: "ft2_noticed_keys",
            text: "You swing a leg over and reach for the ignition. Nothing. You pat your jacket. Still nothing.\n\n\u201CSome joker took my keys. I don't like that.\u201D",
          },
        },
        {
          id: "ft2h_ride",
          label: "ride out",
          bounds: { x: 120, y: 60, w: 22, h: 32 },
          cursor: "use",
          gating: { requiresItems: ["ft2_keys"] },
          verbs: {
            look: { type: "showText", text: "The road out of here. It's two lanes of maybe and a long way to Corville." },
          },
          action: { type: "goToScene", targetSceneId: "ft2_ride", text: "You slide the key in. She turns over on the third kick. You swing a leg over and point her at the road." },
        },
        {
          id: "ft2h_door",
          label: "the Kickstand door",
          bounds: { x: 154, y: 50, w: 20, h: 44 },
          cursor: "kick",
          verbs: {
            look: { type: "showText", text: "The door's locked. The Kickstand's closed, and the only other way in is the one with your boot on it." },
            talk: { type: "showText", text: "\u201COpen up!\u201D No answer. You didn't expect one." },
            punch: { type: "showText", text: "You rap your knuckles on it. Solid. You'll want your boot for this one." },
          },
          action: {
            type: "goToScene",
            targetSceneId: "ft2_bar",
            flagSet: "ft2_door",
            text: "You kick the door. It splinters at the latch and swings wide. You step inside, cool as anything.",
          },
        },
      ],
      dialogueBeats: [],
      choices: [],
    },

    /* ─────────────── 4 · INSIDE THE KICKSTAND (topic dialogue) ──────── */
    {
      id: "ft2_bar",
      title: "Inside the Kickstand",
      background: "/img/ft-bar.jpg",
      ambientAudio: "jazz",
      nodeType: "stage",
      prose: "",
      stage: {
        ...walker({ top: 62, bottom: 94 }, { x: 44, y: 88 }),
        // 🧭 WALK PATH — an explicit point-stretchable polygon instead of the
        // flat floor band: the room opens out at the door and tucks in behind
        // the bar.
        floorPoints: [
          { x: 0, y: 70 },
          { x: 45, y: 62 },
          { x: 100, y: 62 },
          { x: 100, y: 96 },
          { x: 0, y: 96 },
        ],
        // ➡ WALK-OFF-SCREEN EXIT — the red edge arrow back to the alley.
        exitEdges: { left: { targetSceneId: "ft2_alley", label: "the alley" } },
        entrySpawns: { ft2_alley: { x: 44, y: 88 } },
        enterCaption: "Empty, except for the bartender. The Polecats are long gone.",
      },
      hotspots: [
        {
          id: "ft2h_quohog",
          label: "Quohog the bartender",
          bounds: { x: 14, y: 48, w: 16, h: 44 },
          cursor: "talk",
          image: "/assets/sprites/ft2-bartender.png",
          isRepeatable: true,
          verbs: {
            look: { type: "showText", text: "Quohog. Nose ring, dead eyes, wiping the same glass he's been wiping since you walked in." },
            punch: { type: "showText", text: "Not yet. Talk to him first — find out what he knows before you start making new memories for him." },
            kick: { type: "showText", text: "You could boot the bar. It's not the bar that's lying to you." },
          },
          // 💬 TOPIC-LIST DIALOGUE — talking opens a hub of questions, not a
          // linear cutscene. Asking "My keys" sets ft2_quohog_talked, which
          // unlocks the grab marker.
          action: {
            type: "startDialogue",
            topicPrompt: "Quohog wipes the same glass. What do you want to ask?",
            topicLeaveLabel: "Walk away",
            topics: [
              {
                id: "ft2_topic_gang",
                label: "Where's my gang?",
                beats: [
                  { id: "ft2b_t1a", characterId: "ben", text: "I just want my keys. Where's my gang?" },
                  { id: "ft2b_t1b", characterId: "quohog", text: "They rode out with that Corley fella and the suit. 'Bout an hour ago. Said somethin' about the shareholders' meeting in Corville." },
                ],
              },
              {
                id: "ft2_topic_suit",
                label: "What did the suit tell you?",
                beats: [
                  { id: "ft2b_t2a", characterId: "quohog", text: "The suit — the one with the cane and the soft hands — he told me to hang onto these. In case you came sniffing around." },
                ],
              },
              {
                id: "ft2_topic_keys",
                label: "My keys, Quohog.",
                flagSet: "ft2_quohog_talked",
                beats: [
                  { id: "ft2b_t3a", characterId: "ben", text: "Give 'em here, Quohog." },
                  { id: "ft2b_t3b", characterId: "quohog", text: "Now hold on. There's been talk, Ben. Talk that you and the Polecats are in some kind of trouble. I ain't gettin' involved." },
                  { id: "ft2b_t3c", characterId: "ben", text: "You're already involved. You're holding my keys." },
                ],
              },
            ],
          },
        },
        {
          id: "ft2h_reach",
          label: "reach over the bar",
          bounds: { x: 26, y: 58, w: 18, h: 20 },
          cursor: "use",
          verbs: {
            look: { type: "showText", text: "Behind the bar: a row of bottles, a tin tip jar, and Quohog's rag. Nothing you came for." },
          },
          // 🧍 SET PLAYER POSE — a quick tap makes Ben REACH over the bar.
          action: { type: "setPlayerPose", playerPose: "reach", playerPoseOnce: true },
        },
        {
          id: "ft2h_grab",
          label: "grab Quohog",
          bounds: { x: 16, y: 54, w: 12, h: 26 },
          cursor: "punch",
          gating: { requiresFlags: ["ft2_quohog_talked"] },
          verbs: {
            look: { type: "showText", text: "He's not looking you in the eye. A man who's holding something that isn't his." },
          },
          action: {
            type: "giveItem",
            itemGranted: "ft2_keys",
            flagSet: "ft2_quohog_talked",
            text: "You grab him by the nose ring and yank. He gags, scrambles, and slaps your keys down on the bar.\n\nQuohog: \u201CThe Polecats rode out with that Corley fella! The suit said you'd gone on ahead to scout the route! Don't hit me!\u201D",
          },
        },
        {
          id: "ft2h_piano",
          label: "the piano",
          bounds: { x: 76, y: 62, w: 18, h: 30 },
          cursor: "look",
          isRepeatable: true,
          verbs: {
            look: { type: "showText", text: "An upright that's seen every bar fight on this stretch of road." },
            kick: { type: "showText", text: "You boot the piano. It answers with a chord like a man falling down a flight of stairs." },
            talk: { type: "showText", text: "\u201CIt's hard enough to play with your fingers.\u201D" },
          },
          action: { type: "showText", text: "Man, I wish they had a jukebox." },
        },
      ],
      dialogueBeats: [],
      choices: [],
    },

    /* ─────────────── 5 · THE ROTTWHEELER DUEL (quick-time) ──────────── */
    {
      id: "ft2_ride",
      title: "Highway 9, Heading North",
      background: "/img/ft-highway.jpg",
      ambientAudio: "drone",
      musicMode: "track",
      musicUrl: "/Soundtrack.mp3",
      letterbox: true,
      prose: "",
      dialogueBeats: [
        { id: "ft2b_r1", characterId: "ben", text: "When I'm on the road, I'm indestructible. No one can stop me\u2026" },
        { id: "ft2b_r2", characterId: "narrator", text: "Except the Rottwheeler, coming up fast on your flank with a chain in his fist and a grudge the size of Corville." },
        { id: "ft2b_r3", characterId: "rott", text: "Nice jacket! I'll keep it!" },
      ],
      choices: [
        {
          id: "ft2c_fight",
          text: "Boot his front wheel — knock him off the road!",
          quickTime: true,
          qtePrompt: "BOOT HIM!",
          timeLimitSeconds: 5,
          qteHeartbeat: true,
          qteShakyCam: true,
          targetSceneId: "ft2_tbc",
          attitudeTag: "Aggressive",
          timedOutTargetSceneId: "ft2_ride_dead",
        },
      ],
      hotspots: [],
    },

    /* ─────────────── 5b · LOSING THE DUEL (game over) ───────────────── */
    {
      id: "ft2_ride_dead",
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

    /* ───────────────────────── 6 · PART ONE BREAK ───────────────────── */
    {
      id: "ft2_tbc",
      title: "To Be Continued",
      isEnding: true,
      background: "/img/ft-highway.jpg",
      letterbox: true,
      prose:
        "You wake in a stranger's shack with the taste of dust in your mouth and a woman leaning over you holding a socket wrench. \u201CYour bike's a mess,\u201D she says, like it's a greeting. \u201CBut I can fix it. Free. No strings attached.\u201D\n\nHer name is Maureen. And that's when things get interesting.",
      endingData: {
        tier: "victory-silver",
        headline: "END OF PART ONE — THE CORVILLE RUN",
        recap: "Out of the dumpster, keys back off the bartender, and a rival off the road — but the suit with the cane is still out there, and the road to Corville isn't done with you yet.",
      },
      hotspots: [],
      dialogueBeats: [],
      choices: [],
    },
  ],
};
