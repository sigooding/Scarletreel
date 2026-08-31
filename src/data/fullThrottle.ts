import type { Story } from "../types";
import type { SpriteSheet } from "../game/spriteSheet";

/**
 * FULL THROTTLE — THE KICKSTAND (a faithful recreation of the opening)
 * ---------------------------------------------------------------------
 * A point-and-click homage to the first act of LucasArts' 1995 Full
 * Throttle, rebuilt in this engine's adventure mode (gameKind: "adventure")
 * with authentic beats and dialogue. The original opens on Ben's flash-
 * forward narration ("Whenever I smell asphalt…"), rolls credits over a
 * night ride down a desert highway, plays the limo scene, then the sales
 * pitch at the Kickstand — and only THEN hands the player the mouse, in the
 * dark, inside a dumpster.
 *
 * The playable stretch, screen by screen as the original plays it:
 *   1. INSIDE THE DUMPSTER — punch the lid, climb out.
 *   2. The alley behind the Kickstand — a WIDE WORLD: one continuous
 *      scrolling strip, two viewport-widths long. The dumpster sits on the
 *      left screen; walk right and the CAMERA PANS around the corner to the
 *      front of the bar, where your bike (keys gone) and the door are. This
 *      is exactly the scrolling alley of the original — no scene cuts, the
 *      world just scrolls.
 *   3. Inside the Kickstand — Quohog, the piano gag, fist the keys out of
 *      him; walk off the LEFT EDGE (the red arrow) to leave the bar.
 *   4. Ride out — the Rottwheeler duel as a QUICK-TIME fight (hesitate and
 *      the road takes you), the sabotaged front wheel, the crash, Miranda —
 *      closing on the "asphalt" bookend and a Part One break.
 *
 * Verb mapping (the engine's coin is look/take/talk/use/go — Full
 * Throttle's skull is eyes/mouth/fist/boot). The engine now OPT-INS the two
 * body-verbs this story needs (`stage.extendedVerbs`), so the rooms use them
 * as close to the original as the engine allows:
 *   eyes → look      mouth → talk      fist → punch      boot → kick
 * The opt-in keeps every other game kind (visual novels, classic cases)
 * untouched — see docs/adventure-mode.md and docs/full-throttle-assessment.md.
 *
 * REMAINING GAPS (ranked — see the assessment doc):
 *   1. The coin is verb-FIRST (pick a verb, then click); Full Throttle is
 *      object-first (hold an object, the skull pops, pick fist/eye/mouth/boot).
 *      The recreation uses the object-first menu everywhere it can.
 *   2. No bike-riding locomotion — the Rottwheeler duel is a QTE fight, the
 *      crash is narrated (the assessment's planned minigame is partly in).
 *   3. Topic-list dialogue — Quohog's conversation is linear beats.
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
 *  NOT set here — it comes from the story-wide `playerSprite` (the In-game
 *  theme's 🚶 Player character), so Ben is defined once for the whole case. */
const walker = (
  floor: { top: number; bottom: number },
  spawn: { x: number; y: number },
  obstacles: { x: number; y: number; w: number; h: number }[] = [],
  extra: Record<string, unknown> = {}
) => ({
  verbCoin: true,
  // 👢👊 OPT-IN: this story's coin offers kick & punch (Ben's boot and fist)
  // on top of the classic five. Other game kinds never set this flag.
  extendedVerbs: true,
  // 💀 OPT-IN: object-first interaction — click an object, a pie menu of its
  // verbs pops up next to it (Full Throttle's "skull"), instead of the
  // bottom-left verb coin. See docs/adventure-mode.md.
  objectVerbMenu: true,
  // ⏱ HOLD-TO-OPEN (classic FT): press and hold an object and the BIG skull
  // pie opens in the middle of the screen — release over a verb to act. The
  // centrepiece sprite comes from the story's verbMenuIcon (In-game theme).
  objectMenuHold: true,
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

export const FULL_THROTTLE: Story = {
  id: "full-throttle",
  title: "Full Throttle — The Kickstand",
  tagline: "Whenever I smell asphalt, I think of Maureen.",
  coverImage: "/img/ft-highway.jpg",
  gameKind: "adventure",
  startSceneId: "ft_credits",
  // 🚶 Ben, defined once story-wide (the In-game theme's Player character
  // setting). Every stage room inherits him; a room could still override with
  // its own playerSheet/playerImage.
  playerSprite: { sheet: BEN_WALK },
  layout: {
    ft_credits: { x: 40, y: 40 },
    ft_limo: { x: 280, y: 40 },
    ft_pitch: { x: 520, y: 40 },
    ft_dump: { x: 40, y: 280 },
    ft_alley: { x: 280, y: 280 },
    ft_bar: { x: 520, y: 280 },
    ft_ride: { x: 40, y: 520 },
    ft_ride2: { x: 200, y: 520 },
    ft_ride3: { x: 360, y: 520 },
    ft_ride_dead: { x: 200, y: 700 },
    ft_tbc: { x: 520, y: 520 },
  },
  briefing: {
    objective:
      "You come to inside a dumpster behind the Kickstand with no keys and a headache. Get out, get your bike keys back off the bartender, and ride after your gang.",
    winConditions: [
      "Punch your way out of the dumpster.",
      "Walk the alley around to the front of the Kickstand; kick in the door.",
      "Fist your keys out of Quohog and ride out after the Polecats.",
      "Beat the Rottwheeler on the road to Corville.",
    ],
    loseConditions: ["Lose the road fight — the chain takes you off the bike, and that's the end of that."],
  },
  // Cursor art: a pointing hand for use/take, an eye for look. Full Throttle's
  // skull coin has no hand/eye cutouts here, so these are the closest the
  // engine's opt-in cursor art gets. "talk" (mouth) and "kick" (boot) have no
  // art and keep the system cursor — a gap noted in the assessment.
  cursorArt: {
    default: { image: "/assets/ui/cursor-hand.png", size: 34 },
    look: { image: "/assets/ui/cursor-eye.png", size: 30 },
    take: { image: "/assets/ui/cursor-hand.png", size: 34 },
    use: { image: "/assets/ui/cursor-hand.png", size: 34 },
  },
  // 💀 The skull-pie centrepiece — a flaming-skull sprite in the game's own
  // art, set on the In-game theme tab (the engine's default is a skull emoji).
  // It sits BIG in the middle of the ring of verbs when the hold-to-open
  // object-first menu is up.
  verbMenuIcon: "/img/ft-skull.png",
  // Ben carries everything in his jacket. The engine's "container" mode with
  // no art falls back to a stitched leather panel — right look for a biker.
  inventoryDisplay: {
    mode: "container",
    label: "Jacket",
    anchor: "bottom-left",
    columns: 3,
    inset: 18,
    height: 220,
  },
  // Wrong-verb answers in Ben's voice, varied so a failed verb doesn't loop.
  verbResponses: {
    look: [
      "Nothing you haven't seen before.",
      "You look. It doesn't get any prettier.",
      "Same as it was a second ago.",
    ],
    take: [
      "You're not gonna fit that in your jacket.",
      "Leave it. It's not going anywhere and neither are you, yet.",
      "Bolted down. Pass.",
    ],
    talk: [
      "Talking to it won't help.",
      "No answer. Not even a shrug.",
      "You've got nothing to say to a thing like that.",
    ],
    use: [
      "That does nothing. Not even a good noise.",
      "Wrong move. Try it on something that'll fight back.",
      "Nope. Zip.",
    ],
    go: [
      "That's a wall, not a road.",
      "No exit there. Just bricks and a bad idea.",
      "You could go that way. You'd come right back.",
    ],
    kick: [
      "You give it a boot. It gives you nothing back.",
      "That's how you scuff a boot and get squat.",
      "Kicking that isn't the move. Yet.",
    ],
    punch: [
      "You take a swing. It does not swing back, which is worse.",
      "Punching that solves nothing and stings plenty.",
      "Save the fists for something that deserves 'em.",
    ],
  },
  flagNotes: {
    ft_free: "Ben punched his way out of the dumpster.",
    ft_door_open: "Ben kicked in the Kickstand's front door.",
    ft_noticed_keys: "The keys are gone — some joker took 'em.",
    ft_quohog_talked: "Quohog told Ben the Polecats rode off with Corley.",
    ft_rott_beaten: "The Rottwheeler ate a chain sandwich and left the road.",
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
      role: "Vice President, Corley Motors",
      avatarUrl: "emoji:🎩",
      trustMeter: -2,
      voice: { pitch: 1.05, rate: 0.98 },
    },
    {
      id: "corley",
      name: "Malcolm Corley",
      role: "The Old Man of Corley Motors",
      avatarUrl: "emoji:👴",
      trustMeter: 1,
      voice: { pitch: 0.72, rate: 0.95 },
    },
    {
      id: "darrel",
      name: "Darrel",
      role: "Polecat",
      avatarUrl: "emoji:🏍",
      trustMeter: 1,
      voice: { pitch: 1.0, rate: 1.0 },
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
      id: "ft_keys",
      name: "Ben's Keys",
      icon: "🔑",
      description: "The keys to your Corley. Quohog was holding them — somebody told him to.",
      flavorText: "Turns over on the third kick. Same as it ever was.",
      isClue: false,
    },
  ],
  scenes: [
    /* ─────────────────────────── 1 · OPENING CREDITS ────────────────── */
    {
      id: "ft_credits",
      title: "Full Throttle",
      nodeType: "credits",
      background: "/img/ft-highway.jpg",
      ambientAudio: "drone",
      musicMode: "track",
      musicUrl: "/Soundtrack.mp3",
      letterbox: true,
      credits: {
        title: "FULL THROTTLE",
        subtitle: "a point-and-click recreation of the opening",
        titleEntrance: "typewriter",
        stagger: 0.5,
        duration: 0.9,
        accentColor: "#ffb347",
        style: "fade-up",
        lines: [
          { role: "Starring", name: "Ben, leader of the Polecats" },
          { role: "and", name: "Adrian Ripburger" },
          { role: "with", name: "Malcolm Corley" },
          { role: "The Kickstand", name: "Melonweed & the open road" },
        ],
      },
      prose:
        "\u201CWhenever I smell asphalt, I think of Maureen. That's the last sensation I had, before I blacked out: the thick smell of asphalt. And the first thing I saw when I woke up was her face. She said she'd fix my bike. Free. No strings attached. I should have known then that things are never that simple. Yeah, when I think of Maureen I think of two things: asphalt… and trouble.\u201D",
      choices: [
        { id: "ftc_newgame", text: "▶ New Game", targetSceneId: "ft_limo", attitudeTag: "Neutral" },
      ],
      hotspots: [],
      dialogueBeats: [],
    },

    /* ─────────────────────────── 2 · THE LIMO ───────────────────────── */
    {
      id: "ft_limo",
      title: "Highway 9",
      background: "/img/ft-highway.jpg",
      ambientAudio: "drone",
      letterbox: true,
      prose: "",
      dialogueBeats: [
        {
          id: "ftb_l0",
          characterId: "narrator",
          silent: true,
          text: "Somewhere on Highway 9, the Polecats are riding hard, and Ben is out front where he belongs.",
        },
        {
          id: "ftb_l1",
          characterId: "corley",
          expression: "irate",
          text: "Ripburger, you're dumber than dirt!",
        },
        {
          id: "ftb_l2",
          characterId: "ripburger",
          text: "Oh, Mr. Corley. If only you'd listen to my plan — my vision.",
        },
        {
          id: "ftb_l3",
          characterId: "corley",
          text: "I know your plan, Ripburger. You're waiting for me to die so you can take over my company.",
        },
        {
          id: "ftb_l4",
          characterId: "ripburger",
          text: "The shareholders, sir. It's good PR to be seen hobnobbing with real Corley Motors customers.",
        },
        {
          id: "ftb_l5",
          characterId: "corley",
          text: "What do you know about our customers, Adrian? You've never even been on a bike.",
        },
        {
          id: "ftb_l6",
          characterId: "ripburger",
          text: "Oh, you know I'd be on one right now, sir. If it weren't for my destabilising inner-ear condition.",
        },
        {
          id: "ftb_l7",
          characterId: "corley",
          text: "Ah, your ears are fine. It's what's between 'em that scares me.",
        },
        {
          id: "ftb_l8",
          characterId: "narrator",
          text: "Ben drops back, then jumps his bike clean over the limo's hood — just to make sure everybody's paying attention.",
        },
      ],
      choices: [
        { id: "ftc_l_cont", text: "▶", targetSceneId: "ft_pitch", attitudeTag: "Neutral" },
      ],
      hotspots: [],
    },

    /* ─────────────────────────── 3 · THE SALES PITCH ────────────────── */
    {
      id: "ft_pitch",
      title: "The Kickstand",
      background: "/img/ft-bar.jpg",
      ambientAudio: "jazz",
      letterbox: true,
      prose: "",
      dialogueBeats: [
        { id: "ftb_p1", characterId: "darrel", text: "Hey Ben!" },
        { id: "ftb_p2", characterId: "ben", text: "Huh?" },
        { id: "ftb_p3", characterId: "darrel", text: "You know, Ben, we're broke." },
        { id: "ftb_p4", characterId: "ben", text: "Yeah?" },
        {
          id: "ftb_p5",
          characterId: "darrel",
          text: "And if some cash doesn't come our way soon, we're in big trouble.",
        },
        {
          id: "ftb_p6",
          characterId: "ben",
          text: "Relax. I have a feeling something's coming our way. Something big.",
        },
        {
          id: "ftb_p7",
          characterId: "corley",
          text: "You'd better stay out here, Rip. This place is for bikers only. Heh heh heh.",
        },
        { id: "ftb_p8", characterId: "ben", text: "But Malcolm, isn't that illegal?" },
        { id: "ftb_p9", characterId: "corley", text: "Not back then it wasn't." },
        { id: "ftb_p10", characterId: "ben", text: "So, who do you ride with these days?" },
        {
          id: "ftb_p11",
          characterId: "ripburger",
          text: "He rides with me. Although, I'm sure he'd much rather be riding with your little club.",
        },
        {
          id: "ftb_p12",
          characterId: "corley",
          text: "I told you to wait out in the limo, Ripburger!",
        },
        {
          id: "ftb_p13",
          characterId: "ripburger",
          text: "I thought you might like some help with your sales pitch, sir.",
        },
        { id: "ftb_p14", characterId: "ben", text: "Sales pitch?!" },
        {
          id: "ftb_p15",
          characterId: "ripburger",
          text: "Yes, we've come here today to offer you and your men employment. Mr. Corley requires an escort to the annual Corley Motors shareholders' meeting.",
        },
        {
          id: "ftb_p16",
          characterId: "ben",
          text: "Does this look like an escort service to you?",
        },
        {
          id: "ftb_p17",
          characterId: "ripburger",
          text: "You would be well compensated for your time, of course.",
        },
        { id: "ftb_p18", characterId: "ben", text: "Not interested." },
        {
          id: "ftb_p19",
          characterId: "ripburger",
          text: "It's fairly obvious that you could use the money…",
        },
        {
          id: "ftb_p20",
          characterId: "ben",
          text: "Listen, I said we're not for rent. The Polecats are not goons for hire.",
        },
        {
          id: "ftb_p21",
          characterId: "ripburger",
          text: "Not even if it were Malcolm Corley's dying wish?",
        },
        {
          id: "ftb_p22",
          characterId: "corley",
          expression: "irate",
          text: "RIPBURGER! THAT DOES IT. I'M GONNA—",
        },
        {
          id: "ftb_p23",
          characterId: "ben",
          text: "Hold on there, Malcolm. If you don't mind, I'd like to step outside with Mr. Ripburger for a little chat.",
        },
        { id: "ftb_p24", characterId: "ripburger", text: "Excellent idea." },
        {
          id: "ftb_p25",
          characterId: "narrator",
          text: "Outside, under the neon, Ripburger makes his case in a whisper.",
        },
        {
          id: "ftb_p26",
          characterId: "ripburger",
          text: "And the doctor says he only has a few months to live.",
        },
        {
          id: "ftb_p27",
          characterId: "ben",
          text: "That's bad news for all of us. He's not just a nice guy. He's also the last motorcycle maker in the country. What happens to Corley Motors if he dies?",
        },
        {
          id: "ftb_p28",
          characterId: "ripburger",
          text: "Don't worry, I have a plan. And if you come to the shareholders' meeting with us, you'll find out what it is.",
        },
        {
          id: "ftb_p29",
          characterId: "ben",
          text: "No dice, Ripburger. The Polecats are not thugs for rent.",
        },
        {
          id: "ftb_p30",
          characterId: "ripburger",
          text: "And that's your last word?",
        },
        {
          id: "ftb_p31",
          characterId: "ripburger",
          text: "Well, I'd like to make you just one final offer…",
        },
        {
          id: "ftb_p32",
          characterId: "narrator",
          text: "The offer is a fist in the dark. Ben doesn't remember hitting the ground.",
        },
        {
          id: "ftb_p33",
          characterId: "corley",
          text: "That stuffed shirt actually thinks I'll leave HIM in control of Corley Motors when I go. Boy, is he in for a surprise.",
        },
        { id: "ftb_p34", characterId: "darrel", text: "Hey, where's Ben going?" },
        {
          id: "ftb_p35",
          characterId: "ripburger",
          text: "Your colleague has decided to accept our generous offer after all. As a matter of fact, he's gone on ahead to scout out the route.",
        },
        { id: "ftb_p36", characterId: "darrel", text: "He did?" },
        { id: "ftb_p37", characterId: "corley", text: "Well then… let's roll 'em, boys!" },
      ],
      choices: [
        { id: "ftc_p_wake", text: "▶", targetSceneId: "ft_dump", attitudeTag: "Neutral" },
      ],
      hotspots: [],
    },

    /* ─────────────────────── 4 · INSIDE THE DUMPSTER ────────────────── */
    {
      id: "ft_dump",
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
          id: "fth_lid",
          label: "the dumpster lid",
          bounds: { x: 26, y: 50, w: 48, h: 24 },
          cursor: "punch",
          verbs: {
            look: {
              type: "showText",
              text: "The lid of a dumpster, a couple of feet over your head. Somebody wanted you out of the way, and this is where they put you.",
            },
            talk: {
              type: "showText",
              text: "You could talk to the inside of a dumpster. It would only echo.",
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
            flagSet: "ft_free",
            text: "You punch the lid. It pops, flips, and hangs there like a challenge. Time to go.",
          },
        },
        {
          id: "fth_climb_out",
          label: "climb out",
          bounds: { x: 26, y: 50, w: 48, h: 24 },
          cursor: "go",
          gating: { requiresFlags: ["ft_free"] },
          action: {
            type: "goToScene",
            targetSceneId: "ft_alley",
            text: "You haul yourself up and over the lip, into the cool desert night. First thing that's gone right all evening.",
          },
        },
        {
          id: "fth_trash",
          label: "the trash",
          bounds: { x: 8, y: 82, w: 84, h: 13 },
          cursor: "look",
          isRepeatable: true,
          verbs: {
            take: {
              type: "showText",
              text: "Old newspapers, a busted lamp, somebody's bad night. You leave it exactly as you found it: yours.",
            },
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
        {
          id: "fth_dump_walls",
          label: "the dumpster walls",
          bounds: { x: 2, y: 40, w: 8, h: 56 },
          cursor: "look",
          isRepeatable: true,
          verbs: {
            punch: {
              type: "showText",
              text: "You punch the wall. It booms like a drum. Nobody hears, nobody cares.",
            },
          },
          action: {
            type: "showText",
            text: "Ribbed green metal, painted over about forty times, dented in a language you understand.",
          },
        },
      ],
      dialogueBeats: [],
      choices: [],
    },

    /* ─────────────────── 5 · THE ALLEY (a WIDE WORLD) ───────────────── */
    {
      id: "ft_alley",
      title: "Behind the Kickstand",
      background: "/img/ft-alley-wide.jpg",
      ambientAudio: "drone",
      nodeType: "stage",
      prose: "",
      stage: {
        // 🎥 WIDE WORLD: one continuous strip, two viewport-widths long.
        // The dumpster is on the LEFT screen; walk right and the camera pans
        // around the corner to the front of the Kickstand (bike + door) on
        // the RIGHT screen — the scrolling alley of the original, no cuts.
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
            // Where you appear depends on where you walked in from: the
            // dumpster if you climbed out of it, the front door if you left
            // the bar. (Cyan dots in the Studio's walkable-stage editor.)
            entrySpawns: {
              ft_dump: { x: 30, y: 90 },
              ft_bar: { x: 162, y: 90 },
            },
          }
        ),
        enterCaption:
          "Behind the Kickstand. You're out, you're alive, and your bike is around the corner — keys permitting.",
      },
      hotspots: [
        {
          id: "fth_dumpster",
          label: "the dumpster",
          bounds: { x: 14, y: 56, w: 38, h: 34 },
          cursor: "look",
          isRepeatable: true,
          verbs: {
            punch: {
              type: "showText",
              text: "You punch the dumpster. A dent blooms in the side and fades again. Cathartic, but not useful.",
            },
            kick: {
              type: "showText",
              text: "You boot it for good measure. It doesn't even rattle. You've got its measure now.",
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
          id: "fth_bike",
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
            kick: {
              type: "showText",
              text: "You give the front tire a boot. It holds. You'd rather it not hold at the exact moment you're asking it to.",
            },
            punch: {
              type: "showText",
              text: "You don't punch your bike. Some lines you don't cross.",
            },
          },
          action: {
            type: "showText",
            flagSet: "ft_noticed_keys",
            text: "You swing a leg over and reach for the ignition. Nothing. You pat your jacket. Still nothing.\n\n\u201CSome joker took my keys. I don't like that.\u201D",
          },
        },
        {
          id: "fth_ride",
          label: "ride out",
          bounds: { x: 120, y: 60, w: 22, h: 32 },
          cursor: "use",
          // The keys are the gate: no keys, no ignition — this marker stays
          // 🔒 until Quohog hands them over.
          gating: { requiresItems: ["ft_keys"] },
          verbs: {
            look: {
              type: "showText",
              text: "The road out of here. It's two lanes of maybe and a long way to Corville.",
            },
          },
          action: {
            type: "goToScene",
            targetSceneId: "ft_ride",
            text: "You slide the key in. She turns over on the third kick. You swing a leg over and point her at the road.",
          },
        },
        {
          id: "fth_door",
          label: "the Kickstand door",
          bounds: { x: 154, y: 50, w: 20, h: 44 },
          cursor: "kick",
          verbs: {
            look: {
              type: "showText",
              text: "The door's locked. The Kickstand's closed, and the only other way in is the one with your boot on it.",
            },
            talk: {
              type: "showText",
              text: "\u201COpen up!\u201D No answer. You didn't expect one.",
            },
            punch: {
              type: "showText",
              text: "You rap your knuckles on it. Solid. You'll want your boot for this one.",
            },
          },
          action: {
            type: "goToScene",
            targetSceneId: "ft_bar",
            flagSet: "ft_door_open",
            text: "You kick the door. It splinters at the latch and swings wide. You step inside, cool as anything.",
          },
        },
      ],
      dialogueBeats: [],
      choices: [],
    },

    /* ─────────────────────────── 6 · INSIDE THE KICKSTAND ───────────── */
    {
      id: "ft_bar",
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
            // ➡ WALK-OFF-SCREEN EXIT: the red arrow at the LEFT edge — walk
            // into it and Ben strides off the plate, back out to the alley.
            // (The door marker near the middle also leaves, for pointer users
            // who'd rather click the door than the edge.)
            exitEdges: {
              left: { targetSceneId: "ft_alley", label: "the alley" },
            },
          }
        ),
        enterCaption: "Empty, except for the bartender. The Polecats are long gone.",
      },
      hotspots: [
        {
          id: "fth_quohog",
          label: "Quohog the bartender",
          bounds: { x: 14, y: 50, w: 16, h: 42 },
          cursor: "talk",
          verbs: {
            look: {
              type: "showText",
              text: "Quohog. Nose ring, dead eyes, wiping the same glass he's been wiping since you walked in.",
            },
            punch: {
              type: "showText",
              text: "Not yet. Talk to him first — find out what he knows before you start making new memories for him.",
            },
            kick: {
              type: "showText",
              text: "You could boot the bar. It's not the bar that's lying to you.",
            },
          },
          // Talking to Quohog is what unlocks the fist: the conversation
          // itself sets ft_quohog_talked, so the grab marker (gated on it)
          // opens up afterwards — a proper talk-then-shake-down chain.
          action: { type: "startDialogue", flagSet: "ft_quohog_talked" },
        },
        {
          id: "fth_quohog_grab",
          label: "grab Quohog",
          bounds: { x: 16, y: 54, w: 12, h: 26 },
          cursor: "punch",
          gating: { requiresFlags: ["ft_quohog_talked"] },
          verbs: {
            look: {
              type: "showText",
              text: "He's not looking you in the eye. A man who's holding something that isn't his.",
            },
          },
          action: {
            type: "giveItem",
            itemGranted: "ft_keys",
            flagSet: "ft_quohog_talked",
            text: "You grab him by the nose ring and yank. He gags, scrambles, and slaps your keys down on the bar.\n\nQuohog: \u201CThe Polecats rode out with that Corley fella! The suit said you'd gone on ahead to scout the route! Don't hit me!\u201D",
          },
        },
        {
          id: "fth_piano",
          label: "the piano",
          bounds: { x: 76, y: 62, w: 18, h: 30 },
          cursor: "look",
          isRepeatable: true,
          verbs: {
            look: {
              type: "showText",
              text: "An upright that's seen every bar fight on this stretch of road.",
            },
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
          id: "fth_bar_door",
          label: "back outside",
          bounds: { x: 44, y: 58, w: 14, h: 36 },
          cursor: "go",
          action: { type: "goToScene", targetSceneId: "ft_alley" },
        },
      ],
      dialogueBeats: [
        {
          id: "ftb_q1",
          characterId: "ben",
          text: "I, uh, fixed your door. It was sticking.",
        },
        {
          id: "ftb_q2",
          characterId: "quohog",
          text: "Look, I don't want no trouble. Just leave me out of this mess.",
        },
        {
          id: "ftb_q3",
          characterId: "ben",
          text: "I just want my keys. Where's my gang?",
        },
        {
          id: "ftb_q4",
          characterId: "quohog",
          text: "They rode out with that Corley fella and the suit. 'Bout an hour ago. Said somethin' about the shareholders' meeting in Corville.",
        },
        {
          id: "ftb_q5",
          characterId: "quohog",
          text: "And the suit — the one with the cane and the soft hands — he told me to hang onto these. In case you came sniffing around.",
        },
        {
          id: "ftb_q6",
          characterId: "ben",
          text: "Give 'em here, Quohog.",
        },
        {
          id: "ftb_q7",
          characterId: "quohog",
          text: "Now hold on. There's been talk, Ben. Talk that you and the Polecats are in some kind of trouble. I ain't gettin' involved.",
        },
        {
          id: "ftb_q8",
          characterId: "ben",
          text: "You're already involved. You're holding my keys.",
        },
      ],
      choices: [],
    },

    /* ─────────────────── 7 · THE ROTTWHEELER DUEL (QTE) ─────────────── */
    {
      id: "ft_ride",
      title: "Highway 9, Heading North",
      background: "/img/ft-highway.jpg",
      ambientAudio: "drone",
      musicMode: "track",
      musicUrl: "/Soundtrack.mp3",
      letterbox: true,
      prose: "",
      dialogueBeats: [
        {
          id: "ftb_r1",
          characterId: "ben",
          text: "When I'm on the road, I'm indestructible. No one can stop me…",
        },
        {
          id: "ftb_r2",
          characterId: "narrator",
          text: "A Rottwheeler drops into the lane beside you, chain in his fist. Somebody wants your bike — and they want it enough to fight for it.",
        },
        {
          id: "ftb_r3",
          characterId: "ben",
          text: "…but they try.",
        },
        {
          id: "ftb_r4",
          characterId: "narrator",
          silent: true,
          text: "The road narrows. Your hands are full of throttle and his are full of chain. It's going to be one of those conversations.",
        },
      ],
      choices: [
        {
          id: "ftc_fight1",
          text: "Swing your chain at his head!",
          quickTime: true,
          qtePrompt: "HIT HIM!",
          timeLimitSeconds: 5,
          qteHeartbeat: true,
          qteShakyCam: true,
          targetSceneId: "ft_ride2",
          attitudeTag: "Aggressive",
          timedOutTargetSceneId: "ft_ride_dead",
        },
      ],
      hotspots: [],
    },
    {
      id: "ft_ride2",
      title: "The Duel",
      background: "/img/ft-highway.jpg",
      ambientAudio: "drone",
      musicMode: "track",
      musicUrl: "/Soundtrack.mp3",
      letterbox: true,
      prose: "",
      dialogueBeats: [
        {
          id: "ftb_r5",
          characterId: "narrator",
          text: "Your chain cracks his mirror. He comes back swinging — his chain takes you across the jacket and lays the leather open.",
        },
        {
          id: "ftb_r6",
          characterId: "rott",
          text: "Nice jacket! I'll keep it!",
        },
        {
          id: "ftb_r7",
          characterId: "ben",
          text: "You'll keep a hospital bed.",
        },
      ],
      choices: [
        {
          id: "ftc_fight2",
          text: "Boot his front wheel — knock him off the road!",
          quickTime: true,
          qtePrompt: "BOOT HIM!",
          timeLimitSeconds: 5,
          qteHeartbeat: true,
          qteShakyCam: true,
          targetSceneId: "ft_ride3",
          attitudeTag: "Aggressive",
          timedOutTargetSceneId: "ft_ride_dead",
        },
      ],
      hotspots: [],
    },
    {
      id: "ft_ride3",
      title: "The Long Way to Melonweed",
      background: "/img/ft-highway.jpg",
      ambientAudio: "drone",
      musicMode: "track",
      musicUrl: "/Soundtrack.mp3",
      letterbox: true,
      prose: "",
      dialogueBeats: [
        {
          id: "ftb_r8",
          characterId: "narrator",
          text: "Your boot finds his front wheel. It wobbles, folds, and the Rottwheeler leaves the road in a shower of sparks. You don't look back.",
        },
        {
          id: "ftb_r9",
          characterId: "narrator",
          silent: true,
          text: "The fight is short and mean — road rash and chrome. But the Rottwheeler wasn't the problem.",
        },
        {
          id: "ftb_r10",
          characterId: "narrator",
          silent: true,
          text: "The front wheel shimmies. Bolus did more than take your keys — he put a tool to the forks. At speed, the wheel says goodbye, and so does the road.",
        },
        {
          id: "ftb_r11",
          characterId: "miranda",
          text: "Hey! Hey, are you okay? Oh, this is going to make a great story. Don't move, I'm getting my camera.",
        },
        {
          id: "ftb_r12",
          characterId: "narrator",
          silent: true,
          text: "And then, nothing but the smell of asphalt…",
        },
      ],
      choices: [
        { id: "ftc_r_end", text: "▶", targetSceneId: "ft_tbc", attitudeTag: "Neutral" },
      ],
      hotspots: [],
    },

    /* ──────────────────── 7b · LOSING THE DUEL (GAME OVER) ──────────── */
    {
      id: "ft_ride_dead",
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

    /* ─────────────────────────── 8 · PART ONE BREAK ─────────────────── */
    {
      id: "ft_tbc",
      title: "To Be Continued",
      isEnding: true,
      background: "/img/ft-highway.jpg",
      letterbox: true,
      prose:
        "You wake in a stranger's shack with the taste of dust in your mouth and a woman leaning over you holding a socket wrench. \u201CYour bike's a mess,\u201D she says, like it's a greeting. \u201CBut I can fix it. Free. No strings attached.\u201D\n\nHer name is Maureen. And that's when things get interesting.",
      endingData: {
        tier: "victory-silver",
        headline: "END OF PART ONE — THE KICKSTAND",
        recap: "You punched out of a dumpster, walked the alley around to the front, kicked in a door, shook your keys out of a bartender, and beat a Rottwheeler for the right to crash your own bike. Next: Melonweed, and the long road to Corville.",
      },
      hotspots: [],
      dialogueBeats: [],
      choices: [],
    },
  ],
};
