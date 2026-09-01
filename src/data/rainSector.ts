import type { StageObstacle, Story } from "../types";
import type { SpriteSheet } from "../game/spriteSheet";

/**
 * RAIN SECTOR — THE KAEL FILE
 *
 * A neo-noir synthetic-hunter case built the way a creator builds it in the
 * Studio today, deliberately exercising EVERY layer the engine grew in the
 * 2025 adventure push, so the friction shows up here instead of in a
 * creator's draft:
 *
 *  · 🚶 Two STAGE rooms (a neon street and a back alley) with a real sprite
 *    sheet sliced by `scripts/make-sprite-sheet.mjs` from a magenta plate.
 *  · 🎛 Verb coin + 💬 SENTENCE LINE + 👢 extended verbs (you KICK a jammed
 *    vending machine to shake a key card loose — the noir lock-and-key).
 *  · 🔁 MULTI-STATE object: the dead-drop locker re-skins from locked to
 *    hanging-open to taken.
 *  · 🚪 DOOR: the alley's stair gate is a gate-aware BARRIER — it is a wall
 *    until Old Ping tells you who bolted it (flag-gated, spatial).
 *  · 🧹 INTERACTABLE NPC: Old Ping patrols his counter; click HIM (or press
 *    N) and the walker chases his live position to start the conversation.
 *    The umbrella woman is ambient set dressing on the same plate.
 *  · 👁 REMOTE look: the billboard across the street answers from range.
 *  · ➡ Walk-off-screen edge exit + entry spawns (alley ⇄ street).
 *  · 🎯 The K-Wesson empathy test is a PRESS-THE-LIE beat — a photograph
 *    breaks her claim; two wrong presents and she's gone in the rain.
 *  · Three endings: gold (let her run), silver (retire the unit), gameover.
 */

/** Mara's walk cycle — four frames sliced from the magenta plate
 *  (plates/rs-mara-walk.png → public/assets/sprites/rs-mara-walk.png). */
const RS_WALK: SpriteSheet = {
  image: "/assets/sprites/rs-mara-walk.png",
  frameWidth: 109,
  frameHeight: 208,
  animations: {
    idle: { frames: [0] },
    walk: { frames: [0, 1, 2, 3], fps: 8 },
  },
  pixelated: true,
};

const walker = (
  floor: { top: number; bottom: number },
  spawn: { x: number; y: number },
  obstacles: StageObstacle[] = [],
  extra: Record<string, unknown> = {}
) => ({
  verbCoin: true,
  sentenceLine: true,
  playerImage: "emoji:🕵️", // fallback if the sheet ever fails to load
  playerSheet: RS_WALK,
  playerScale: 1,
  playerNearScale: 1.15,
  playerFarScale: 0.62,
  keyboard: true,
  speed: 16,
  reach: 4,
  depthScale: 0.3,
  hints: "proximity" as const,
  floor,
  spawn,
  ...(obstacles.length ? { obstacles } : {}),
  ...extra,
});

export const RAIN_SECTOR: Story = {
  id: "rain-sector",
  title: "Rain Sector — The Kael File",
  tagline: "A synthetic killed her handler. The rain says otherwise. Administer the test.",
  coverImage: "/img/rs-cover.jpg",
  gameKind: "adventure",
  startSceneId: "rs_brief",
  layout: {
    rs_brief: { x: -320, y: 240 },
    rs_street: { x: 40, y: 240 },
    rs_alley: { x: 400, y: 80 },
    rs_room: { x: 400, y: 420 },
    rs_end_free: { x: 840, y: 300 },
    rs_end_retire: { x: 840, y: 100 },
    rs_end_lost: { x: 840, y: 520 },
  },
  briefing: {
    objective:
      "A VEIL-6 synthetic (Iris Kael) killed her handler at the Echelon annex and ran into the Rain Sector. Find her, administer the K-Wesson empathy test, and decide what the department gets back: a confirmation, or a body.",
    winConditions: [
      "Break her claim with the loading-dock photograph, then decide her fate (gold: let her run).",
      "Retire the unit after a confirmed test (silver — clean paperwork, dirty rain).",
    ],
    loseConditions: ["Present the wrong evidence twice: she's gone in the rain, and so is your case."],
  },
  verbResponses: {
    look: [
      "Rain, neon, and somebody's laundry. The city keeps its own ledger.",
      "You've been staring at this block for eleven years. It stares back.",
      "Nothing new. The rain files everything under the same grey folder.",
    ],
    take: [
      "Half this block is welded shut. The other half is watching you.",
      "That belongs to somebody who counts knives the way you count rounds.",
      "You have pockets, not a warehouse.",
    ],
    talk: [
      "It doesn't answer. Down here, that's a personality.",
      "The rain talks enough for both of you.",
      "Nobody on this block talks to a badge for free.",
    ],
    use: [
      "You could, but the machine would only laugh at you in three languages.",
      "Wrong tool. This city runs on key cards and grudges.",
      "It doesn't take kindly to that.",
    ],
    kick: [
      "The block has been kicked before. It holds grudges.",
      "Steel toe, meet civic infrastructure. Infrastructure wins.",
    ],
    punch: ["Save it for somebody breathing."],
  },
  characters: [
    { id: "rs_narrator", name: "Sector Radio", role: "V.O.", avatarUrl: "emoji:📻", trustMeter: 0 },
    {
      id: "rs_mara",
      name: "Mara Vane",
      role: "Retirement Division (you)",
      avatarUrl: "/assets/faces/rs-mara.png",
      trustMeter: 0,
      voice: { pitch: 0.85, rate: 0.98 },
    },
    {
      id: "rs_iris",
      name: "Iris Kael",
      role: "VEIL-6, medical adjunct",
      avatarUrl: "/assets/faces/rs-iris.png",
      trustMeter: 0,
      voice: { pitch: 1.2, rate: 0.95 },
    },
    {
      id: "rs_captain",
      name: "Captain Ostrander",
      role: "Captain, Retirement Division",
      avatarUrl: "/assets/faces/rs-captain.png",
      trustMeter: 1,
      voice: { pitch: 0.7, rate: 0.92 },
    },
    {
      id: "rs_ping",
      name: "Old Ping",
      role: "Noodle bar, Kowloon Lane",
      avatarUrl: "/assets/faces/rs-ping.png",
      trustMeter: 2,
      voice: { pitch: 1.05, rate: 1.05 },
    },
  ],
  items: [
    {
      id: "rs_keycard",
      name: "Magnetic Key Card",
      icon: "🎫",
      description: "Echelon annex issue, scuffed grey. The vending machine had opinions about giving it up.",
      flavorText: "Doors on this block answer to grey plastic, not badges.",
    },
    {
      id: "rs_photo",
      name: "Loading-Dock Photograph",
      icon: "🖼️",
      description:
        "Rain-spotted still: Iris Kael and her handler at the Echelon annex loading dock. Time code 02:14 — four hours AFTER her scheduled review.",
      flavorText: "The camera doesn't blink. Everybody else on this case did.",
      isClue: true,
    },
    {
      id: "rs_tin",
      name: "Warped Cigarette Tin",
      icon: "🚬",
      description: "Rain-warped tin, half a cigarette left. Smells like the alley's whole biography.",
      flavorText: "Evidence of somebody's bad night. Not evidence of anything.",
    },
  ],
  scenes: [
    /* ─────────────────────────── 0 · THE BRIEFING ─────────────────── */
    {
      id: "rs_brief",
      title: "The Kael File",
      background: "/img/rs-brief.jpg",
      ambientAudio: "rain",
      prose:
        "Captain Ostrander's office, ninety floors over the rain. The file on his desk is thin the way files are thin when a corporation wants a thing done quietly. IRIS KAEL. VEIL-6 medical adjunct. Alleged: the retirement of her handler on the annex's loading level. He slides it across with two fingers, like it might bite.",
      dialogueBeats: [
        { id: "rsb_1", characterId: "rs_captain", text: "Echelon flagged the unit rogue at 03:00. Handler's name doesn't matter — what matters is the annex wants this off the books by Friday. She was sighted in the Rain Sector. Kowloon Lane." },
        { id: "rsb_2", characterId: "rs_captain", text: "Administer the K-Wesson. Confirm the unit. Retire it. That's the whole job, Vane. Don't make it a philosophy seminar." },
        { id: "rsb_3", characterId: "rs_mara", text: "And if the test says she's not rogue?" },
        { id: "rsb_4", characterId: "rs_captain", text: "The test says whatever the paper says when you file it. Bring me a paper." },
      ],
      choices: [
        {
          id: "rsc_book",
          text: "\"By the book. Test first, gun after.\"",
          targetSceneId: "rs_street",
          attitudeTag: "Clever",
          consequences: { setFlags: ["rs_bybook"] },
        },
        {
          id: "rsc_cold",
          text: "\"A skinjob is a skinjob. I'll end it tonight.\"",
          targetSceneId: "rs_street",
          attitudeTag: "Aggressive",
          consequences: { setFlags: ["rs_cold"] },
        },
        {
          id: "rsc_curious",
          text: "\"Why does Echelon want this one back so quietly?\"",
          targetSceneId: "rs_street",
          attitudeTag: "Sultry",
          consequences: { setFlags: ["rs_curious"] },
        },
      ],
      hotspots: [],
    },

    /* ─────────────────────────── 1 · KOWLOON LANE ─────────────────── */
    {
      id: "rs_street",
      title: "Kowloon Lane",
      background: "/img/rs-street.jpg",
      ambientAudio: "rain",
      nodeType: "stage",
      prose: "",
      stage: {
        ...walker(
          { top: 62, bottom: 94 },
          { x: 46, y: 90 },
          [{ x: 6, y: 70, w: 26, h: 13 }] // Ping's steamer counter
        ),
        // 👢 extended verbs: the vending machine puzzle needs a KICK.
        extendedVerbs: true,
        // 🧹 NPCs — Old Ping is INTERACTABLE (click HIM or press N to talk);
        // the umbrella woman is ambient set dressing that paces the block.
        npcs: [
          {
            id: "rs_npc_ping",
            image: "emoji:🧑‍🍳",
            x: 14,
            y: 88,
            speed: 12,
            patrol: [
              { x: 22, y: 88, pause: 2.5 },
              { x: 12, y: 88, pause: 2.5 },
            ],
            talkHotspotId: "rsh_ping",
          },
          {
            id: "rs_npc_umbrella",
            image: "emoji:🌂",
            x: 62,
            y: 78,
            speed: 9,
            patrol: [
              { x: 78, y: 78, pause: 1.5 },
              { x: 58, y: 84, pause: 1.5 },
            ],
          },
        ],
        entrySpawns: {
          rs_alley: { x: 88, y: 90 },
        },
        enterCaption:
          "Kowloon Lane. Rain like static on a dead channel. Steam off Ping's woks, neon off everything else. Somewhere above the billboards, a spinner's searchlight drags the sky.",
      },
      hotspots: [
        {
          // INTERACTABLE NPC talker — the diamond hides; Ping IS the marker.
          id: "rsh_ping",
          label: "Old Ping",
          bounds: { x: 10, y: 58, w: 12, h: 28 },
          cursor: "talk",
          isRepeatable: true,
          action: { type: "startDialogue" },
        },
        {
          // MULTI-STATE, the noir lock-and-key: the machine is NEVER gated
          // (an object-level gate would lock out the very verbs that open
          // it — verbs resolve before gates). Ungated, it answers 👁 look
          // and 👢 kick; the kick's flag re-skins the same marker into the
          // tray with the card in it, and the take consumes it.
          id: "rsh_vend",
          label: "the jammed vending machine",
          bounds: { x: 30, y: 64, w: 12, h: 26 },
          cursor: "look",
          verbs: {
            look: { type: "showText", text: "VEND-LOOK: a wall of grey machines. One wears a OUT OF ORDER sign and a dent the shape of somebody's frustration." },
            kick: {
              type: "showText",
              text: "BOOT-CLANG. The machine shudders, thinks about it, and spits a scuffed magnetic key card into the tray.",
              flagSet: "rs_key_dropped",
            },
          },
          action: {
            type: "showText",
            text: "VEND-JAMMED: the machine hums, gulps, and returns exactly nothing. The OUT OF ORDER sign has been there longer than your badge.",
          },
          states: [
            {
              id: "st_vend_tray",
              when: { requiresFlags: ["rs_key_dropped"] },
              label: "the key card in the tray",
              cursor: "take",
              action: { type: "giveItem", itemGranted: "rs_keycard" },
            },
          ],
        },
        {
          id: "rsh_billboard",
          label: "the geisha billboard",
          bounds: { x: 70, y: 6, w: 26, h: 26 },
          cursor: "look",
          remote: true,
          isRepeatable: true,
          verbs: {
            look: {
              type: "showText",
              text: "BILLBOARD: forty feet of a smiling hologram woman selling migration to the off-world colonies. She's been smiling since before you made detective. Up here, nobody blinks — you checked once.",
            },
          },
          action: { type: "showText", text: "BILLBOARD: forty feet of a smiling hologram woman selling the off-world colonies. She never blinks." },
        },
        {
          id: "rsh_gate",
          label: "the alley gate",
          bounds: { x: 88, y: 62, w: 10, h: 30 },
          cursor: "go",
          isRepeatable: true,
          gating: { requiresItems: ["rs_keycard"] },
          customFailMessage: "GATE: mag-locked, chain backed. It wants a key card you don't have.",
          action: {
            type: "useItem",
            targetSceneId: "rs_alley",
            text: "The key card slaps the reader. Somewhere in the chain-link, a magnetic latch lets go with a sound like a knuckle cracking.",
          },
        },
      ],
      dialogueBeats: [
        { id: "rss_p1", characterId: "rs_ping", text: "Detective Vane! You only come down Kowloon Lane when somebody's lost or somebody's found. Which one tonight?" },
        { id: "rss_p2", characterId: "rs_mara", text: "A woman. Young, dark bob, good coat. Runs like she's being timed." },
        { id: "rss_p3", characterId: "rs_ping", text: "Hah! Half the lane runs like that. But — yes. She ate here. Two bowls, no conversation, paid in Echelon scrip. Then she went up the back stairs behind the alley gate, and Ping bolted the gate behind her, because that is what one does for a paying customer." },
        {
          id: "rss_p4",
          characterId: "rs_ping",
          conditionRule: { requiresFlags: ["rs_curious"] },
          text: "You want to know why Echelon wants her quiet? Ping only cooks noodles. But the man who came asking BEFORE you wore city shoes and corporate patience. Draw your own soup, detective.",
        },
      ],
      choices: [
        {
          id: "rsc_ping_thanks",
          text: "\"Bolted the gate. Kind of you. Leave it bolted for me.\"",
          reply: true,
          attitudeTag: "Sultry",
          consequences: { setFlags: ["rs_ping_told"] },
        },
        {
          id: "rsc_ping_bye",
          text: "\"Appreciate the noodles, Ping.\" (step back into the rain)",
          reply: true,
          attitudeTag: "Neutral",
        },
      ],
    },

    /* ─────────────────────────── 2 · BEHIND THE LANE ──────────────── */
    {
      id: "rs_alley",
      title: "Behind Kowloon Lane",
      background: "/img/rs-alley.jpg",
      ambientAudio: "rain",
      nodeType: "stage",
      prose: "",
      stage: {
        ...walker(
          { top: 60, bottom: 94 },
          { x: 10, y: 90 },
          [
            { x: 26, y: 68, w: 16, h: 10 }, // the crates
            // 🚪 THE DOOR: a gate-aware barrier. Until Old Ping tells you
            // he bolted it AND you ask him to unbolt it (rs_ping_told),
            // the stair gate is a WALL the router refuses.
            { x: 72, y: 56, w: 8, h: 40, gating: { requiresFlags: ["rs_ping_told"] } },
          ],
          {
            exitEdges: {
              left: { targetSceneId: "rs_street", label: "back to Kowloon Lane" },
            },
            entrySpawns: {
              rs_street: { x: 8, y: 90 },
            },
          }
        ),
        enterCaption:
          "Behind the lane. Steam off the vents, rust off the lockers, rain off everything. The stair gate stands in its chain-link like a verdict.",
      },
      hotspots: [
        {
          id: "rsh_reader",
          label: "the scraped keyhole",
          bounds: { x: 24, y: 46, w: 10, h: 20 },
          cursor: "use",
          gating: { requiresItems: ["rs_keycard"] },
          customFailMessage: "READER: grey doors, mag-locked. The keyhole is scraped shiny — somebody was here recently — but it wants a key card.",
          action: {
            type: "showText",
            text: "MAG-CLICK. The key card wakes the reader; locker 9 yawns open like it has been waiting all night to be asked.",
            flagSet: "rs_locker_open",
          },
          verbs: {
            look: { type: "showText", text: "READER-LOOK: ranks of grey dead-drop doors. One keyhole is scraped shiny around its edge. Fresh." },
          },
        },
        {
          // MULTI-STATE — the same marker, three faces: locked (base, gate
          // shut), hanging-open (flag set: gate cleared, new label/action),
          // and consumed once the photograph is genuinely taken.
          id: "rsh_lockers",
          label: "the dead-drop lockers",
          bounds: { x: 12, y: 42, w: 12, h: 26 },
          cursor: "take",
          gating: { requiresFlags: ["rs_locker_open"] },
          customFailMessage: "LOCKERS: mag-locked ranks of grey. Whatever locker 9 is holding, it isn't holding it for you. Yet.",
          action: { type: "showText", text: "LOCKERS: mag-locked ranks of grey. Whatever locker 9 is holding, it isn't holding it for you. Yet." },
          states: [
            {
              id: "st_locker_open",
              when: { requiresFlags: ["rs_locker_open"] },
              gating: null, // the opened locker is no longer locked
              label: "the hanging-open locker 9",
              action: { type: "giveItem", itemGranted: "rs_photo" },
            },
          ],
        },
        {
          id: "rsh_tin",
          label: "a warped cigarette tin",
          bounds: { x: 40, y: 76, w: 10, h: 16 },
          cursor: "take",
          showItemImage: true,
          action: { type: "giveItem", itemGranted: "rs_tin" },
        },
        {
          id: "rsh_stairs",
          label: "the stair gate",
          bounds: { x: 78, y: 58, w: 10, h: 32 },
          cursor: "go",
          isRepeatable: true,
          gating: { requiresFlags: ["rs_ping_told"] },
          customFailMessage: "STAIRS: chained and bolted. Ping keeps the bolt — and Ping doesn't unbolt it for strangers.",
          action: { type: "goToScene", targetSceneId: "rs_room" },
        },
      ],
      dialogueBeats: [],
      choices: [],
    },

    /* ─────────────────────── 3 · THE K-WESSON TEST ────────────────── */
    {
      id: "rs_room",
      title: "The K-Wesson Test",
      background: "/img/rs-room.jpg",
      ambientAudio: "tension",
      prose:
        "Top of the stairs, a back room over the noodle steam: two chairs, one cone of white light, a window doing its best to hold the neon out. Iris Kael sits like the word 'composed' was assigned to her at manufacture. You set the K-Wesson between you. Its paper strip waits to draw the shape of her answers.",
      dialogueBeats: [
        {
          id: "rsr_1",
          characterId: "rs_iris",
          text: "You're the third badge this month. The first two read me my rights and left when the rain got heavy. Go on, detective. Ask your questions. I have nowhere to be and all the patience in the sector.",
        },
        {
          id: "rsr_2",
          characterId: "rs_mara",
          conditionRule: { requiresFlags: ["rs_cold"] },
          text: "\"Let's skip the part where you cry.\" You thumb the magazine release and set the pistol on the table, muzzle toward the window. The K-Wesson stays in the case.",
        },
        {
          id: "rsr_3",
          characterId: "rs_mara",
          conditionRule: { requiresFlags: ["rs_bybook"] },
          text: "You leave the iron where it sleeps and cue the first calibration slide. \"Standard empathy battery. A tortoise flips on its back in the desert sun. You watch it. What do you feel?\"",
        },
        {
          id: "rsr_claim",
          characterId: "rs_iris",
          expression: "level",
          text: "You want the annex? I have never had an unscheduled contact with my handler. Reviews were monthly, in the open court, minutes kept. There is no photograph of me anywhere near that loading dock, because I was never anywhere near that loading dock. Check the logs. The logs don't blink.",
          lie: {
            claim: "Iris says she never had unscheduled contact with her handler and was never near the loading dock.",
            evidenceItemIds: ["rs_photo"],
            contradictedFlag: "rs_caught",
            caughtBeat: {
              id: "rsr_caught",
              characterId: "rs_iris",
              conditionRule: { requiresFlags: ["rs_caught"] },
              text: "The photograph lands in the light. Her, the handler, the dock, 02:14 in the corner — four hours after the court adjourned. The paper strip on the K-Wesson draws one long flat line, and Iris Kael, VEIL-6, medical adjunct, does the one thing the manual says she can't. She smiles like it hurts. \"…He called it a kindness meeting. Their logs blink, detective. I just learned where.\"",
            },
            wrongBeat: {
              id: "rsr_wrong",
              characterId: "rs_iris",
              text: "She glances at the tin and something in the room drops ten degrees. \"Somebody's cigarettes. You dragged a woman's hiding place over the city for somebody's cigarettes? The strip is flat, detective. Your machine says I'm telling the truth, and your machine is the only witness Echelon will pay for. Present evidence or present apologies.\"",
            },
            wrongEvidenceLimit: 2,
            contradictedConsequences: {
              trustChanges: [{ characterId: "rs_iris", delta: 2 }],
              meterChanges: [{ meter: "Clever", delta: 1 }],
            },
            wrongConsequences: {
              trustChanges: [{ characterId: "rs_iris", delta: -1 }],
              meterChanges: [{ meter: "Suspicion", delta: 1 }],
            },
            rememberLine: "Iris Kael knows you caught the loading dock in her story.",
          },
        },
      ],
      choices: [
        {
          id: "rsc_free",
          text: "\"Test came back flat. Nothing up here but noodles.\" — log it unconfirmed and point her at the off-world freighter.",
          targetSceneId: "rs_end_free",
          attitudeTag: "Sultry",
          gating: { requiresFlags: ["rs_caught"] },
        },
        {
          id: "rsc_retire",
          text: "\"Confirmed rogue.\" — file the paper, do the job, catch the spinner home.",
          targetSceneId: "rs_end_retire",
          attitudeTag: "Aggressive",
          gating: { requiresFlags: ["rs_caught"] },
        },
        {
          id: "rsc_walk",
          text: "Close the case file and walk back down into the rain, decided about nothing.",
          targetSceneId: "rs_end_lost",
          attitudeTag: "Neutral",
        },
      ],
      hotspots: [],
    },

    /* ───────────────────────────── ENDINGS ────────────────────────── */
    {
      id: "rs_end_free",
      title: "Flat Line, Open Sky",
      isEnding: true,
      background: "/img/rs-cover.jpg",
      prose:
        "The freighter lifts at 04:40 with the rain going sideways and one passenger unlisted, and Iris Kael rides it out of the sector wearing a coat you never saw. Your report says TEST INCONCLUSIVE — SUBJECT AT LARGE, which is eleven words away from a lie. Ostrander reads it twice and puts it in the drawer where the department keeps its quiet. The K-Wesson said flat. The photograph said 02:14. Somewhere over the pacific the two of them are still arguing, and you have stopped being the judge. The rain keeps falling. You let it.",
      endingData: {
        tier: "victory-gold",
        headline: "FLAT LINE, OPEN SKY — ONE PASSENGER UNLISTED",
        recap: "You broke her claim, read the flat line for what it was, and logged the kindest lie the department will ever file.",
      },
      hotspots: [],
      dialogueBeats: [],
      choices: [],
    },
    {
      id: "rs_end_retire",
      title: "Clean Paper, Dirty Rain",
      isEnding: true,
      background: "/img/rs-room.jpg",
      prose:
        "The paper says CONFIRMED. The spinner takes her at 05:00 without its running lights, the way the division prefers. Ostrander shakes your hand with all four fingers of his and Echelon's annex gets its quiet by Friday. On the way down Kowloon Lane, Ping's woks are steaming for the morning shift and he doesn't look up when you pass. The test came back flat and you filed it rogue, and the rain — which has been filing reports on this city since before either of you were manufactured — says nothing at all.",
      endingData: {
        tier: "victory-silver",
        headline: "CASE CLOSED BY FRIDAY — AS REQUESTED",
        recap: "You confirmed the unit and retired it, exactly as instructed. The instructions were the easy part.",
      },
      hotspots: [],
      dialogueBeats: [],
      choices: [],
    },
    {
      id: "rs_end_lost",
      title: "Gone in the Rain",
      isEnding: true,
      background: "/img/rs-street.jpg",
      prose:
        "By the time the second wrong photograph hits the table she is already moving — through the window's neon and down the fire escape with the unhurried speed of something that was built to run. The sector swallows her between a noodle steam and a prayer sign, and the K-Wesson strip in your case is blank as a fresh lie. Ostrander takes one look at the file and puts you on day patrols at the cannery pier, where the rain is exactly as heavy and the decisions arrive already made.",
      endingData: {
        tier: "gameover",
        headline: "SUBJECT AT LARGE — BADGE REDUCED",
        recap: "Two wrong presents and a walk-away. The Rain Sector keeps her, and the department keeps you.",
      },
      hotspots: [],
      dialogueBeats: [],
      choices: [],
    },
  ],
};
