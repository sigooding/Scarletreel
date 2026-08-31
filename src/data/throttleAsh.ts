import type { Story } from "../types";
import type { SpriteSheet } from "../game/spriteSheet";

/**
 * THROTTLE & ASH — THE LONG WAY DOWN
 *
 * The PROTOTYPE for the point-and-click mode (see docs/adventure-mode.md).
 * It is deliberately built the way a LucasArts / Full Throttle room game is
 * built — walkable rooms, verb cursors, an inventory puzzle, an NPC who has
 * to be caught out with evidence — using only what the engine actually has
 * today, so that every gap shows up as a compromise in this file rather than
 * as a surprise later.
 *
 * What it exercises:
 *  · 🚶 STAGE rooms with real furniture (stage.obstacles) routed around by
 *    the new A* walker — walk behind the counter, not through it.
 *  · Verb cursors: 👁 look / ✋ take / 💬 talk / ⚙ use / ➜ go.
 *  · An inventory puzzle: wrench + fuel line → repair kit → drag it onto the
 *    bike at the edge of town (or arm it with the ⚙ use verb and click).
 *  · A USE-on-hotspot verb (the coffee on the jukebox) and a PRESENT verb
 *    (the siphon receipt, which is what puts Cutter away).
 *  · Idle animation on scene art: the Roadhouse sign flickers (CSS preset).
 *  · Three endings: gold (proof + ride), silver (ride, no proof), bust
 *    (swing first, ask later).
 *
 * Gaps this prototype exposes (the point of building it) — see
 * docs/adventure-mode.md §"What the prototype is missing":
 *  1. No VERB COIN: the verb is baked into each hotspot's cursor, so two
 *     verbs on one object means two overlapping hotspots.
 *  2. No walk-off-screen exits or camera: a room is exactly one plate.
 *  3. No topic-list dialogue: conversations are linear beats + replies.
 *  4. No "use item on item" at the cursor — combining happens in the inventory
 *     (drag one onto another; drag onto an object to USE it there).
 *  5. No NPC schedules / walk cycles for anyone but the player.
 */

/** Ash's walk cycle — four frames, sliced from one flat-magenta plate. */
const ADV_WALK: SpriteSheet = {
  image: "/assets/sprites/adv-biker-walk.png",
  frameWidth: 126,
  frameHeight: 208,
  animations: {
    idle: { frames: [0] },
    walk: { frames: [0, 1, 2, 3], fps: 8 },
  },
  pixelated: true,
};

/** Shared walker settings, per-room floor and furniture. */
const walker = (floor: { top: number; bottom: number }, spawn: { x: number; y: number }, obstacles: { x: number; y: number; w: number; h: number }[] = []) => ({
  // 🎛 The VERB COIN: pick a verb, then click the object. USE arms an item.
  verbCoin: true,
  playerSheet: ADV_WALK,
  playerScale: 1,
  // Perspective: big up close, small walking away.
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
});

export const THROTTLE_ASH: Story = {
  id: "throttle-ash",
  title: "Throttle & Ash — The Long Way Down",
  tagline: "Somebody siphoned your tank and took the long way out of town.",
  coverImage: "/img/bg-av-roadside.jpg",
  // 🧭 The mode switch: this case is a POINT-AND-CLICK, not a noir rail.
  gameKind: "adventure",
  startSceneId: "adv_street",
  layout: {
    adv_street: { x: 40, y: 240 },
    adv_garage: { x: -340, y: 60 },
    adv_diner: { x: -340, y: 420 },
    adv_roadhouse: { x: 420, y: 60 },
    adv_road: { x: 420, y: 420 },
    adv_end_gold: { x: 860, y: 220 },
    adv_end_silver: { x: 860, y: 420 },
    adv_end_bust: { x: 420, y: 660 },
  },
  briefing: {
    objective:
      "Your tank was siphoned outside the Sleepy Wheel. Find out who did it, get the bike running, and decide whether you ride out with proof or with a story.",
    winConditions: [
      "Splice the fuel line, ride out, and leave Cutter holding the siphon receipt (gold).",
      "Splice the fuel line and ride before dawn, proof or not (silver).",
    ],
    loseConditions: ["Swing on Cutter before you have anything on him."],
  },
  // Cursor art: a pointing hand for the plain arrow and anything you pick up or
  // use, an eye for looking. Opt-in — no art, and the game keeps its system
  // cursors. (Swap in a sprite sheet per verb to animate them.)
  cursorArt: {
    default: { image: "/assets/ui/cursor-hand.png", size: 34 },
    look: { image: "/assets/ui/cursor-eye.png", size: 30 },
    take: { image: "/assets/ui/cursor-hand.png", size: 34 },
    use: { image: "/assets/ui/cursor-hand.png", size: 34 },
  },
  // How the inventory LOOKS — a pair of saddlebags with the loot inside.
  // Opt-in: every other case keeps the classic chip rail.
  inventoryDisplay: {
    mode: "container",
    label: "Saddlebags",
    image: "/assets/ui/inventory-case.png",
    anchor: "bottom-left",
    columns: 3,
    inset: 20,
    height: 220,
  },
  // Wrong-verb answers. The engine varies these, so a failed verb doesn't
  // read like a stuck record.
  verbResponses: {
    look: ["Nothing there you haven't already seen.", "You look. The desert keeps its secrets.", "Same as the first time you looked."],
    take: ["That's bolted to the county. It's not coming with you.", "You'd need a crowbar and a reason.", "Leave it. Somebody's counting on it being there."],
    talk: ["Talking to it won't help. Talking to yourself won't either.", "It doesn't answer. You feel better anyway.", "No conversation in it."],
    use: ["That does nothing. Not even a noise.", "Wrong thing, wrong tool, wrong hour of the morning.", "Nothing. Zip. Try it with something else."],
    go: ["That's not a way out — that's a wall somebody painted.", "You could go that way. You'd come right back with less money.", "No road there. Just rocks and a bad idea."],
  },
  flagNotes: {
    adv_know_drained: "The tank was drained and the fuel line cut — deliberate, not bad luck.",
    adv_heard_roadhouse: "The kid saw the Roadhouse boys in the lot last night.",
    adv_met_dell: "Dell will deal — but he wants to see you came prepared.",
    adv_has_line: "A fresh fuel line, coiled on Dell's bench.",
    adv_waitress_talked: "Nee remembers the Roadhouse boys: they paid in cash and left in a hurry.",
    adv_exposed: "Cutter's own siphon receipt — lot, pump, and his handwriting.",
    adv_jukebox: "The jukebox is playing. Nobody in the Roadhouse is looking at the door.",
    adv_bike_fixed: "Line spliced, tank filled. She'll turn over.",
  },
  characters: [
    { id: "narrator", name: "Narrator", role: "V.O.", avatarUrl: "emoji:🎙", trustMeter: 0 },
    {
      id: "adv_ash",
      name: "Ash",
      role: "Rider (you)",
      avatarUrl: "emoji:🏍",
      trustMeter: 0,
      voice: { pitch: 0.9, rate: 1 },
    },
    {
      id: "adv_kid",
      name: "Rudy",
      role: "Twelve, Knows Everything",
      avatarUrl: "emoji:🧒",
      trustMeter: 1,
      voice: { pitch: 1.5, rate: 1.15 },
    },
    {
      id: "adv_dell",
      name: "Dell",
      role: "Mechanic, Dell's Garage",
      avatarUrl: "emoji:🔧",
      trustMeter: 0,
      voice: { pitch: 0.85, rate: 0.95 },
    },
    {
      id: "adv_nee",
      name: "Nee",
      role: "Waitress, The Blue Plate",
      avatarUrl: "emoji:☕",
      trustMeter: 1,
      voice: { pitch: 1.05, rate: 1 },
    },
    {
      id: "adv_cutter",
      name: "Cutter",
      role: "Roadhouse Boys",
      avatarUrl: "emoji:🔪",
      trustMeter: -2,
      voice: { pitch: 0.7, rate: 0.9 },
    },
  ],
  items: [
    {
      id: "adv_wrench",
      name: "Bent Wrench",
      icon: "🔧",
      description: "Somebody's thrown it in the gutter. It's bent, but a bent wrench still turns.",
      flavorText: "The tool that fixes things, in a town that breaks them.",
      combinableWith: { targetItemId: "adv_fuel_line", resultItemId: "adv_repair_kit" },
    },
    {
      id: "adv_fuel_line",
      name: "Coiled Fuel Line",
      icon: "🧵",
      description: "Two feet of fresh rubber line off Dell's bench.",
      flavorText: "Rubber and patience. You have both, barely.",
    },
    {
      id: "adv_repair_kit",
      name: "Repair Kit",
      icon: "🧰",
      description: "The bent wrench and two feet of line. Enough to get her running — enough to leave.",
      flavorText: "Travelling light means your whole garage fits in a jacket pocket.",
      isClue: true,
    },
    {
      id: "adv_receipt",
      name: "Siphon Receipt",
      icon: "🧾",
      description: "A pump receipt from the county co-op: eleven gallons, cash, signed in a hand that spells Cutter with a K.",
      flavorText: "Twelve dollars of somebody else's petrol, in writing.",
      isClue: true,
    },
    {
      id: "adv_coffee",
      name: "Black Coffee",
      icon: "☕",
      description: "Nee pours it strong enough to stand a spoon in.",
      flavorText: "Not a weapon. A distraction, if you're clever.",
    },
    {
      id: "adv_keys",
      name: "Brass Keys",
      icon: "🔑",
      description: "Cutter's bike keys, lifted while the jukebox had the room.",
      flavorText: "A man who siphons tanks should really watch his pockets.",
      isClue: true,
    },
  ],
  scenes: [
    /* ─────────────────────────── 1 · MAIN STREET ─────────────────────── */
    {
      id: "adv_street",
      title: "Main Street, Cayuse Flats",
      background: "/img/bg-ls-main-street.jpg",
      ambientAudio: "drone",
      nodeType: "stage",
      prose: "",
      stage: {
        ...walker({ top: 66, bottom: 95 }, { x: 30, y: 90 }, [{ x: 29, y: 71, w: 46, h: 13 }]),
        enterCaption: "Cayuse Flats. Two hundred miles of nothing behind you — and a tank somebody else drained.",
      },
      cinematic: {
        foregroundExtras: [
          // The Roadhouse sign down the block, working on a failing tube.
          {
            image: "/assets/sprites/adv-roadhouse-sign.png",
            x: 84,
            y: 38,
            scale: 0.11,
            anchor: "50% 50%",
            anim: { preset: "flicker", speed: 1.1, intensity: 0.85 },
          },
          // The parked truck: a 🚧 no-go barrier (see stage.obstacles above)
          // AND the mask that hides the walker when they step behind it. The
          // cutout's own alpha does the hiding — no second asset.
          {
            image: "/assets/sprites/adv-truck.png",
            x: 52,
            y: 84,
            scale: 0.3,
            anchor: "50% 100%",
            occludes: true,
            occludeBaseline: 84,
          },
        ],
      },
      hotspots: [
        {
          id: "advh_bike",
          label: "the bike",
          bounds: { x: 6, y: 60, w: 22, h: 32 },
          cursor: "look",
          image: "/assets/sprites/adv-bike.png",
          acceptsItems: ["adv_coffee"],
          itemResponses: { adv_coffee: "Petrol goes in the tank. Coffee goes in you." },
          verbs: {
            take: { type: "showText", text: "Four hundred pounds of motorcycle. No." },
            talk: { type: "showText", text: "You've talked to bikes before. They never had much to say." },
          },
          action: {
            type: "showText",
            flagSet: "adv_know_drained",
            text: "Bone dry. And the line wasn't chewed — it was CUT, clean as a promise. Somebody wanted you walking.",
          },
        },
        {
          id: "advh_wrench",
          label: "the bent wrench",
          verbs: {
            look: { type: "showText", text: "A wrench somebody threw in the gutter. Bent, but a bent wrench still turns." },
          },
          bounds: { x: 66, y: 82, w: 10, h: 10 },
          cursor: "take",
          action: { type: "giveItem", itemGranted: "adv_wrench" },
        },
        {
          id: "advh_kid",
          label: "the kid on the step",
          verbs: {
            look: { type: "showText", text: "Twelve years old, sitting on a step at five in the morning, knowing everything." },
            take: { type: "showText", text: "You are not putting a child in your satchel." },
          },
          bounds: { x: 76, y: 58, w: 14, h: 34 },
          cursor: "talk",
          action: { type: "startDialogue", flagSet: "adv_heard_roadhouse" },
        },
        {
          id: "advh_garage",
          label: "Dell's Garage",
          verbs: {
            look: { type: "showText", text: "Dell's. Roll-up door, one light on, and a man who'll deal if you bring a tool." },
            talk: { type: "showText", text: "You're not shouting at a roll-up door at five in the morning." },
          },
          bounds: { x: 22, y: 56, w: 16, h: 38 },
          cursor: "go",
          action: { type: "goToScene", targetSceneId: "adv_garage" },
        },
        {
          id: "advh_diner",
          label: "The Blue Plate",
          verbs: {
            look: { type: "showText", text: "The Blue Plate. Pies under glass and coffee strong enough to stand a spoon in." },
            take: { type: "showText", text: "You can't steal a diner. You can steal a pie, and you won't." },
          },
          bounds: { x: 46, y: 58, w: 14, h: 36 },
          cursor: "go",
          action: { type: "goToScene", targetSceneId: "adv_diner" },
        },
        {
          id: "advh_roadhouse",
          label: "the Roadhouse",
          verbs: {
            look: { type: "showText", text: "Down the block. The sign buzzes like a wasp in a jar." },
            talk: { type: "showText", text: "Not from out here. Not to a door." },
          },
          bounds: { x: 88, y: 56, w: 12, h: 38 },
          cursor: "go",
          gating: { requiresFlags: ["adv_heard_roadhouse"] },
          action: { type: "goToScene", targetSceneId: "adv_roadhouse" },
        },
      ],
      dialogueBeats: [
        { id: "advb_k1", characterId: "adv_kid", expression: "knowing", text: "That your bike? 'Cause it wasn't your bike that left the lot last night." },
        { id: "advb_k2", characterId: "adv_ash", text: "Say that again, slowly." },
        {
          id: "advb_k3",
          characterId: "adv_kid",
          text: "Roadhouse boys. Three of 'em, and a Jerry can in the truck bed. They went down the block that way — you can hear the sign buzzing from here.",
        },
        { id: "advb_k4", characterId: "adv_ash", text: "Then I'll go and ask them politely." },
      ],
      choices: [],
    },

    /* ─────────────────────────── 2 · DELL'S GARAGE ───────────────────── */
    {
      id: "adv_garage",
      title: "Dell's Garage",
      background: "/img/bg-ls-bus-station.jpg",
      ambientAudio: "drone",
      nodeType: "stage",
      prose: "",
      stage: {
        ...walker({ top: 68, bottom: 95 }, { x: 50, y: 92 }, [{ x: 20, y: 70, w: 26, h: 12 }]),
        enterCaption: "Dell's. The only door in town that opens for a man with an empty tank.",
      },
      hotspots: [
        {
          id: "advh_dell",
          label: "Dell",
          verbs: {
            look: { type: "showText", text: "Dell. Grease in the creases of his hands and a coil of rubber line on the bench behind him." },
            take: { type: "showText", text: "You are not putting Dell in your satchel either." },
          },
          bounds: { x: 62, y: 56, w: 16, h: 38 },
          cursor: "talk",
          action: { type: "startDialogue", flagSet: "adv_met_dell" },
        },
        {
          id: "advh_bench",
          label: "the workbench",
          verbs: {
            talk: { type: "showText", text: "The bench has heard every excuse in the county. It isn't repeating them." },
          },
          bounds: { x: 8, y: 70, w: 22, h: 20 },
          cursor: "look",
          action: {
            type: "showText",
            text: "Every tool Dell owns, hung in its own shadow. Somebody's been at the rubber line — there's a fresh coil, still tied with the shop's twine.",
          },
        },
        {
          id: "advh_line",
          label: "the coil of fuel line",
          verbs: {
            look: { type: "showText", text: "Two feet of fresh rubber line, still tied with the shop's twine." },
          },
          bounds: { x: 8, y: 70, w: 14, h: 14 },
          cursor: "take",
          gating: { requiresFlags: ["adv_met_dell"], requiresItems: ["adv_wrench"] },
          action: { type: "giveItem", itemGranted: "adv_fuel_line", flagSet: "adv_has_line" },
        },
        {
          id: "advh_street2",
          label: "Back out to Main Street",
          bounds: { x: 40, y: 60, w: 14, h: 34 },
          cursor: "go",
          action: { type: "goToScene", targetSceneId: "adv_street" },
        },
      ],
      dialogueBeats: [
        { id: "advb_d1", characterId: "adv_dell", expression: "level", text: "Line's cut, tank's dry, and you're standing in my shop without a tool in your hand. Find the wrench in the gutter out front and I'll deal with you." },
        { id: "advb_d2", characterId: "adv_ash", text: "Since when does a man need a wrench to buy two feet of rubber?" },
        {
          id: "advb_d3",
          characterId: "adv_dell",
          text: "Since a man who can't be bothered to pick up a wrench can't be bothered to splice a line at the side of a road in the dark. Coil's on the bench. Bring the wrench next time.",
        },
      ],
      choices: [],
    },

    /* ─────────────────────────── 3 · THE BLUE PLATE ──────────────────── */
    {
      id: "adv_diner",
      title: "The Blue Plate",
      background: "/img/bg-ls-diner.jpg",
      ambientAudio: "jazz",
      nodeType: "stage",
      prose: "",
      stage: {
        ...walker({ top: 68, bottom: 94 }, { x: 50, y: 90 }, [{ x: 10, y: 70, w: 34, h: 10 }]),
        enterCaption: "The Blue Plate. Coffee at four in the morning tastes the same in every town.",
      },
      hotspots: [
        {
          id: "advh_nee",
          label: "Nee",
          verbs: {
            look: { type: "showText", text: "Nee. Apron, pencil behind the ear, and the only good memory in Cayuse Flats." },
          },
          bounds: { x: 52, y: 54, w: 16, h: 40 },
          cursor: "talk",
          action: { type: "startDialogue" },
        },
        {
          id: "advh_coffee",
          label: "the coffee",
          verbs: {
            look: { type: "showText", text: "Black, thick, and hot enough to hurt on the way down." },
          },
          bounds: { x: 14, y: 62, w: 12, h: 10 },
          cursor: "take",
          action: { type: "giveItem", itemGranted: "adv_coffee" },
        },
        {
          id: "advh_pie",
          label: "the pie case",
          verbs: {
            take: { type: "showText", text: "Cherry. Tempting. Nee keeps the good stuff under the counter — ask, don't steal." },
          },
          bounds: { x: 76, y: 66, w: 18, h: 16 },
          cursor: "look",
          action: {
            type: "showText",
            text: "Cherry, and a fly asleep on the glass. Nee keeps the good stuff under the counter for people who ask nicely.",
          },
        },
        {
          id: "advh_receipt",
          label: "Take the receipt Nee slides across",
          bounds: { x: 52, y: 78, w: 12, h: 8 },
          cursor: "take",
          gating: { requiresFlags: ["adv_waitress_talked"] },
          action: { type: "giveItem", itemGranted: "adv_receipt" },
        },
        {
          id: "advh_street3",
          label: "Back out to Main Street",
          bounds: { x: 40, y: 58, w: 12, h: 36 },
          cursor: "go",
          action: { type: "goToScene", targetSceneId: "adv_street" },
        },
      ],
      dialogueBeats: [
        { id: "advb_n1", characterId: "adv_nee", expression: "warm", text: "Coffee? Sit anywhere. Nobody's throwing you out at this hour but me, and I like your face." },
        { id: "advb_n2", characterId: "adv_ash", text: "Three men came through last night. Roadhouse colours." },
        {
          id: "advb_n3",
          characterId: "adv_nee",
          conditionRule: { requiresFlags: ["adv_heard_roadhouse"] },
          text: "Cutter's boys. Paid cash, left in a hurry, and one of them argued about eleven gallons like eleven gallons was a person. He signed the slip. I keep slips.",
        },
        { id: "advb_n4", characterId: "adv_ash", text: "Nee, you are the only good thing in this county." },
      ],
      choices: [
        {
          id: "advc_ask_nee",
          text: "Ask who was in last night",
          reply: true,
          attitudeTag: "Clever",
          gating: { requiresFlags: ["adv_heard_roadhouse"] },
          consequences: { setFlags: ["adv_waitress_talked"], trustChanges: [{ characterId: "adv_nee", delta: 1 }] },
          rememberLine: "Nee will remember you asked before you swung.",
        },
      ],
    },

    /* ─────────────────────────── 4 · THE ROADHOUSE ───────────────────── */
    {
      id: "adv_roadhouse",
      title: "The Roadhouse",
      background: "/img/bg-club.jpg",
      ambientAudio: "jazz",
      nodeType: "stage",
      prose: "",
      letterbox: true,
      stage: {
        ...walker({ top: 66, bottom: 94 }, { x: 18, y: 90 }, [{ x: 28, y: 72, w: 36, h: 10 }]),
        enterCaption: "The Roadhouse. The sign outside buzzes; inside, three men and a jukebox pretend you haven't come in.",
      },
      hotspots: [
        {
          id: "advh_cutter",
          label: "Cutter",
          verbs: {
            look: { type: "showText", text: "Cutter. Roadhouse colours, a smile like a dropped tool, and three friends you can't see all at once." },
            take: { type: "showText", text: "Not yet. Not here, not three to one." },
          },
          bounds: { x: 66, y: 54, w: 16, h: 40 },
          cursor: "talk",
          action: { type: "startDialogue" },
        },
        {
          id: "advh_jukebox",
          label: "the jukebox",
          bounds: { x: 6, y: 62, w: 16, h: 28 },
          cursor: "use",
          gating: { requiresItems: ["adv_coffee"] },
          // The USE verb: armed with the coffee this works; anything else
          // gets the story's wrong-item line.
          acceptsItems: ["adv_coffee"],
          itemResponses: {
            adv_coffee: "You pour the coffee into the works. The jukebox clears its throat, tries a waltz, and settles into something loud. Every head in the room turns to look at it.",
          },
          verbs: {
            look: { type: "showText", text: "A Wurlitzer with a crack across the glass. It plays whether you paid or not." },
            take: { type: "showText", text: "It's bolted to the floor, and it weighs as much as the county." },
            talk: { type: "showText", text: "You've talked to jukeboxes before. They only ever played along." },
          },
          action: {
            type: "useItem",
            itemConsumed: "adv_coffee",
            flagSet: "adv_jukebox",
            text: "You pour the coffee into the works. The jukebox clears its throat, tries a waltz, and settles into something loud. Every head in the room turns to look at it.",
          },
        },
        {
          id: "advh_keys",
          label: "Lift Cutter's keys",
          bounds: { x: 66, y: 80, w: 10, h: 8 },
          cursor: "take",
          gating: { requiresFlags: ["adv_jukebox"] },
          action: { type: "giveItem", itemGranted: "adv_keys" },
        },
        {
          id: "advh_neon",
          label: "Look at the neon",
          bounds: { x: 40, y: 30, w: 20, h: 20 },
          cursor: "look",
          action: {
            type: "showText",
            text: "ROADHOUSE, in a tube that's been dying since Eisenhower. It buzzes like it knows something.",
          },
        },
        {
          id: "advh_road",
          label: "Walk out to the edge of town",
          bounds: { x: 88, y: 56, w: 12, h: 38 },
          cursor: "go",
          action: { type: "goToScene", targetSceneId: "adv_road" },
        },
        {
          id: "advh_street4",
          label: "Back to Main Street",
          bounds: { x: 20, y: 58, w: 12, h: 36 },
          cursor: "go",
          action: { type: "goToScene", targetSceneId: "adv_street" },
        },
      ],
      dialogueBeats: [
        { id: "advb_c1", characterId: "adv_cutter", expression: "amused", text: "Well. The man with the dry tank. You walked a long way to hear me say it wasn't me." },
        { id: "advb_c2", characterId: "adv_ash", text: "I walked a long way to hear you say it at all." },
        {
          id: "advb_c3",
          characterId: "adv_cutter",
          text: "Then hear this: petrol's eleven gallons of nobody's business, and you've got no proof of anything but a long walk.",
        },
        {
          id: "advb_c4",
          characterId: "adv_cutter",
          expression: "flat",
          conditionRule: { requiresFlags: ["adv_exposed"] },
          text: "…Where'd you get that. That's a co-op slip. That's — that's my hand, but that's not proof of anything, that's a receipt.",
        },
        {
          id: "advb_c5",
          characterId: "adv_ash",
          conditionRule: { requiresFlags: ["adv_exposed"] },
          text: "Eleven gallons, cash, lot four, last night, in your spelling. It's proof enough for the county, and it's proof enough for me.",
        },
      ],
      choices: [
        {
          id: "advc_present_receipt",
          text: "Lay the siphon receipt on the bar",
          reply: true,
          presentItem: "adv_receipt",
          attitudeTag: "Clever",
          consequences: { setFlags: ["adv_exposed"], trustChanges: [{ characterId: "adv_nee", delta: 1 }], meterChanges: [{ meter: "Clever", delta: 1 }] },
          rememberLine: "Cutter will remember the receipt.",
        },
        {
          id: "advc_swing",
          text: "Swing on him",
          targetSceneId: "adv_end_bust",
          attitudeTag: "Aggressive",
          consequences: { meterChanges: [{ meter: "Aggressive", delta: 2 }] },
          rememberLine: "Cutter will remember that.",
        },
      ],
    },

    /* ─────────────────────────── 5 · THE EDGE OF TOWN ────────────────── */
    {
      id: "adv_road",
      title: "The Long Way Down",
      background: "/img/bg-av-roadside.jpg",
      ambientAudio: "drone",
      nodeType: "stage",
      prose: "",
      letterbox: true,
      stage: {
        ...walker({ top: 70, bottom: 96 }, { x: 28, y: 92 }, [{ x: 52, y: 74, w: 14, h: 8 }]),
        enterCaption: "The last lit mile out of Cayuse Flats. Somebody put your bike here to watch you walk to it.",
      },
      hotspots: [
        {
          id: "advh_fix_bike",
          label: "the bike",
          bounds: { x: 10, y: 62, w: 26, h: 32 },
          cursor: "use",
          image: "/assets/sprites/adv-bike.png",
          gating: { requiresItems: ["adv_repair_kit"] },
          // USE + the repair kit splices the line. Anything else is refused.
          acceptsItems: ["adv_repair_kit"],
          itemResponses: {
            adv_repair_kit: "Two feet of rubber, one bent wrench, and the taste of petrol on your knuckles. She turns over on the third kick — and she idles like nothing happened. That's the thing about bikes. They forgive you. Towns don't.",
          },
          verbs: {
            look: { type: "showText", text: "Cut line, dry tank, two hundred miles from anywhere. She deserves better than the last twelve hours." },
            talk: { type: "showText", text: "You tell her to start. She does not start." },
          },
          action: {
            type: "useItem",
            itemConsumed: "adv_repair_kit",
            flagSet: "adv_bike_fixed",
            text: "Two feet of rubber, one bent wrench, and the taste of petrol on your knuckles. She turns over on the third kick — and she idles like nothing happened. That's the thing about bikes. They forgive you. Towns don't.",
          },
        },
        {
          id: "advh_ride_gold",
          label: "Ride out — and leave the receipt with Nee for the county",
          bounds: { x: 70, y: 56, w: 26, h: 40 },
          cursor: "go",
          gating: { requiresFlags: ["adv_bike_fixed", "adv_exposed"] },
          action: { type: "goToScene", targetSceneId: "adv_end_gold" },
        },
        {
          id: "advh_ride_silver",
          label: "Ride out before dawn",
          bounds: { x: 70, y: 56, w: 26, h: 40 },
          cursor: "go",
          gating: { requiresFlags: ["adv_bike_fixed"], excludesFlags: ["adv_exposed"] },
          action: { type: "goToScene", targetSceneId: "adv_end_silver" },
        },
        {
          id: "advh_back_town",
          label: "Walk back into town",
          bounds: { x: 40, y: 60, w: 14, h: 36 },
          cursor: "go",
          action: { type: "goToScene", targetSceneId: "adv_street" },
        },
      ],
      dialogueBeats: [],
      choices: [],
    },

    /* ─────────────────────────── ENDINGS ─────────────────────────────── */
    {
      id: "adv_end_gold",
      title: "Eleven Gallons, In Writing",
      isEnding: true,
      background: "/img/bg-av-roadside.jpg",
      prose:
        "You ride east with the sun coming up behind you and the co-op slip folded into your jacket. Nee will hand it to the county clerk by nine. Cutter will be explaining eleven gallons to a man with a badge by ten. Somewhere behind you a dying tube buzzes the word ROADHOUSE at an empty street.",
      endingData: {
        tier: "victory-gold",
        headline: "RIDER RIDES — COUNTY HOLDING A RECEIPT",
        recap: "You got the bike running and left town with the proof in your pocket. That's not revenge. That's paperwork.",
      },
      hotspots: [],
      dialogueBeats: [],
      choices: [],
    },
    {
      id: "adv_end_silver",
      title: "Gone Before Dawn",
      isEnding: true,
      background: "/img/bg-av-roadside.jpg",
      prose:
        "You ride east with the sun coming up behind you and nothing in your jacket but a bent wrench. Cutter will laugh about it for a year. You'll be three counties gone by then, and towns like Cayuse Flats keep no records of who left in a hurry.",
      endingData: {
        tier: "victory-silver",
        headline: "RIDER RIDES — NO PROOF, NO PAPER",
        recap: "You got the bike running and got out. The receipt stayed in Nee's apron, and Cutter stayed in the Roadhouse.",
      },
      hotspots: [],
      dialogueBeats: [],
      choices: [],
    },
    {
      id: "adv_end_bust",
      title: "Three of Them",
      isEnding: true,
      background: "/img/bg-club.jpg",
      prose:
        "You swing. He isn't there — he's never there, he sends the room. The jukebox keeps playing something loud and cheerful while three men explain the difference between a receipt and a right hook, and your bike sits two hundred yards away with a cut line and a dry tank.",
      endingData: {
        tier: "gameover",
        headline: "RIDER WALKS HOME — BIKE STILL DRY",
        recap: "You had eleven gallons of evidence in your pocket and led with your fist instead.",
      },
      hotspots: [],
      dialogueBeats: [],
      choices: [],
    },
  ],
};
