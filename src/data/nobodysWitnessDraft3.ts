import type { Story } from "../types";

/**
 * NOBODY'S WITNESS — DRAFT 3
 *
 * A new, self-contained noir-rail graphic novel. This cut deliberately uses
 * no walkable stages: every room is a composed panel, a close-up, or a
 * dialogue choice. Jack Morrow is both the private detective and the first-
 * person narrator. The central romance is not a reward for solving the case;
 * it is the case's most painful piece of evidence.
 *
 * Core premise:
 *   David Voss has been skimming small amounts from Solomon Reyes for years.
 *   Vera is the only person who found the pattern. She owes Solomon a debt,
 *   is genuinely afraid of him, and hires one of Solomon's men to kill David
 *   off the books. Jack is hired as insurance: a private detective's file
 *   that makes Vera look like a frightened wife if the killing draws police.
 *   David has already noticed Vera in the accounts and moved the money. He
 *   dies before he can say where it went. Nobody alive knows where it is.
 */
export const NOBODYS_WITNESS_DRAFT_3: Story = {
  id: "nobodys-witness-draft-3",
  title: "Nobody's Witness (Draft 3)",
  tagline:
    "A dead man, a missing fortune, and the detective she hired to be seen.",
  coverImage: "/img/cover-nobodys-witness.jpg",
  gameKind: "noir-rail",
  startSceneId: "nw3_coldopen",
  dialogueBox: {
    bodyFont: "type",
    headingFont: "pulp",
    hudTheme: "sepia-pulp",
    accentColor: "#c8862f",
    dangerColor: "#9c3040",
    bordered: true,
    backdropBlur: 2,
    reserveLines: 3,
  },
  briefing: {
    objective:
      "Find David Voss before Solomon Reyes does, then decide what Jack's case file is worth when the woman he loves used it as an alibi.",
    winConditions: [
      "Read the accounts closely enough to see the careful skim David thought nobody would catch.",
      "Learn why Vera is afraid of Solomon and who she paid to kill David.",
      "Reach David before the case becomes only a body and an empty room.",
      "Choose what Jack does with the truth, the love, and the debt left behind.",
    ],
    loseConditions: [
      "Mistake Vera's fear for innocence or David's calm for decency.",
      "Give Solomon a name before you understand what the debt buys him.",
      "Let the private detective's file become a confession written for somebody else.",
    ],
  },
  acts: [
    {
      id: "nw3_act1",
      label: "Act One",
      title: "The Insurance Policy",
      tagline: "A missing husband, a frightened wife, and a folder too clean to trust.",
      startSceneId: "nw3_coldopen",
      titleCardImage: "/img/style/nw2-signature-a-neon80s.jpg",
    },
    {
      id: "nw3_act2",
      label: "Act Two",
      title: "The Money Nobody Saw",
      tagline: "David moved it. Vera paid for the silence. Jack stayed anyway.",
      startSceneId: "nw3_vera",
      titleCardImage: "/img/nw2/bg-folder.jpg",
    },
    {
      id: "nw3_act3",
      label: "Act Three",
      title: "Nobody's Witness",
      tagline: "The body is found. The money is not. Love is the last thing on the table.",
      startSceneId: "nw3_empty",
      titleCardImage: "/img/nw2/bg-final-street.jpg",
    },
  ],
  layout: {
    nw3_coldopen: { x: 0, y: 220 },
    nw3_titles: { x: 320, y: 220 },
    nw3_diner: { x: 640, y: 220 },
    nw3_folder: { x: 960, y: 220 },
    nw3_solomon: { x: 1280, y: 220 },
    nw3_vera: { x: 1600, y: 220 },
    nw3_bluecue: { x: 1920, y: 220 },
    nw3_david: { x: 2240, y: 220 },
    nw3_confession: { x: 2560, y: 220 },
    nw3_kill: { x: 2880, y: 220 },
    nw3_empty: { x: 3200, y: 220 },
    nw3_rosa: { x: 3520, y: 220 },
    nw3_solomon_final: { x: 3840, y: 220 },
    nw3_end_truth: { x: 4160, y: 40 },
    nw3_end_sacrifice: { x: 4160, y: 200 },
    nw3_end_alibi: { x: 4160, y: 360 },
    nw3_end_empty: { x: 4160, y: 520 },
    nw3_end_refusal: { x: 960, y: 520 },
  },
  characters: [
    {
      id: "jack",
      name: "Jack Morrow",
      role: "Private Detective / Narrator",
      avatarUrl: "/img/ch-jack-morrow.jpg",
      trustMeter: 0,
      voice: { pitch: 0.72, rate: 0.9 },
    },
    {
      id: "vera",
      name: "Vera Voss",
      role: "David's wife, Solomon's debtor, and the woman Jack loves",
      avatarUrl: "/img/ch-vera-voss.jpg",
      trustMeter: 0,
      voice: { pitch: 1.12, rate: 0.92 },
    },
    {
      id: "david",
      name: "David Voss",
      role: "Solomon's money man — precise, cruel, and stealing in teaspoons",
      avatarUrl: "/img/ch-david-voss.jpg",
      trustMeter: 0,
      voice: { pitch: 0.82, rate: 0.92 },
    },
    {
      id: "solomon",
      name: "Solomon Reyes",
      role: "The lender who curates debts instead of collecting them",
      avatarUrl: "/img/ch-solomon-reyes.jpg",
      trustMeter: 0,
      voice: { pitch: 0.62, rate: 0.86 },
    },
    {
      id: "moe",
      name: "Moe",
      role: "Solomon's man — paid privately to make David stop talking",
      avatarUrl: "/img/ch-moe.jpg",
      trustMeter: 0,
      voice: { pitch: 0.78, rate: 0.9 },
    },
    {
      id: "desh",
      name: "Desh",
      role: "Solomon's other man — the one who remembers what people do",
      avatarUrl: "/img/ch-desh.jpg",
      trustMeter: 0,
      voice: { pitch: 1.02, rate: 1.02 },
    },
    {
      id: "rosa",
      name: "Rosa Delgado",
      role: "Detective, Jack's oldest friend, and the last honest door in town",
      avatarUrl: "/img/ch-rosa.jpg",
      trustMeter: 0,
      voice: { pitch: 0.96, rate: 0.94 },
    },
  ],
  items: [
    {
      id: "nw3_folder",
      name: "Vera's Folder",
      icon: "🗂",
      description:
        "Bank statements, David's work history, a photograph, and a timeline polished until it almost looks like grief.",
      flavorText: "A case file can be a search. It can also be an alibi with a spine.",
      isClue: true,
    },
    {
      id: "nw3_accounts",
      name: "The Account Pages",
      icon: "📄",
      description:
        "Pages of Solomon's accounts with tiny withdrawals threaded through six years of clean totals.",
      flavorText: "Theft is loud when it is greedy. David made his quiet.",
      isClue: true,
    },
    {
      id: "nw3_photo",
      name: "David's Photograph",
      icon: "📸",
      description:
        "David Voss in a good coat, smiling like a man who has never had to apologize for the room he enters.",
      flavorText: "Some faces are not missing. They are waiting for the right debt to come due.",
    },
    {
      id: "nw3_debt_notice",
      name: "The Kessler Notice",
      icon: "✉️",
      description:
        "A notice addressed to Vera's maiden name. Solomon's debt has followed her through the marriage.",
      flavorText: "He never had to threaten her. The paper arrived first.",
      isClue: true,
    },
    {
      id: "nw3_moe_receipt",
      name: "The Off-Book Receipt",
      icon: "🧾",
      description:
        "A carbon slip for cash paid to M. No company stamp, no signature, no protection except the fact that Vera kept it.",
      flavorText: "A private murder leaves a very small receipt.",
      isClue: true,
    },
    {
      id: "nw3_empty_safe",
      name: "The Empty Safe",
      icon: "🔒",
      description:
        "A safe with clean hinges, no cash, and a dust-mark where a bag used to sit.",
      flavorText: "The money moved before the bullet did.",
      isClue: true,
    },
  ],
  deduction: {
    suspectIds: ["vera", "david", "moe", "solomon"],
    connections: [
      {
        a: "nw3_accounts",
        b: "david",
        flagSet: "nw3_skimming_seen",
        revelation:
          "The account pages show David's six-year skim: small withdrawals, never enough to trip Solomon's attention.",
      },
      {
        a: "nw3_debt_notice",
        b: "vera",
        flagSet: "nw3_debt_seen",
        revelation:
          "Vera's fear has a paper trail. The Kessler debt followed her into the Voss name.",
      },
      {
        a: "nw3_moe_receipt",
        b: "moe",
        flagSet: "nw3_offbook_seen",
        revelation:
          "Moe was paid privately. The killing was not Solomon's order, even if it used Solomon's man.",
      },
      {
        a: "nw3_empty_safe",
        b: "david",
        flagSet: "nw3_money_moved_seen",
        revelation:
          "David noticed Vera in the accounts and moved the money. The safe is empty; the location died with him.",
      },
    ],
  },
  flagNotes: {
    nw3_case_open:
      "Jack accepted Vera's case. The folder is now a real investigation and a potential insurance trail.",
    nw3_accounts_seen:
      "Jack read enough of the account pages to see a pattern, but not yet enough to call it theft.",
    nw3_solomon_suspicious:
      "Solomon knows money is missing. He suspects David, but he has never caught him stealing.",
    nw3_debt_revealed:
      "Vera owes Solomon through her maiden name. Her fear is practical, inherited, and real.",
    nw3_refused_case:
      "Jack refused Vera's insurance case before he knew how carefully she had built it.",
    nw3_photo_seen:
      "Jack has seen David's photograph: a clean face attached to an unclean job.",
    nw3_folder_open:
      "Jack opened Vera's folder and began the case, turning her prepared timeline into evidence.",
    nw3_david_bad:
      "David was one of Solomon's collectors. He was not nice before he became a thief.",
    nw3_money_moved:
      "David saw Vera going through the accounts and moved every hidden dollar before she could take it.",
    nw3_david_seen:
      "Jack found David alive in a rental house. David admitted the skim and confirmed he moved the money.",
    nw3_kept_professional:
      "Jack answered Vera's confession by calling himself her detective, even though the case had become personal.",
    nw3_asked_stop_moe:
      "Jack asked whether Vera could stop Moe. She could not, or would not, before the appointment.",
    nw3_told_vera_money_gone:
      "Jack told Vera the hidden money was gone before the police or Solomon could use the fact against her.",
    nw3_protected_empty_safe:
      "Jack kept the empty safe out of the first police version, protecting Vera from one more immediate clue.",
    nw3_evidence_kept:
      "Jack kept Vera's off-book receipt instead of handing it to Rosa, preserving a dangerous last choice.",
    nw3_told_truth:
      "Jack gave Solomon the confession and Moe's name, refusing to let the insurance file become a lie.",
    nw3_kept_alibi:
      "Jack kept Vera's name out of the report and let the insurance file carry the lie for her.",
    nw3_admitted_money_gone:
      "Jack told Solomon that the money was gone and that nobody alive knew where David had put it.",
    nw3_vera_confessed:
      "Vera admits she found David's skim, paid Moe to kill him, and hired Jack as insurance for the police.",
    nw3_killer_paid:
      "Moe confirms Vera paid him off the books. Solomon did not order David's murder.",
    nw3_david_dead:
      "David Voss is dead. The money is not recovered. Nobody alive knows where he put it.",
    nw3_empty_room:
      "Vera found David's body and the clean dust-mark where the hidden money used to be.",
    nw3_jack_loves_vera:
      "Jack says the unprofessional thing out loud: he loves Vera, knowing exactly what she used him for.",
    nw3_evidence_shared:
      "Jack gave Rosa the private receipt. Vera can no longer pretend the killing was only a fear in her head.",
    nw3_jack_debt:
      "Jack offered Solomon the case, the license, and his own name in exchange for Vera's safety.",
  },
  scenes: [
    /* ================================================================ */
    /* COLD OPEN                                                        */
    /* ================================================================ */
    {
      id: "nw3_coldopen",
      title: "Cold Open — The Room After",
      nodeType: "cutscene",
      background: "/img/nw2/bg-yard-night.jpg",
      ambientAudio: "rain",
      particles: "rain",
      musicMode: "none",
      transition: "fade-black",
      transitionSpeed: 1.4,
      letterbox: true,
      choiceDelaySeconds: 4,
      cinematic: {
        mode: "static",
        dimAmount: 0.42,
        lights: [
          { x: 76, y: 30, color: "#2a6cff", intensity: 0.24, size: 40, pulseSeconds: 1.9, pulseAmount: 1 },
          { x: 84, y: 34, color: "#ff2e3c", intensity: 0.22, size: 38, pulseSeconds: 2.3, pulseAmount: 1 },
        ],
      },
      prose:
        "EXT. A SERVICE ROAD BEHIND A RENTAL HOUSE — NIGHT. Rain. Red and blue light turning on wet grass. A door hanging open. The room beyond it is dark except for the phone on the floor.",
      dialogueBeats: [
        {
          id: "nw3_co_j1",
          characterId: "jack",
          expression: "V.O. — flat, no context yet",
          text: "The first thing you should know is that David Voss was dead before I understood what Vera had hired me to witness.",
        },
        {
          id: "nw3_co_j2",
          characterId: "jack",
          expression: "V.O. — closer",
          text: "The second thing is that the money was gone before the bullet. Nobody alive knew where it was. Not Solomon. Not Vera. Not me. And not David, once Moe finished the sentence for him.",
        },
        {
          id: "nw3_co_s1",
          characterId: "jack",
          expression: "the phone buzzing on the floor",
          text: "The phone buzzes. Nobody answers it.",
          silent: true,
          audioUrl: "/nwt-gunshot.wav",
        },
      ],
      choices: [
        {
          id: "nw3_co_go",
          text: "Three nights earlier.",
          targetSceneId: "nw3_titles",
          attitudeTag: "Neutral",
        },
      ],
      hotspots: [],
    },

    /* ================================================================ */
    /* TITLES                                                            */
    /* ================================================================ */
    {
      id: "nw3_titles",
      title: "Nobody's Witness",
      nodeType: "credits",
      background: "/img/style/nw2-signature-a-neon80s.jpg",
      ambientAudio: "rain",
      musicMode: "track",
      musicUrl: "/nobodys-witness.mp3",
      musicLevel: 0.62,
      noTypewriter: true,
      transition: "cut",
      letterbox: true,
      choiceDelaySeconds: 12,
      credits: {
        title: "NOBODY'S WITNESS",
        subtitle: "DRAFT 3 · A GRAPHIC NOVEL IN THREE ACTS",
        titleEntrance: "slam",
        titleColor: "#e8b23c",
        accentColor: "#2ad9d9",
        font: "poster",
        style: "cards",
        cardMotion: "letterspace",
        cardSeconds: 3.2,
        gateWeave: "worn",
        montage: [
          "/img/style/nw2-signature-a-neon80s.jpg",
          "/img/nw2/mo-mainstreet.jpg",
          "/img/nw2/bg-diner-int.jpg",
          "/img/nw2/bg-folder.jpg",
          "/img/nw2/bg-yard-night.jpg",
          "/img/style/nw2-signature-a-neon80s.jpg",
        ],
        montageSeconds: 3.8,
        montageTransition: "cut",
        montageLoop: true,
        lines: [
          { role: "A Gaslight Reelworks Production", name: "" },
          { role: "Written for the Reel", name: "Scarlet Reel" },
          { role: "Starring", name: "Jack Morrow" },
          { role: "And", name: "Vera Voss" },
          { role: "With", name: "David Voss · Solomon Reyes · Moe" },
          { role: "Act One", name: "The Insurance Policy" },
        ],
      },
      prose:
        "NOBODY'S WITNESS\n\nDRAFT 3\n\nA graphic novel in three acts\n\nBlackwood. Rain. A case that has already happened.",
      choices: [
        {
          id: "nw3_title_go",
          text: "Blackwood Diner. Eleven forty-seven.",
          targetSceneId: "nw3_diner",
          attitudeTag: "Neutral",
        },
      ],
      hotspots: [],
      dialogueBeats: [],
    },

    /* ================================================================ */
    /* ACT ONE — THE DINER                                              */
    /* ================================================================ */
    {
      id: "nw3_diner",
      title: "Act One — The Insurance Policy",
      background: "/img/nw2/bg-diner-int.jpg",
      ambientAudio: "rain",
      particles: "rain",
      musicMode: "track",
      musicUrl: "/Midnight in the Rain2.mp3",
      musicLevel: 0.42,
      musicFadeSeconds: 2,
      transition: "fade-black",
      transitionSpeed: 1.1,
      letterbox: true,
      cinematic: {
        mode: "pan",
        focalPoint: "48% 46%",
        panDistance: 3,
        panDirection: "left",
        zoomDuration: 28,
        dimAmount: 0.14,
        lights: [
          { x: 20, y: 20, color: "#ff2e88", intensity: 0.24, size: 34, pulseSeconds: 3.4, pulseAmount: 0.9 },
          { x: 76, y: 22, color: "#2ad9d9", intensity: 0.18, size: 40, pulseSeconds: 4.8, pulseAmount: 0.6 },
        ],
      },
      prose:
        "INT. BLACKWOOD DINER — NIGHT. Eleven forty-seven. Rain on the glass. One booth occupied by JACK MORROW, forty-four, private detective, coffee gone cold and phone turned face-down. VERA VOSS crosses the room without looking at anyone else.",
      dialogueBeats: [
        {
          id: "nw3_d_vo1",
          characterId: "jack",
          expression: "V.O.",
          text: "Nobody took what I lost. I handed it over. In order. So when I tell you I didn't see Vera Voss coming, understand that I saw her. I just kept my eyes shut in all the ways that mattered.",
        },
        {
          id: "nw3_d_v1",
          characterId: "vera",
          expression: "standing at the booth, composed too carefully",
          text: "Mr. Morrow? They said you were the only private detective in Blackwood who doesn't belong to Solomon Reyes.",
        },
        {
          id: "nw3_d_j1",
          characterId: "jack",
          expression: "not looking up",
          text: "They say a lot after midnight. Sit down or don't. The coffee's not getting better either way.",
        },
        {
          id: "nw3_d_v2",
          characterId: "vera",
          expression: "sitting, hands folded around an untouched cup",
          text: "My husband is missing. David Voss. Three nights. The police called it voluntary. I don't believe them.",
        },
        {
          id: "nw3_d_j2",
          characterId: "jack",
          expression: "V.O.",
          text: "I knew the name. Everybody knew the name. David Voss collected for Solomon, and he collected the way a man handles a knife he likes. Careful. Close. Never nice.",
        },
        {
          id: "nw3_d_v3",
          characterId: "vera",
          expression: "a small, controlled breath",
          text: "I brought everything I have. His photograph. His accounts. The places he used to go. I need somebody to look where the police didn't.",
        },
        {
          id: "nw3_d_j3",
          characterId: "jack",
          expression: "quiet",
          text: "Everybody says they want a person found. Most of them want a story found. Which one are you buying?",
        },
        {
          id: "nw3_d_r_source",
          characterId: "vera",
          expression: "guarded, after the first question",
          conditionRule: { requiresFlags: ["nw3_asked_source"] },
          text: "A woman at the courthouse told me your name. She said you were the only man in Blackwood who could look at a crooked story without asking Solomon how it ended.",
        },
        {
          id: "nw3_d_r_work",
          characterId: "vera",
          expression: "careful with David's name",
          conditionRule: { requiresFlags: ["nw3_asked_work"] },
          text: "David handled collections for Solomon. He carried the books between the accounts and the men. He was good at making a number feel like a threat.",
        },
        {
          id: "nw3_d_r_police",
          characterId: "vera",
          expression: "the brightness gone",
          conditionRule: { requiresFlags: ["nw3_asked_police"] },
          text: "Because the police ask Solomon before they ask me. If I call them, he hears it as an invitation.",
        },
        {
          id: "nw3_d_r_debt",
          characterId: "vera",
          expression: "looking at the tabletop",
          conditionRule: { requiresFlags: ["nw3_asked_debt"] },
          text: "I owe him enough that my name opens doors I would rather leave closed. That is all you need to know tonight.",
        },
        {
          id: "nw3_d_r_truth",
          characterId: "vera",
          expression: "hurt because he is close",
          conditionRule: { requiresFlags: ["nw3_asked_truth"] },
          text: "If you think I am setting you up, leave the folder here. I will find another way to be frightened. I am already practiced at it.",
        },
        {
          id: "nw3_d_r_whyme",
          characterId: "vera",
          expression: "a little too honest",
          conditionRule: { requiresFlags: ["nw3_asked_whyme"] },
          text: "Because your name is clean. If David turns up dead, a detective's file gives the police a reason to believe I was looking for him first.",
        },
      ],
      choices: [
        {
          id: "nw3_d_q_source",
          text: "\"Who told you to come to me?\"",
          targetSceneId: "",
          reply: true,
          exclusiveGroup: "nw3_d1",
          attitudeTag: "Clever",
          consequences: {
            setFlags: ["nw3_asked_source"],
            meterChanges: [{ meter: "Clever", delta: 1 }],
          },
        },
        {
          id: "nw3_d_q_david",
          text: "\"What was David doing for Solomon?\"",
          targetSceneId: "",
          reply: true,
          exclusiveGroup: "nw3_d1",
          attitudeTag: "Aggressive",
          consequences: {
            setFlags: ["nw3_asked_work"],
            meterChanges: [{ meter: "Aggressive", delta: 1 }],
          },
        },
        {
          id: "nw3_d_q_police",
          text: "\"Why not let the police handle a missing husband?\"",
          targetSceneId: "",
          reply: true,
          exclusiveGroup: "nw3_d1",
          attitudeTag: "Neutral",
          consequences: { setFlags: ["nw3_asked_police"] },
        },
        {
          id: "nw3_d_q_debt",
          text: "\"What do you owe Solomon Reyes?\"",
          targetSceneId: "",
          reply: true,
          exclusiveGroup: "nw3_d2",
          hidden: true,
          attitudeTag: "Clever",
          gating: {
            requiresFlags: ["nw3_asked_source", "nw3_asked_work", "nw3_asked_police"],
            requiresAll: false,
          },
          consequences: {
            setFlags: ["nw3_asked_debt"],
            meterChanges: [{ meter: "Clever", delta: 1 }],
          },
        },
        {
          id: "nw3_d_q_truth",
          text: "\"You don't want David found. You want to be seen looking.\"",
          targetSceneId: "",
          reply: true,
          exclusiveGroup: "nw3_d2",
          hidden: true,
          attitudeTag: "Aggressive",
          gating: {
            requiresFlags: ["nw3_asked_source", "nw3_asked_work", "nw3_asked_police"],
            requiresAll: false,
          },
          consequences: {
            setFlags: ["nw3_asked_truth"],
            meterChanges: [{ meter: "Aggressive", delta: 1 }, { meter: "Suspicion", delta: 1 }],
            trustChanges: [{ characterId: "vera", delta: -1 }],
          },
        },
        {
          id: "nw3_d_q_whyme",
          text: "\"Why me, if you already did the police's job?\"",
          targetSceneId: "",
          reply: true,
          exclusiveGroup: "nw3_d2",
          hidden: true,
          attitudeTag: "Sultry",
          gating: {
            requiresFlags: ["nw3_asked_source", "nw3_asked_work", "nw3_asked_police"],
            requiresAll: false,
          },
          consequences: {
            setFlags: ["nw3_asked_whyme"],
            meterChanges: [{ meter: "Sultry", delta: 1 }],
            trustChanges: [{ characterId: "vera", delta: 1 }],
          },
        },
        {
          id: "nw3_d_take",
          text: "Take the folder. Take the case.",
          targetSceneId: "nw3_folder",
          hidden: true,
          attitudeTag: "Neutral",
          gating: {
            requiresFlags: ["nw3_asked_debt", "nw3_asked_truth", "nw3_asked_whyme"],
            requiresAll: false,
          },
          consequences: {
            setFlags: ["nw3_case_open"],
            addItems: ["nw3_folder"],
            trustChanges: [{ characterId: "vera", delta: 1 }],
          },
          memoryLog: "nw3_took_case",
          rememberLine: "Vera will remember that.",
        },
        {
          id: "nw3_d_refuse",
          text: "Slide the folder back. I don't take insurance cases.",
          targetSceneId: "nw3_end_refusal",
          hidden: true,
          attitudeTag: "Neutral",
          gating: {
            requiresFlags: ["nw3_asked_debt", "nw3_asked_truth", "nw3_asked_whyme"],
            requiresAll: false,
          },
          consequences: { setFlags: ["nw3_refused_case"] },
        },
      ],
      hotspots: [
        {
          id: "nw3_d_phone",
          label: "Jack's face-down phone",
          bounds: { x: 52, y: 74, w: 12, h: 12 },
          cursor: "look",
          isRepeatable: true,
          action: {
            type: "showText",
            text: "Face-down since ten. A phone is just a witness with a battery. Jack has no use for one that volunteers.",
          },
        },
        {
          id: "nw3_d_folder",
          label: "The folder Vera brought",
          bounds: { x: 34, y: 60, w: 22, h: 18 },
          cursor: "look",
          isRepeatable: true,
          action: {
            type: "showText",
            text: "Squared to the edge of the table. Bank pages on top. A photograph underneath. Vera has arranged the evidence like she has rehearsed the order in which she will be believed.",
          },
        },
      ],
    },

    /* ================================================================ */
    /* ACT ONE — THE FOLDER                                             */
    /* ================================================================ */
    {
      id: "nw3_folder",
      title: "Act One — The Shape in the Accounts",
      background: "/img/nw2/bg-folder.jpg",
      ambientAudio: "rain",
      particles: "rain",
      musicMode: "none",
      transition: "fade",
      transitionSpeed: 0.8,
      letterbox: true,
      cinematic: {
        mode: "zoom-hold",
        focalPoint: "50% 52%",
        zoomDuration: 18,
        dimAmount: 0.2,
        lights: [
          { x: 44, y: 50, color: "#ffb761", intensity: 0.28, size: 34, pulseSeconds: 4.2, pulseAmount: 0.6 },
        ],
      },
      prose:
        "INT. JACK'S OFFICE — LATER. One desk lamp. The folder open under it. Rain moving down the glass in straight lines. Jack's handwriting fills the margin beside David's name.",
      onEnterActions: [{ consequences: { setFlags: ["nw3_folder_open"] } }],
      dialogueBeats: [
        {
          id: "nw3_f_j_vo1",
          characterId: "jack",
          expression: "V.O. — focused",
          text: "The first thing the folder told me was that Vera had done the looking herself. Dates. Branches. Names of people David had no reason to know unless he was working for Solomon.",
          recalls: {
            nw3_took_case:
              "Vera put the case in my hands. I called it a job so I would not have to call it a promise.",
          },
        },
        {
          id: "nw3_f_j_vo2",
          characterId: "jack",
          expression: "V.O. — quieter",
          text: "The second thing was a shape in the accounts. Eighty dollars here. A hundred and twenty there. A transfer rounded down so neatly it looked like a bank's mistake. Not theft yet. Just a line of ants carrying something into the dark.",
        },
        {
          id: "nw3_f_j_vo3",
          characterId: "jack",
          expression: "V.O.",
          text: "David Voss had been Solomon's money man for six years. He collected late payments, moved cash, and made the kind of people who said no regret having a mouth. Nobody called him nice. Nobody called him careless either.",
        },
        {
          id: "nw3_f_j_vo4",
          characterId: "jack",
          expression: "V.O. — the first unease",
          text: "There were enough tiny withdrawals to make a fortune and not one large enough to make a witness. Whoever found this had been patient. Whoever built the folder wanted me to think patience was the same thing as innocence.",
        },
      ],
      choices: [
        {
          id: "nw3_f_to_solomon",
          text: "Take the name upstairs to Solomon Reyes.",
          targetSceneId: "nw3_solomon",
          attitudeTag: "Neutral",
        },
      ],
      hotspots: [
        {
          id: "nw3_f_accounts",
          label: "The account pages",
          bounds: { x: 26, y: 42, w: 34, h: 28 },
          cursor: "take",
          showItemImage: true,
          isRepeatable: false,
          examine: true,
          examineSeconds: 2.2,
          action: {
            type: "giveItem",
            itemGranted: "nw3_accounts",
            flagSet: "nw3_accounts_seen",
          },
        },
        {
          id: "nw3_f_photo",
          label: "David's photograph",
          bounds: { x: 64, y: 42, w: 22, h: 26 },
          cursor: "take",
          showItemImage: true,
          isRepeatable: false,
          action: {
            type: "giveItem",
            itemGranted: "nw3_photo",
            flagSet: "nw3_photo_seen",
          },
        },
        {
          id: "nw3_f_margin",
          label: "Jack's notes in the margin",
          bounds: { x: 62, y: 70, w: 28, h: 14 },
          cursor: "look",
          isRepeatable: true,
          action: {
            type: "showText",
            text: "Six years. Six hundred small withdrawals. Jack has written the word CAREFUL three times and still doesn't know whether it describes David or Vera.",
          },
        },
      ],
    },

    /* ================================================================ */
    /* ACT ONE — SOLOMON                                                */
    /* ================================================================ */
    {
      id: "nw3_solomon",
      title: "Act One — The Man Who Curates Debts",
      background: "/img/nw2/bg-solomon-office.jpg",
      ambientAudio: "drone",
      particles: "smoke",
      musicMode: "none",
      transition: "fade-black",
      transitionSpeed: 1.1,
      letterbox: true,
      cinematic: {
        mode: "dolly",
        focalPoint: "54% 48%",
        dollyDistance: 3,
        dollyDuration: 24,
        dimAmount: 0.26,
        lights: [
          { x: 68, y: 30, color: "#ffb761", intensity: 0.26, size: 30, pulseSeconds: 5.2, pulseAmount: 0.35 },
        ],
      },
      onEnterActions: [
        { consequences: { setFlags: ["nw3_solomon_suspicious"] } },
      ],
      prose:
        "INT. SOLOMON'S OFFICE ABOVE THE FEED STORE — NIGHT. The room is smaller than the reputation. A space heater. A filing cabinet. Solomon Reyes in a cardigan, waiting as if Jack had an appointment.",
      dialogueBeats: [
        {
          id: "nw3_s_s1",
          characterId: "solomon",
          expression: "pleasant",
          text: "Mr. Morrow. David Voss is missing. You are asking questions about him. I don't like two mysteries in one room.",
        },
        {
          id: "nw3_s_j1",
          characterId: "jack",
          expression: "flat",
          text: "I was hired to find a husband. You make it sound like I brought him with me.",
        },
        {
          id: "nw3_s_s2",
          characterId: "solomon",
          expression: "mild",
          text: "Something has been leaving my accounts for years. Small amounts. Careful amounts. I have not called it theft because I have not caught anyone stealing.",
        },
        {
          id: "nw3_s_j2",
          characterId: "jack",
          expression: "V.O.",
          text: "He suspected a hole. He did not know David had been drinking from it. That distinction was the only reason I was still standing.",
        },
        {
          id: "nw3_s_s3",
          characterId: "solomon",
          expression: "the warmth thinning",
          text: "David was one of mine. Not a nice man, but a precise one. If he has my money, bring me David. If David has moved on without it, bring me the place he moved to. Forty-eight hours.",
        },
        {
          id: "nw3_s_j3",
          characterId: "jack",
          expression: "quiet",
          text: "And if I bring you neither?",
        },
        {
          id: "nw3_s_s4",
          characterId: "solomon",
          expression: "almost kind",
          text: "Then I stop asking questions about your client and start asking them of her. Vera Voss has a debt in her maiden name. Debts are patient. People are not.",
        },
        {
          id: "nw3_s_j4",
          characterId: "jack",
          expression: "V.O.",
          text: "He said her name like he was setting down a glass. That was the first time I understood why Vera had looked at the door before she looked at me.",
        },
        {
          id: "nw3_s_r_client",
          characterId: "solomon",
          expression: "pleasant because the answer is already known",
          conditionRule: { requiresFlags: ["nw3_named_vera"] },
          text: "Of course I know. Vera's debt makes her very easy to notice. I wanted to know whether you were easy to buy.",
        },
        {
          id: "nw3_s_r_debt",
          characterId: "solomon",
          expression: "administrative",
          conditionRule: { requiresFlags: ["nw3_asked_solomon_debt"] },
          text: "Her father borrowed four thousand. Vera inherited the paper, not the furnace. The paper has been more durable.",
        },
        {
          id: "nw3_s_r_david",
          characterId: "solomon",
          expression: "a slight pause",
          conditionRule: { requiresFlags: ["nw3_asked_solomon_david"] },
          text: "I think David is capable of many things. Thinking is not catching. I prefer a fact I can put in a drawer.",
        },
      ],
      choices: [
        {
          id: "nw3_s_q_client",
          text: "\"You already know Vera hired me.\"",
          targetSceneId: "",
          reply: true,
          exclusiveGroup: "nw3_s1",
          attitudeTag: "Aggressive",
          consequences: {
            setFlags: ["nw3_named_vera"],
            meterChanges: [{ meter: "Aggressive", delta: 1 }, { meter: "Suspicion", delta: 1 }],
          },
        },
        {
          id: "nw3_s_q_debt",
          text: "\"What exactly does Vera owe you?\"",
          targetSceneId: "",
          reply: true,
          exclusiveGroup: "nw3_s1",
          attitudeTag: "Clever",
          consequences: {
            setFlags: ["nw3_asked_solomon_debt"],
            meterChanges: [{ meter: "Clever", delta: 1 }],
          },
        },
        {
          id: "nw3_s_q_david",
          text: "\"You think David stole from you.\"",
          targetSceneId: "",
          reply: true,
          exclusiveGroup: "nw3_s1",
          attitudeTag: "Neutral",
          consequences: { setFlags: ["nw3_asked_solomon_david"] },
        },
        {
          id: "nw3_s_leave",
          text: "Leave with the forty-eight hours.",
          targetSceneId: "nw3_vera",
          hidden: true,
          attitudeTag: "Neutral",
          gating: {
            requiresFlags: ["nw3_named_vera", "nw3_asked_solomon_debt", "nw3_asked_solomon_david"],
            requiresAll: false,
          },
        },
      ],
      hotspots: [
        {
          id: "nw3_s_cabinet",
          label: "The filing cabinet",
          bounds: { x: 72, y: 36, w: 22, h: 46 },
          cursor: "look",
          isRepeatable: true,
          action: {
            type: "showText",
            text: "A filing system that eats people slowly and lets Solomon feel administrative about it. Somewhere inside is Vera's debt, still earning interest.",
          },
        },
        {
          id: "nw3_s_heater",
          label: "The space heater",
          bounds: { x: 8, y: 54, w: 24, h: 28 },
          cursor: "look",
          isRepeatable: true,
          action: {
            type: "showText",
            text: "Ticking. The loudest thing in the room whenever Solomon stops talking.",
          },
        },
      ],
    },

    /* ================================================================ */
    /* ACT TWO — VERA'S FEAR                                            */
    /* ================================================================ */
    {
      id: "nw3_vera",
      title: "Act Two — The Debt Has Her Name",
      partBreak: "Act One — The Insurance Policy",
      background: "/img/nw2/bg-vera-booth.jpg",
      ambientAudio: "rain",
      particles: "rain",
      musicMode: "none",
      transition: "fade-black",
      transitionSpeed: 1.2,
      letterbox: true,
      cinematic: {
        mode: "zoom-hold",
        focalPoint: "48% 44%",
        zoomDuration: 26,
        dimAmount: 0.24,
        lights: [
          { x: 24, y: 26, color: "#ff2e88", intensity: 0.22, size: 32, pulseSeconds: 3.6, pulseAmount: 0.7 },
          { x: 76, y: 34, color: "#2ad9d9", intensity: 0.14, size: 36, pulseSeconds: 5.6, pulseAmount: 0.55 },
        ],
      },
      prose:
        "INT. THE DINER — AFTER CLOSING. The chairs are upside down on the tables. Vera has locked the door, but she keeps looking through the glass at the black sedan across the street.",
      dialogueBeats: [
        {
          id: "nw3_v_s1",
          characterId: "vera",
          expression: "watching the sedan",
          text: "Don't look at the car.",
        },
        {
          id: "nw3_v_j1",
          characterId: "jack",
          expression: "looking anyway",
          text: "I wasn't. I was looking at the rain reflected in the car.",
        },
        {
          id: "nw3_v_s2",
          characterId: "vera",
          expression: "the joke misses her completely",
          text: "It's his car. He won't come in. He doesn't have to. Solomon likes people to know he could have.",
        },
        {
          id: "nw3_v_j2",
          characterId: "jack",
          expression: "quiet",
          text: "What do you owe him?",
        },
        {
          id: "nw3_v_s3",
          characterId: "vera",
          expression: "hands tightening around the receipt",
          text: "My father borrowed four thousand for a furnace. The paper said four. The paper kept going. My father died owing eleven. I married David and the debt learned my new name. It is my debt now, and Solomon makes sure I know it.",
        },
        {
          id: "nw3_v_j3",
          characterId: "jack",
          expression: "V.O.",
          text: "Her hand was shaking. Not theatrically. The kind of shaking a person hides by giving it a piece of paper to hold.",
        },
        {
          id: "nw3_v_s4",
          characterId: "vera",
          expression: "flat because fear has made a professional of her",
          text: "I am afraid of him, Jack. There. You wanted the clean sentence. I am afraid of Solomon Reyes. I have been afraid of him since my father's funeral.",
        },
        {
          id: "nw3_v_j4",
          characterId: "jack",
          expression: "soft",
          text: "You don't have to be brave with me.",
        },
        {
          id: "nw3_v_s5",
          characterId: "vera",
          expression: "looking at him now",
          text: "Don't make promises you can't pay. Everybody in this town starts with a promise and ends with a number.",
        },
        {
          id: "nw3_v_j5",
          characterId: "jack",
          expression: "V.O.",
          text: "That was when I started falling in love with her. Not when she smiled. When she told me exactly what a promise cost and still let me sit beside her.",
        },
        {
          id: "nw3_v_r_david",
          characterId: "vera",
          expression: "careful, refusing the word theft",
          conditionRule: { requiresFlags: ["nw3_asked_vera_david"] },
          text: "He kept records for Solomon. That is all I can say without making the room smaller. Men like David notice when a story gets too specific.",
        },
        {
          id: "nw3_v_r_stay",
          characterId: "vera",
          expression: "a little less afraid",
          conditionRule: { requiresFlags: ["nw3_offered_stay"] },
          text: "You should not sit beside me. But I am glad you did. That is not permission to promise anything.",
        },
        {
          id: "nw3_v_r_leave",
          characterId: "vera",
          expression: "a tired smile",
          conditionRule: { requiresFlags: ["nw3_asked_leave"] },
          text: "I have tried leaving. Solomon's paper followed me to the bus station. I am not afraid of the city, Jack. I am afraid of what owns my name.",
        },
      ],
      choices: [
        {
          id: "nw3_v_q_david",
          text: "\"What was David hiding from Solomon?\"",
          targetSceneId: "",
          reply: true,
          exclusiveGroup: "nw3_v1",
          attitudeTag: "Clever",
          consequences: {
            setFlags: ["nw3_asked_vera_david"],
            meterChanges: [{ meter: "Clever", delta: 1 }],
          },
        },
        {
          id: "nw3_v_q_stay",
          text: "\"You don't have to do this alone.\"",
          targetSceneId: "",
          reply: true,
          exclusiveGroup: "nw3_v1",
          attitudeTag: "Sultry",
          consequences: {
            setFlags: ["nw3_offered_stay"],
            meterChanges: [{ meter: "Sultry", delta: 1 }],
            trustChanges: [{ characterId: "vera", delta: 1 }],
          },
        },
        {
          id: "nw3_v_q_leave",
          text: "\"You can still leave before this gets worse.\"",
          targetSceneId: "",
          reply: true,
          exclusiveGroup: "nw3_v1",
          attitudeTag: "Aggressive",
          consequences: {
            setFlags: ["nw3_asked_leave"],
            meterChanges: [{ meter: "Aggressive", delta: 1 }],
          },
        },
        {
          id: "nw3_v_next",
          text: "Ask around about David's old associates.",
          targetSceneId: "nw3_bluecue",
          hidden: true,
          attitudeTag: "Neutral",
          gating: {
            requiresFlags: ["nw3_asked_vera_david", "nw3_offered_stay", "nw3_asked_leave"],
            requiresAll: false,
          },
        },
      ],
      onEnterActions: [{ consequences: { setFlags: ["nw3_debt_revealed"] } }],
      hotspots: [
        {
          id: "nw3_v_notice",
          label: "The debt notice in Vera's hand",
          bounds: { x: 58, y: 60, w: 20, h: 18 },
          cursor: "take",
          showItemImage: true,
          isRepeatable: false,
          action: {
            type: "giveItem",
            itemGranted: "nw3_debt_notice",
            flagSet: "nw3_debt_seen",
          },
        },
        {
          id: "nw3_v_window",
          label: "The black sedan outside",
          bounds: { x: 4, y: 24, w: 26, h: 40 },
          cursor: "look",
          isRepeatable: true,
          action: {
            type: "showText",
            text: "Solomon's sedan across the street. Engine off. Headlights off. A threat that has taken the trouble to be polite.",
          },
        },
      ],
    },

    /* ================================================================ */
    /* ACT TWO — THE BLUE CUE                                          */
    /* ================================================================ */
    {
      id: "nw3_bluecue",
      title: "Act Two — The Wrong Kind of Regulars",
      background: "/img/nw2/bg-poolhall.jpg",
      ambientAudio: "jazz",
      musicUrl: "/nwt-bluecue-jukebox.mp3",
      musicMode: "track",
      musicLevel: 0.38,
      musicFadeSeconds: 1.4,
      particles: "smoke",
      transition: "fade",
      letterbox: true,
      cinematic: {
        mode: "dolly",
        focalPoint: "52% 46%",
        dollyDistance: 4,
        dollyDuration: 22,
        dimAmount: 0.3,
        lights: [
          { x: 28, y: 34, color: "#ff2e88", intensity: 0.22, size: 28, pulseSeconds: 3.2, pulseAmount: 0.7 },
          { x: 66, y: 38, color: "#ffb761", intensity: 0.24, size: 30, pulseSeconds: 4.8, pulseAmount: 0.45 },
        ],
      },
      prose:
        "INT. THE BLUE CUE — NIGHT. The jukebox is playing something sad enough to be useful. Moe and Desh are at the bar. They recognize Jack before he reaches the room's only good light.",
      dialogueBeats: [
        {
          id: "nw3_b_jvo1",
          characterId: "jack",
          expression: "V.O.",
          text: "David's associates were not people you found by asking. They were people who noticed you asking and decided whether the answer was worth the trouble.",
        },
        {
          id: "nw3_b_d1",
          characterId: "desh",
          expression: "mid-argument with Moe",
          text: "I'm saying a machine can't be innocent just because it says please.",
        },
        {
          id: "nw3_b_m1",
          characterId: "moe",
          expression: "without looking at Jack",
          text: "It's a recording, Desh.",
        },
        {
          id: "nw3_b_j1",
          characterId: "jack",
          expression: "flat",
          text: "David Voss. I need the room to stop pretending nobody heard me.",
        },
        {
          id: "nw3_b_d2",
          characterId: "desh",
          expression: "quiet now",
          text: "David wasn't nice.",
        },
        {
          id: "nw3_b_m2",
          characterId: "moe",
          expression: "calm",
          text: "He wasn't hired to be nice.",
        },
        {
          id: "nw3_b_d3",
          characterId: "desh",
          expression: "remembering a thing he wishes he didn't",
          text: "He took a widow's house because she was two days late. Sat at her kitchen table and explained the interest while she cried. He said the crying made people honest.",
        },
        {
          id: "nw3_b_j2",
          characterId: "jack",
          expression: "V.O.",
          text: "Nobody defended David. They only explained the job, which was worse. A monster can be fired. A job keeps its pension.",
        },
        {
          id: "nw3_b_m3",
          characterId: "moe",
          expression: "looking at Jack for the first time",
          text: "Why are you looking for him?",
        },
        {
          id: "nw3_b_j3",
          characterId: "jack",
          expression: "measured",
          text: "His wife says he is missing.",
        },
        {
          id: "nw3_b_m4",
          characterId: "moe",
          expression: "a pause too exact",
          text: "His wife says a lot of things?",
        },
        {
          id: "nw3_b_j4",
          characterId: "jack",
          expression: "V.O.",
          text: "Moe didn't ask her name. That was how I knew he already had it. I also knew he was one of Solomon's men, and I had no idea how much that would matter before the night was over.",
        },
        {
          id: "nw3_b_r_bad",
          characterId: "desh",
          expression: "uncomfortable with the memory",
          conditionRule: { requiresFlags: ["nw3_david_bad"] },
          text: "The kind who smiled when the door locked. If you are looking for a decent reason he vanished, don't use David's name to find one.",
        },
        {
          id: "nw3_b_r_last",
          characterId: "moe",
          expression: "measuring the answer",
          conditionRule: { requiresFlags: ["nw3_asked_last_seen"] },
          text: "He left through the service road. No bag. No driver. He told me he was done being found.",
        },
        {
          id: "nw3_b_r_moe",
          characterId: "moe",
          expression: "a warning disguised as a courtesy",
          conditionRule: { requiresFlags: ["nw3_clocked_moe"] },
          text: "I work for Solomon. That means you can ask me a question. It does not mean you will enjoy the answer.",
        },
      ],
      choices: [
        {
          id: "nw3_b_q_bad",
          text: "\"What kind of man was he?\"",
          targetSceneId: "",
          reply: true,
          exclusiveGroup: "nw3_b1",
          attitudeTag: "Clever",
          consequences: {
            setFlags: ["nw3_david_bad"],
            meterChanges: [{ meter: "Clever", delta: 1 }],
          },
        },
        {
          id: "nw3_b_q_last",
          text: "\"Who saw him last?\"",
          targetSceneId: "",
          reply: true,
          exclusiveGroup: "nw3_b1",
          attitudeTag: "Neutral",
          consequences: { setFlags: ["nw3_asked_last_seen"] },
        },
        {
          id: "nw3_b_q_moe",
          text: "\"You work for Solomon.\"",
          targetSceneId: "",
          reply: true,
          exclusiveGroup: "nw3_b1",
          attitudeTag: "Aggressive",
          consequences: {
            setFlags: ["nw3_clocked_moe"],
            meterChanges: [{ meter: "Aggressive", delta: 1 }, { meter: "Suspicion", delta: 1 }],
          },
        },
        {
          id: "nw3_b_next",
          text: "Take the address they give you.",
          targetSceneId: "nw3_david",
          hidden: true,
          attitudeTag: "Neutral",
          gating: {
            requiresFlags: ["nw3_david_bad", "nw3_asked_last_seen", "nw3_clocked_moe"],
            requiresAll: false,
          },
        },
      ],
      hotspots: [
        {
          id: "nw3_b_juke",
          label: "The jukebox",
          bounds: { x: 4, y: 30, w: 18, h: 42 },
          cursor: "look",
          isRepeatable: true,
          action: {
            type: "showText",
            text: "A warped song repeating a chorus about a man who stopped loving somebody. The machine has no sympathy. It has habits.",
          },
        },
        {
          id: "nw3_b_moe_jacket",
          label: "Moe's jacket",
          bounds: { x: 42, y: 38, w: 18, h: 34 },
          cursor: "look",
          isRepeatable: true,
          action: {
            type: "showText",
            text: "One side hangs wrong. A man carrying a gun or a secret usually makes the same mistake: gravity tells on him.",
          },
        },
      ],
    },

    /* ================================================================ */
    /* ACT TWO — DAVID                                                  */
    /* ================================================================ */
    {
      id: "nw3_david",
      title: "Act Two — The Man Who Moved the Money",
      background: "/img/bg-safehouse.jpg",
      ambientAudio: "drone",
      particles: "rain",
      musicMode: "none",
      transition: "fade-black",
      transitionSpeed: 1.2,
      letterbox: true,
      cinematic: {
        mode: "static",
        dimAmount: 0.28,
        lights: [
          { x: 30, y: 38, color: "#ffb761", intensity: 0.28, size: 40, pulseSeconds: 3.8, pulseAmount: 0.55 },
        ],
      },
      prose:
        "INT. A RENTAL HOUSE WITH NO ADDRESS ON THE DOOR — NIGHT. The chain opens before Jack knocks. DAVID VOSS stands behind it in shirtsleeves, one hand on the lock and the other close to a pistol.",
      dialogueBeats: [
        {
          id: "nw3_dv_j1",
          characterId: "jack",
          expression: "hands visible",
          text: "David Voss. Your wife hired me to find you.",
        },
        {
          id: "nw3_dv_d1",
          characterId: "david",
          expression: "a smile without welcome",
          text: "No. Vera hired you to be found beside me. There is a difference.",
        },
        {
          id: "nw3_dv_j2",
          characterId: "jack",
          expression: "V.O.",
          text: "He was not handsome in the way the photograph wanted him to be. He had the face of a man who had learned that fear made people economical.",
        },
        {
          id: "nw3_dv_d2",
          characterId: "david",
          expression: "letting Jack in because he has already decided the room is his",
          text: "She found the accounts, didn't she? Her hand in the drawer. Her eyes on the columns. She always did think being quiet meant being invisible.",
        },
        {
          id: "nw3_dv_j3",
          characterId: "jack",
          expression: "careful",
          text: "How long have you been taking it?",
        },
        {
          id: "nw3_dv_d3",
          characterId: "david",
          expression: "almost proud",
          text: "Six years. A little from one account, a little from another. I never touched the same drawer twice in a month. Solomon counts money. He doesn't count dust.",
        },
        {
          id: "nw3_dv_j4",
          characterId: "jack",
          expression: "flat",
          text: "Two hundred and eleven thousand dollars is not dust.",
        },
        {
          id: "nw3_dv_d4",
          characterId: "david",
          expression: "the pride going cold",
          text: "It was when it was spread out. Then Vera got curious. I noticed her in the accounts. I moved it before she reached the last page.",
        },
        {
          id: "nw3_dv_d5",
          characterId: "david",
          expression: "quiet, dangerous",
          text: "The money is somewhere nobody can point to. No account. No locker. No second key. Nobody alive knows where it is but me, and I am about to become a very difficult man to question.",
        },
        {
          id: "nw3_dv_j5",
          characterId: "jack",
          expression: "V.O.",
          text: "He said that like a threat. He meant it like a scheduling note. David had made a career out of putting the human part after the arithmetic.",
        },
        {
          id: "nw3_dv_d6",
          characterId: "david",
          expression: "sitting, pistol on his knee",
          text: "Vera will tell you she is frightened. She is. Fear is just greed with a better publicist. She wants the money, wants Solomon gone, wants to leave me in a hole and call the hole a marriage.",
        },
        {
          id: "nw3_dv_j6",
          characterId: "jack",
          expression: "low",
          text: "You were never nice to her.",
        },
        {
          id: "nw3_dv_d7",
          characterId: "david",
          expression: "without shame",
          text: "Nice is what people call a man after he stops being useful. I was Solomon's man. I broke hands, took houses, and made sure the books closed. Don't ask me to become a different man because my wife found a number.",
        },
        {
          id: "nw3_dv_r_money",
          characterId: "david",
          expression: "smiling at the locked door",
          conditionRule: { requiresFlags: ["nw3_asked_money"] },
          text: "If I gave you an address, it would become your address. I moved the money because I noticed her. I will die before I give you the rest of that sentence.",
        },
        {
          id: "nw3_dv_r_killer",
          characterId: "david",
          expression: "a flash of real fear",
          conditionRule: { requiresFlags: ["nw3_told_david_killer"] },
          text: "Then she finally learned arithmetic. A debt, a payment, a body. You are the receipt she hopes the police read first.",
        },
        {
          id: "nw3_dv_r_leave",
          characterId: "david",
          expression: "dismissive",
          conditionRule: { requiresFlags: ["nw3_left_david_alone"] },
          text: "Good. Go tell Vera you saw a man who never asked to be forgiven. It will make her feel safer for almost a minute.",
        },
      ],
      choices: [
        {
          id: "nw3_dv_q_money",
          text: "\"Where did you put it?\"",
          targetSceneId: "",
          reply: true,
          exclusiveGroup: "nw3_dv1",
          attitudeTag: "Clever",
          consequences: {
            setFlags: ["nw3_asked_money"],
            meterChanges: [{ meter: "Clever", delta: 1 }],
          },
        },
        {
          id: "nw3_dv_q_vera",
          text: "\"You know Vera paid somebody to stop you.\"",
          targetSceneId: "",
          reply: true,
          exclusiveGroup: "nw3_dv1",
          attitudeTag: "Aggressive",
          consequences: {
            setFlags: ["nw3_told_david_killer"],
            meterChanges: [{ meter: "Aggressive", delta: 1 }, { meter: "Suspicion", delta: 1 }],
          },
        },
        {
          id: "nw3_dv_q_leave",
          text: "\"I am not here to save you.\"",
          targetSceneId: "",
          reply: true,
          exclusiveGroup: "nw3_dv1",
          attitudeTag: "Neutral",
          consequences: { setFlags: ["nw3_left_david_alone"] },
        },
        {
          id: "nw3_dv_next",
          text: "Leave David with his locked door.",
          targetSceneId: "nw3_confession",
          hidden: true,
          attitudeTag: "Neutral",
          gating: {
            requiresFlags: ["nw3_asked_money", "nw3_told_david_killer", "nw3_left_david_alone"],
            requiresAll: false,
          },
        },
      ],
      hotspots: [
        {
          id: "nw3_dv_bag",
          label: "The empty space beside the door",
          bounds: { x: 8, y: 58, w: 24, h: 28 },
          cursor: "look",
          isRepeatable: true,
          action: {
            type: "showText",
            text: "A rectangular dust mark on the floor. Something heavy sat there recently. It is gone now.",
          },
        },
        {
          id: "nw3_dv_pistol",
          label: "David's pistol",
          bounds: { x: 56, y: 58, w: 18, h: 18 },
          cursor: "look",
          isRepeatable: true,
          action: {
            type: "showText",
            text: "Clean, oiled, and held low. David handles it like he handled everything else: without excitement and without regret.",
          },
        },
      ],
      onEnterActions: [
        { consequences: { setFlags: ["nw3_money_moved", "nw3_david_seen"] } },
      ],
    },

    /* ================================================================ */
    /* ACT TWO — VERA'S CONFESSION                                      */
    /* ================================================================ */
    {
      id: "nw3_confession",
      title: "Act Two — The Woman Who Bought a Witness",
      background: "/img/bg-vera-window.jpg",
      ambientAudio: "rain",
      musicMode: "none",
      transition: "fade-black",
      transitionSpeed: 1.3,
      letterbox: true,
      cinematic: {
        mode: "zoom-hold",
        focalPoint: "52% 42%",
        zoomDuration: 32,
        dimAmount: 0.3,
        lights: [
          { x: 24, y: 28, color: "#ff2e88", intensity: 0.2, size: 34, pulseSeconds: 4.4, pulseAmount: 0.7 },
          { x: 74, y: 34, color: "#ffb761", intensity: 0.18, size: 36, pulseSeconds: 5.2, pulseAmount: 0.4 },
        ],
      },
      onEnterActions: [{ consequences: { setFlags: ["nw3_vera_confessed"] } }],
      prose:
        "INT. VERA'S APARTMENT — NIGHT. A single lamp. The debt notice on the table. Vera has taken off her coat but not her shoes, as if the room is only a place to pause before the next decision.",
      dialogueBeats: [
        {
          id: "nw3_c_v1",
          characterId: "vera",
          expression: "standing by the window",
          text: "I found the skim in David's accounts. I thought the hidden money was still where he kept it. You found something else tonight.",
        },
        {
          id: "nw3_c_j1",
          characterId: "jack",
          expression: "quiet",
          text: "I found out he was a thief. I did not find out where he put the money.",
        },
        {
          id: "nw3_c_v2",
          characterId: "vera",
          expression: "a small nod, no surprise",
          text: "I thought it was. That was the problem. My whole plan was built around the money being somewhere I could touch.",
        },
        {
          id: "nw3_c_j2",
          characterId: "jack",
          expression: "flat",
          text: "Your plan.",
        },
        {
          id: "nw3_c_v3",
          characterId: "vera",
          expression: "the mask coming off because there is no use for it now",
          text: "I found the skim in David's accounts. Six years. Small amounts. Careful amounts. He thought Solomon would never see it, and Solomon never did. I was the only living person besides David who knew he was stealing, and the only one who could prove it.",
        },
        {
          id: "nw3_c_j3",
          characterId: "jack",
          expression: "V.O.",
          text: "There it was. The clean center of the dirty story. Vera had not guessed. She had found it. She had carried it alone until carrying it became another word for drowning. She still did not know David had seen her in the accounts or moved the money before he died.",
        },
        {
          id: "nw3_c_v4",
          characterId: "vera",
          expression: "controlled, factual, which makes it worse",
          text: "I paid Moe to kill him. Cash. Privately. Off the books. Solomon's man, but not Solomon's order.",
        },
        {
          id: "nw3_c_j4",
          characterId: "jack",
          expression: "very quiet",
          text: "Moe.",
        },
        {
          id: "nw3_c_v5",
          characterId: "vera",
          expression: "shaking now, angry at the shaking",
          text: "My debt gave me access to Solomon's orbit. I could ask for a favor without anybody asking why I was in the room. I found the man who would take cash and keep his mouth shut. I gave him the name and the time.",
        },
        {
          id: "nw3_c_j5",
          characterId: "jack",
          expression: "V.O.",
          text: "She had built a murder out of access, cash, and one man's reputation for silence. She had also made David's death sound like a task she had scheduled between two cups of coffee.",
        },
        {
          id: "nw3_c_v6",
          characterId: "vera",
          expression: "barely audible",
          text: "David dies. I take the hidden money. I clear Solomon. I leave Blackwood. That was the plan. It was the only plan I had that ended anywhere.",
        },
        {
          id: "nw3_c_j6",
          characterId: "jack",
          expression: "hard",
          text: "And me?",
        },
        {
          id: "nw3_c_v7",
          characterId: "vera",
          expression: "she cannot make this gentler",
          text: "You were insurance. If the killing got attention, the police would find a private detective's file. A frightened wife who hired somebody to find her missing husband. You were supposed to be the first clean fact in the room.",
        },
        {
          id: "nw3_c_j7",
          characterId: "jack",
          expression: "V.O. — devastated but steady",
          text: "I was not a detective to her. I was a timestamp. Proof she had looked for David before she had him killed.",
        },
        {
          id: "nw3_c_v8",
          characterId: "vera",
          expression: "looking at him for the first time",
          text: "I did not expect you to find him. I expected you to be visible. I did not expect you to become a person.",
        },
        {
          id: "nw3_c_j8",
          characterId: "jack",
          expression: "quiet, with no defense left",
          text: "That is the trouble with people. They keep becoming people after you have already made your plan.",
        },
        {
          id: "nw3_c_v9",
          characterId: "vera",
          expression: "a small break",
          text: "Don't say you love me.",
        },
        {
          id: "nw3_c_j9",
          characterId: "jack",
          expression: "V.O.",
          text: "I had been in love with her since she told me not to promise what I could not pay. The fact that she knew before I said it was the most Vera thing about her.",
        },
      ],
      choices: [
        {
          id: "nw3_c_love",
          text: "\"I love you. I know what you used me for.\"",
          targetSceneId: "nw3_kill",
          attitudeTag: "Sultry",
          consequences: {
            setFlags: ["nw3_jack_loves_vera"],
            meterChanges: [{ meter: "Sultry", delta: 1 }],
            trustChanges: [{ characterId: "vera", delta: 2 }],
          },
          memoryLog: "nw3_love_confessed",
          rememberLine: "Vera will remember that.",
        },
        {
          id: "nw3_c_professional",
          text: "\"I am still your detective. Tell me when Moe is coming.\"",
          targetSceneId: "nw3_kill",
          attitudeTag: "Clever",
          consequences: {
            setFlags: ["nw3_kept_professional"],
            meterChanges: [{ meter: "Clever", delta: 1 }],
          },
        },
        {
          id: "nw3_c_stop",
          text: "\"Can you stop him?\"",
          targetSceneId: "nw3_kill",
          attitudeTag: "Aggressive",
          consequences: {
            setFlags: ["nw3_asked_stop_moe"],
            meterChanges: [{ meter: "Aggressive", delta: 1 }],
          },
        },
      ],
      hotspots: [
        {
          id: "nw3_c_receipt",
          label: "The carbon receipt for cash",
          bounds: { x: 58, y: 58, w: 22, h: 20 },
          cursor: "take",
          showItemImage: true,
          isRepeatable: false,
          action: {
            type: "giveItem",
            itemGranted: "nw3_moe_receipt",
            flagSet: "nw3_offbook_seen",
          },
        },
        {
          id: "nw3_c_window",
          label: "The window over the street",
          bounds: { x: 4, y: 12, w: 28, h: 40 },
          cursor: "look",
          isRepeatable: true,
          action: {
            type: "showText",
            text: "No black sedan now. The absence is not relief. It is a change in the schedule.",
          },
        },
      ],
    },

    /* ================================================================ */
    /* ACT TWO — THE KILL                                               */
    /* ================================================================ */
    {
      id: "nw3_kill",
      title: "Act Two — The Appointment",
      nodeType: "cutscene",
      background: "/img/nw2/bg-yard-night.jpg",
      ambientAudio: "rain",
      particles: "storm",
      musicMode: "none",
      transition: "fade-black",
      transitionSpeed: 1.4,
      letterbox: true,
      choiceDelaySeconds: 5,
      cinematic: {
        mode: "shake",
        shakeAmount: 0.22,
        shakeDuration: 0.6,
        dimAmount: 0.4,
        lights: [
          { x: 76, y: 30, color: "#2a6cff", intensity: 0.26, size: 40, pulseSeconds: 1.9, pulseAmount: 1 },
          { x: 84, y: 34, color: "#ff2e3c", intensity: 0.24, size: 38, pulseSeconds: 2.3, pulseAmount: 1 },
        ],
      },
      prose:
        "EXT. DAVID'S RENTAL — LATER. Jack arrives in time to see the upstairs light go out. He has twenty minutes to be a decent man. He spends them getting there.",
      dialogueBeats: [
        {
          id: "nw3_k_j1",
          characterId: "jack",
          expression: "V.O. — urgent, controlled",
          text: "Vera told me the time. She did not tell me to stop it. I went anyway, which is the difference between a detective and an insurance policy when the policy grows a conscience.",
        },
        {
          id: "nw3_k_d1",
          characterId: "david",
          expression: "from inside, amused",
          text: "You came back, Morrow. Did Vera remember to tell you what happens after the money is gone?",
        },
        {
          id: "nw3_k_j2",
          characterId: "jack",
          expression: "at the door",
          text: "Open it, David.",
        },
        {
          id: "nw3_k_d2",
          characterId: "david",
          expression: "the chain drawing tight",
          text: "She sent you to watch. That's what you are. A man standing close enough to be written down later.",
        },
        {
          id: "nw3_k_m1",
          characterId: "moe",
          expression: "from the dark behind Jack",
          text: "Nobody sent him. He came by himself.",
        },
        {
          id: "nw3_k_j3",
          characterId: "jack",
          expression: "turning",
          text: "Moe.",
        },
        {
          id: "nw3_k_d3",
          characterId: "david",
          expression: "recognizing the shape of the night",
          text: "Solomon doesn't know you're here.",
        },
        {
          id: "nw3_k_m2",
          characterId: "moe",
          expression: "flat",
          text: "Solomon doesn't need to know everything.",
        },
        {
          id: "nw3_k_d4",
          characterId: "david",
          expression: "to Jack, a last piece of poison",
          text: "She doesn't love you, Morrow. She buys whatever she can't survive without. You are just the first thing she bought that talks back.",
        },
        {
          id: "nw3_k_j4",
          characterId: "jack",
          expression: "calling out",
          text: "Moe, don't.",
        },
        {
          id: "nw3_k_s1",
          characterId: "jack",
          expression: "the shot; the door slams open into darkness",
          text: "One gunshot. Flat. Close. Like a door slamming.",
          silent: true,
          audioUrl: "/nwt-gunshot.wav",
          background: "gradient:linear-gradient(#000,#000)",
          backgroundTransition: "cut",
        },
        {
          id: "nw3_k_m3",
          characterId: "moe",
          expression: "after the shot, no triumph",
          text: "She paid me. Cash. Off the books. This wasn't Solomon's work.",
        },
        {
          id: "nw3_k_j5",
          characterId: "jack",
          expression: "V.O. — the injury arriving late",
          text: "Moe left through the rain. David Voss stayed on the floor with his eyes open and the money nowhere in the world I could reach.",
        },
        {
          id: "nw3_k_j6",
          characterId: "jack",
          expression: "V.O. — spare",
          text: "He had noticed Vera in the accounts. He had moved the money. Then he died, taking the only address with him. The secret did not become safe. It became ownerless.",
        },
      ],
      choices: [
        {
          id: "nw3_k_go",
          text: "Enter the room after the shot.",
          targetSceneId: "nw3_empty",
          attitudeTag: "Neutral",
          consequences: {
            setFlags: ["nw3_david_dead", "nw3_killer_paid"],
          },
        },
      ],
      hotspots: [],
    },

    /* ================================================================ */
    /* ACT THREE — THE EMPTY ROOM                                       */
    /* ================================================================ */
    {
      id: "nw3_empty",
      title: "Act Three — The Money Is Not There",
      partBreak: "Act Two — The Money Nobody Saw",
      background: "/img/nw2/bg-empty-booth.jpg",
      ambientAudio: "rain",
      particles: "rain",
      musicMode: "none",
      transition: "fade-black",
      transitionSpeed: 1.3,
      letterbox: true,
      cinematic: {
        mode: "static",
        dimAmount: 0.34,
        lights: [
          { x: 30, y: 28, color: "#ff2e88", intensity: 0.18, size: 32, pulseSeconds: 4.2, pulseAmount: 0.65 },
          { x: 70, y: 34, color: "#2ad9d9", intensity: 0.12, size: 38, pulseSeconds: 5.8, pulseAmount: 0.5 },
        ],
      },
      onEnterActions: [{ consequences: { setFlags: ["nw3_empty_room"] } }],
      prose:
        "INT. DAVID'S RENTAL — AFTER. Vera stands in the doorway. She does not look at David first. She looks at the place where the money should be.",
      dialogueBeats: [
        {
          id: "nw3_e_v1",
          characterId: "vera",
          expression: "barely breathing",
          text: "Where is it?",
        },
        {
          id: "nw3_e_j1",
          characterId: "jack",
          expression: "quiet",
          text: "Gone.",
        },
        {
          id: "nw3_e_v2",
          characterId: "vera",
          expression: "the plan trying to survive the room",
          text: "No. He kept it here. He had to. He had nowhere else. There was a bag. There was a safe. There was—",
        },
        {
          id: "nw3_e_j2",
          characterId: "jack",
          expression: "V.O.",
          text: "There was a clean dust mark beside the door and an empty safe with a warmer rectangle inside it. I knew David had moved the money before he died. Vera only knew that it was gone.",
        },
        {
          id: "nw3_e_v3",
          characterId: "vera",
          expression: "a frightened whisper",
          text: "It is gone. Nobody knows where it is.",
        },
        {
          id: "nw3_e_j3",
          characterId: "jack",
          expression: "flat",
          text: "Not anymore.",
        },
        {
          id: "nw3_e_v4",
          characterId: "vera",
          expression: "looking at the body now",
          text: "Moe did it.",
        },
        {
          id: "nw3_e_j4",
          characterId: "jack",
          expression: "quiet",
          text: "Moe said you paid him.",
        },
        {
          id: "nw3_e_v5",
          characterId: "vera",
          expression: "no defense left",
          text: "I did. I told you I did. The part I did not tell you is that I thought the money would still be here when he stopped breathing.",
        },
        {
          id: "nw3_e_j5",
          characterId: "jack",
          expression: "V.O.",
          text: "She had been afraid of Solomon. She had been afraid of David. Now she was afraid of a room with nothing in it, which was the first fear I understood completely.",
        },
        {
          id: "nw3_e_v6",
          characterId: "vera",
          expression: "to Jack, ashamed and furious",
          text: "The file was supposed to protect me. If the police came, they would see you had been looking for him. I would be a wife. I would be a person with a reason to be in the room. I did not mean for you to find him alive.",
        },
        {
          id: "nw3_e_j6",
          characterId: "jack",
          expression: "very quiet",
          text: "You meant for me to be useful.",
        },
        {
          id: "nw3_e_v7",
          characterId: "vera",
          expression: "a small, terrible laugh",
          text: "I meant for you to be innocent. I did not know those were different things until you looked at me like that.",
        },
        {
          id: "nw3_e_j7",
          characterId: "jack",
          expression: "V.O.",
          text: "I loved her then. Not despite the murder. Not because she was frightened. I loved her with the whole ugly account open between us, which is how I knew the feeling was not going to save anybody.",
          recalls: {
            nw3_love_confessed:
              "I had said I loved her. The words did not make the account cleaner. They only made it mine too.",
          },
        },
      ],
      choices: [
        {
          id: "nw3_e_tell",
          text: "Tell Vera the money is gone and the truth is all that remains.",
          targetSceneId: "nw3_rosa",
          attitudeTag: "Neutral",
          consequences: { setFlags: ["nw3_told_vera_money_gone"] },
        },
        {
          id: "nw3_e_hide",
          text: "Hide the empty safe from the police file for now.",
          targetSceneId: "nw3_rosa",
          attitudeTag: "Clever",
          consequences: { setFlags: ["nw3_protected_empty_safe"] },
        },
      ],
      hotspots: [
        {
          id: "nw3_e_safe",
          label: "The empty safe",
          bounds: { x: 66, y: 36, w: 24, h: 42 },
          cursor: "take",
          showItemImage: true,
          isRepeatable: false,
          examine: true,
          examineSeconds: 2.4,
          action: {
            type: "giveItem",
            itemGranted: "nw3_empty_safe",
            flagSet: "nw3_money_moved_seen",
          },
        },
        {
          id: "nw3_e_phone",
          label: "David's phone on the floor",
          bounds: { x: 30, y: 72, w: 18, h: 14 },
          cursor: "look",
          isRepeatable: true,
          action: {
            type: "showText",
            text: "The screen is lit with a missed call from Vera. Three rings. A private appointment, recorded too late.",
          },
        },
      ],
    },

    /* ================================================================ */
    /* ACT THREE — ROSA                                                */
    /* ================================================================ */
    {
      id: "nw3_rosa",
      title: "Act Three — The File Is an Alibi",
      background: "/img/nw2/bg-rosa-car.jpg",
      ambientAudio: "drone",
      musicMode: "none",
      transition: "fade-black",
      transitionSpeed: 1.1,
      letterbox: true,
      cinematic: {
        mode: "static",
        dimAmount: 0.3,
        lights: [
          { x: 32, y: 58, color: "#ffb761", intensity: 0.22, size: 28, pulseSeconds: 6.2, pulseAmount: 0.35 },
          { x: 74, y: 32, color: "#2ad9d9", intensity: 0.14, size: 36, pulseSeconds: 7.2, pulseAmount: 0.4 },
        ],
      },
      prose:
        "INT. ROSA'S PARKED CAR — DAWN. The engine is off. Rain ticks on the roof. Rosa has the folder on her lap and Jack has not yet told her how much of it was written for the police.",
      dialogueBeats: [
        {
          id: "nw3_r_j1",
          characterId: "jack",
          expression: "V.O.",
          text: "Rosa was the only person in Blackwood I could tell a true thing to without first calculating its interest.",
        },
        {
          id: "nw3_r_r1",
          characterId: "rosa",
          expression: "reading the folder",
          text: "This file starts before the body. Dates, calls, places, payments. Vera made sure you were looking for him before anybody could ask why you were near him after.",
        },
        {
          id: "nw3_r_j2",
          characterId: "jack",
          expression: "flat",
          text: "She hired me as insurance.",
        },
        {
          id: "nw3_r_r2",
          characterId: "rosa",
          expression: "not looking up",
          text: "Insurance against what?",
        },
        {
          id: "nw3_r_j3",
          characterId: "jack",
          expression: "quiet",
          text: "The police seeing the killing as a killing instead of a missing-person case.",
        },
        {
          id: "nw3_r_r3",
          characterId: "rosa",
          expression: "a long pause",
          text: "Then the file is not an alibi, Jack. It is a confession that has not found the right reader yet.",
        },
        {
          id: "nw3_r_j4",
          characterId: "jack",
          expression: "V.O.",
          text: "I wanted Rosa to tell me there was a clean way out. She had spent ten years refusing to lie for me. She did not start that morning.",
        },
        {
          id: "nw3_r_r4",
          characterId: "rosa",
          expression: "gentle only because she knows it will hurt",
          text: "David Voss is dead. Solomon knows the money is gone. If you give me the private receipt, I can put Vera somewhere Solomon cannot reach her. It will not be somewhere she wants to be.",
        },
        {
          id: "nw3_r_j5",
          characterId: "jack",
          expression: "low",
          text: "She will hate me.",
        },
        {
          id: "nw3_r_r5",
          characterId: "rosa",
          expression: "looking at him now",
          text: "She already used you. Those are not the same thing.",
        },
        {
          id: "nw3_r_j6",
          characterId: "jack",
          expression: "V.O.",
          text: "The thing about Rosa was that she could separate love from forgiveness. I had never learned how.",
        },
      ],
      choices: [
        {
          id: "nw3_r_share",
          text: "Present Rosa the off-book receipt.",
          targetSceneId: "nw3_solomon_final",
          attitudeTag: "Clever",
          hidden: true,
          presentItem: "nw3_moe_receipt",
          consumePresentedItem: false,
          consequences: { setFlags: ["nw3_evidence_shared"] },
          memoryLog: "nw3_shared_receipt",
          rememberLine: "Rosa will remember that.",
        },
        {
          id: "nw3_r_keep",
          text: "Keep the receipt. Ask Rosa for one honest hour.",
          targetSceneId: "nw3_solomon_final",
          attitudeTag: "Sultry",
          consequences: { setFlags: ["nw3_evidence_kept"] },
        },
      ],
      hotspots: [
        {
          id: "nw3_r_folder",
          label: "The insurance file",
          bounds: { x: 36, y: 42, w: 28, h: 30 },
          cursor: "look",
          isRepeatable: true,
          action: {
            type: "showText",
            text: "Every page says Vera was looking for David. None of them say she had already paid for what would happen when he was found.",
          },
        },
        {
          id: "nw3_r_windshield",
          label: "Rain on the windshield",
          bounds: { x: 28, y: 8, w: 44, h: 30 },
          cursor: "look",
          isRepeatable: true,
          action: {
            type: "showText",
            text: "Two people in a parked car, both facing forward. Some truths only fit when nobody has to look at the other person.",
          },
        },
      ],
    },

    /* ================================================================ */
    /* ACT THREE — SOLOMON'S LAST ROOM                                  */
    /* ================================================================ */
    {
      id: "nw3_solomon_final",
      title: "Act Three — The Price of Being Seen",
      background: "/img/nw2/bg-solomon-office.jpg",
      ambientAudio: "drone",
      particles: "smoke",
      musicMode: "none",
      transition: "fade-black",
      transitionSpeed: 1.2,
      letterbox: true,
      cinematic: {
        mode: "dolly",
        focalPoint: "50% 48%",
        dollyDistance: 3,
        dollyDuration: 26,
        dimAmount: 0.26,
        lights: [
          { x: 68, y: 30, color: "#ffb761", intensity: 0.28, size: 32, pulseSeconds: 5.8, pulseAmount: 0.4 },
          { x: 18, y: 46, color: "#2ad9d9", intensity: 0.1, size: 38, pulseSeconds: 8, pulseAmount: 0.35 },
        ],
      },
      prose:
        "INT. SOLOMON'S OFFICE — MORNING. The heater ticks. The same chair is empty. Solomon has a new folder on the desk: David's name on the tab, Vera's debt underneath it, and Jack's file beside both.",
      dialogueBeats: [
        {
          id: "nw3_sf_s1",
          characterId: "solomon",
          expression: "unhurried",
          text: "David Voss is dead. Moe has gone quiet. Two hundred and eleven thousand dollars is missing, and every person who might know where it went is either frightened or dead.",
        },
        {
          id: "nw3_sf_j1",
          characterId: "jack",
          expression: "flat",
          text: "David was one of your men. He was not nice.",
        },
        {
          id: "nw3_sf_s2",
          characterId: "solomon",
          expression: "mild",
          text: "I did not say he was. I said he was mine. Those are different kinds of ownership.",
        },
        {
          id: "nw3_sf_j2",
          characterId: "jack",
          expression: "quiet",
          text: "Vera is afraid of you.",
        },
        {
          id: "nw3_sf_s3",
          characterId: "solomon",
          expression: "almost sympathetic",
          text: "Vera is afraid of a number that has her name on it. I have never had to frighten her. Her father did the work. The paper kept it warm.",
        },
        {
          id: "nw3_sf_j3",
          characterId: "jack",
          expression: "V.O.",
          text: "There is no clean way to stand in a room with a man who can turn your love into a line item. You can only decide which part of yourself you are willing to let him price.",
        },
        {
          id: "nw3_sf_s4",
          characterId: "solomon",
          expression: "studying Jack",
          text: "You are in love with her. That is unfortunate. Love makes people offer assets they have mistaken for virtues.",
        },
        {
          id: "nw3_sf_j4",
          characterId: "jack",
          expression: "very quiet",
          text: "I am offering you a choice. Leave her debt where it is and let the police read the file, or take what I have and leave her name out of your mouth.",
        },
        {
          id: "nw3_sf_s5",
          characterId: "solomon",
          expression: "genuinely interested",
          text: "What do you imagine you have?",
        },
        {
          id: "nw3_sf_j5",
          characterId: "jack",
          expression: "V.O.",
          text: "Sixteen years of files. A license. A reputation for being the one man in town who did not sell a witness. I had built a life out of not handing things over. Then Vera put her hand on the table and I started counting what I could lose.",
          recalls: {
            nw3_shared_receipt:
              "I had handed Rosa the receipt. The private murder was no longer mine to hide, and love was no longer a defense I could pretend was neutral.",
          },
        },
        {
          id: "nw3_sf_s6",
          characterId: "solomon",
          expression: "quiet",
          text: "The money is gone. Vera's debt is not. Your file is not. The question is which one of you I should believe when the police ask what happened in that room.",
        },
      ],
      choices: [
        {
          id: "nw3_sf_truth",
          text: "Give Solomon Vera's confession and Moe's name.",
          targetSceneId: "nw3_end_truth",
          attitudeTag: "Clever",
          gating: { requiresFlags: ["nw3_evidence_shared"] },
          consequences: { setFlags: ["nw3_told_truth"] },
        },
        {
          id: "nw3_sf_debt",
          text: "Put the debt on Jack. Offer the license, the file, and his name.",
          targetSceneId: "nw3_end_sacrifice",
          attitudeTag: "Sultry",
          consequences: { setFlags: ["nw3_jack_debt"] },
        },
        {
          id: "nw3_sf_alibi",
          text: "Keep Vera's name out. The insurance file is enough.",
          targetSceneId: "nw3_end_alibi",
          attitudeTag: "Neutral",
          consequences: { setFlags: ["nw3_kept_alibi"] },
        },
        {
          id: "nw3_sf_empty",
          text: "Tell him the truth: nobody knows where the money is.",
          targetSceneId: "nw3_end_empty",
          attitudeTag: "Aggressive",
          consequences: { setFlags: ["nw3_admitted_money_gone"] },
        },
      ],
      hotspots: [
        {
          id: "nw3_sf_files",
          label: "The three folders on the desk",
          bounds: { x: 40, y: 52, w: 42, h: 26 },
          cursor: "look",
          isRepeatable: true,
          action: {
            type: "showText",
            text: "David's name. Vera's debt. Jack's file. Solomon has arranged them in the order a person becomes evidence.",
          },
        },
        {
          id: "nw3_sf_heater",
          label: "The ticking heater",
          bounds: { x: 8, y: 56, w: 22, h: 28 },
          cursor: "look",
          isRepeatable: true,
          action: {
            type: "showText",
            text: "Tick. Tick. The room does not need a clock. Solomon has already decided what time it is.",
          },
        },
      ],
    },

    /* ================================================================ */
    /* ENDINGS                                                          */
    /* ================================================================ */
    {
      id: "nw3_end_truth",
      title: "Ending — The Clean Confession",
      background: "/img/bg-end-gold.jpg",
      ambientAudio: "rain",
      musicMode: "track",
      musicUrl: "/nobodys-witness.mp3",
      musicLevel: 0.48,
      transition: "fade-black",
      transitionSpeed: 1.6,
      letterbox: true,
      isEnding: true,
      endingData: {
        tier: "victory-silver",
        headline: "THE CLEAN CONFESSION",
        recap:
          "Jack gave Rosa the receipt, gave Solomon the name, and refused to let Vera's insurance file become a lie. Vera is alive. The money is still missing. Jack is still in love with her, which is not the same as saving her.",
      },
      prose:
        "I gave Rosa the receipt before I went upstairs. I gave Solomon the confession after. Vera did not look at me while they put the cuffs on. She kept looking at the empty place where the money should have been, as if the right number might still turn up and make the story kinder.",
      dialogueBeats: [
        {
          id: "nw3_et_v1",
          characterId: "vera",
          expression: "at the courthouse door, wrists together",
          text: "You did the right thing.",
        },
        {
          id: "nw3_et_j1",
          characterId: "jack",
          expression: "quiet",
          text: "I know.",
        },
        {
          id: "nw3_et_v2",
          characterId: "vera",
          expression: "a small, exhausted smile",
          text: "That is not the same as being able to live with it.",
        },
        {
          id: "nw3_et_j2",
          characterId: "jack",
          expression: "V.O.",
          text: "She hired me to be seen. I was the first thing in the whole story that saw her back. By the time I understood what that meant, it was too late to make seeing her kind.",
        },
        {
          id: "nw3_et_v3",
          characterId: "vera",
          expression: "turning away",
          text: "Don't wait for me, Jack.",
        },
        {
          id: "nw3_et_j3",
          characterId: "jack",
          expression: "V.O. — final",
          text: "I waited anyway. Not for the case. Not for the money. For the part of her that had never been an insurance policy. Nobody came to testify for it. Nobody had to. I knew what it was, and I loved her with that knowledge sitting in the room.",
        },
      ],
      choices: [],
      hotspots: [],
    },
    {
      id: "nw3_end_sacrifice",
      title: "Ending — The Debt With Jack's Name",
      background: "/img/bg-end-vera.jpg",
      ambientAudio: "rain",
      musicMode: "track",
      musicUrl: "/nobodys-witness.mp3",
      musicLevel: 0.55,
      transition: "fade-black",
      transitionSpeed: 1.6,
      letterbox: true,
      isEnding: true,
      endingData: {
        tier: "victory-gold",
        headline: "THE DEBT WITH JACK'S NAME",
        recap:
          "Jack put his license, his files, and his name on Vera's debt. Solomon closed her account and kept Jack in the orbit. Vera left the city with no money and one unbearable freedom: she never asked him to do it.",
      },
      prose:
        "I put sixteen years on Solomon's desk. My license. My files. The one clean fact in Blackwood that had ever belonged to me. Solomon closed Vera's debt and wrote my name beneath it.",
      dialogueBeats: [
        {
          id: "nw3_es_s1",
          characterId: "solomon",
          expression: "signing without looking up",
          text: "Vera Voss owes me nothing. Jack Morrow owes me his working life. The money remains missing.",
        },
        {
          id: "nw3_es_v1",
          characterId: "vera",
          expression: "at the bus station, carrying one bag",
          text: "I did not ask you to do that.",
        },
        {
          id: "nw3_es_j1",
          characterId: "jack",
          expression: "quiet",
          text: "I know.",
        },
        {
          id: "nw3_es_v2",
          characterId: "vera",
          expression: "breaking through the anger",
          text: "Then don't call it love. You took my debt and made yourself another man who gets to decide what I owe.",
        },
        {
          id: "nw3_es_j2",
          characterId: "jack",
          expression: "V.O.",
          text: "She left on the six o'clock bus with no money, no debt, and no reason to come back. I stayed above the feed store and learned how a man can be free of the woman he saved and still not be free of her.",
        },
        {
          id: "nw3_es_v3",
          characterId: "vera",
          expression: "through the closing bus door",
          text: "You were the only good thing I did wrong.",
        },
        {
          id: "nw3_es_j3",
          characterId: "jack",
          expression: "V.O. — final",
          text: "The bus went out of town. The money stayed nowhere. Solomon kept my name. Vera kept the part of me she had never asked for. That was the heartbreak: I got exactly what I wanted for her, and she got exactly what she was afraid of.",
        },
      ],
      choices: [],
      hotspots: [],
    },
    {
      id: "nw3_end_alibi",
      title: "Ending — The File Holds",
      background: "/img/bg-end-warn.jpg",
      ambientAudio: "rain",
      musicMode: "none",
      transition: "fade-black",
      transitionSpeed: 1.6,
      letterbox: true,
      isEnding: true,
      endingData: {
        tier: "victory-silver",
        headline: "THE FILE HOLDS",
        recap:
          "Jack kept Vera's name out of the report. The file held long enough for her to leave, but Solomon kept the debt open and the missing money kept the city looking. She left alone. Jack stayed with the lie he had built for her.",
      },
      prose:
        "I kept the receipt in the drawer and wrote the clean version. David Voss was found dead. Vera Voss had hired me to find him. No one could prove she knew what would happen. The file held.",
      dialogueBeats: [
        {
          id: "nw3_ea_v1",
          characterId: "vera",
          expression: "at the diner, before dawn",
          text: "You can come with me.",
        },
        {
          id: "nw3_ea_j1",
          characterId: "jack",
          expression: "flat",
          text: "No. If I come, the file becomes a lie with two witnesses.",
        },
        {
          id: "nw3_ea_v2",
          characterId: "vera",
          expression: "softly",
          text: "It was a lie when I hired you.",
        },
        {
          id: "nw3_ea_j2",
          characterId: "jack",
          expression: "V.O.",
          text: "She was right. The only honest part of it was the part I had not written: I loved her. I loved her enough to let her leave without making my love another thing she had to carry.",
        },
        {
          id: "nw3_ea_v3",
          characterId: "vera",
          expression: "at the door",
          text: "If the money turns up, don't find me.",
        },
        {
          id: "nw3_ea_j3",
          characterId: "jack",
          expression: "V.O. — final",
          text: "The money never turned up. Solomon kept the debt. Vera got three counties away before sunrise. Nobody saw her go except me, and I was not a witness she could use anymore. I was only a man who loved her and let the door close.",
        },
      ],
      choices: [],
      hotspots: [],
    },
    {
      id: "nw3_end_empty",
      title: "Ending — Nobody Knows",
      background: "/img/bg-end-vanish.jpg",
      ambientAudio: "rain",
      musicMode: "track",
      musicUrl: "/nobodys-witness.mp3",
      musicLevel: 0.42,
      transition: "fade-black",
      transitionSpeed: 1.8,
      letterbox: true,
      isEnding: true,
      endingData: {
        tier: "gameover",
        headline: "NOBODY KNOWS",
        recap:
          "Jack told Solomon the money was gone and refused every trade. Vera disappeared before morning. Solomon kept the debt open, the police kept the file, and nobody alive knew where David put the money. Jack remained the only witness to a love that had begun as paperwork.",
      },
      prose:
        "I told Solomon the truth. Nobody knew where the money was. Nobody could pay Vera's debt. Nobody could prove who ordered the shot. The room stayed quiet because the truth had finally run out of useful shapes.",
      dialogueBeats: [
        {
          id: "nw3_ee_s1",
          characterId: "solomon",
          expression: "at the office door",
          text: "Then the debt remains. That is what a debt does when nobody pays it.",
        },
        {
          id: "nw3_ee_j1",
          characterId: "jack",
          expression: "V.O.",
          text: "Vera was gone when I got back to the diner. Her cup was still on the table. Cold. Untouched. The last thing she left in Blackwood was something she had never meant as a message.",
        },
        {
          id: "nw3_ee_v1",
          characterId: "vera",
          expression: "V.O. — remembered, from the first night",
          text: "Don't make promises you can't pay.",
        },
        {
          id: "nw3_ee_j2",
          characterId: "jack",
          expression: "V.O. — final",
          text: "I had promised nothing. I had paid everything. She had hired me to be seen, and I had seen her too late. David was dead. The money was nowhere. Vera was gone. Nobody was left to say what happened, which is how a town like Blackwood keeps its secrets: it leaves one man alive and calls that silence.",
        },
      ],
      choices: [],
      hotspots: [],
    },
    {
      id: "nw3_end_refusal",
      title: "Ending — No Insurance",
      background: "/img/bg-end-refusal.jpg",
      ambientAudio: "rain",
      musicMode: "none",
      transition: "fade-black",
      transitionSpeed: 1.4,
      letterbox: true,
      isEnding: true,
      endingData: {
        tier: "gameover",
        headline: "NO INSURANCE",
        recap:
          "Jack refused the case before he knew what Vera was buying. David still died, the money still vanished, and Vera never got a private detective's file to stand between her and the police.",
      },
      prose:
        "I slid the folder back. Vera took it without arguing. That was the first clean decision either of us made, and it did not save her.",
      dialogueBeats: [
        {
          id: "nw3_er_v1",
          characterId: "vera",
          expression: "standing",
          text: "Thank you for being honest.",
        },
        {
          id: "nw3_er_j1",
          characterId: "jack",
          expression: "V.O.",
          text: "Three nights later David Voss was dead, two hundred and eleven thousand dollars was missing, and the police had no folder proving Vera had ever tried to find him. I read about it in the morning paper.",
        },
        {
          id: "nw3_er_j2",
          characterId: "jack",
          expression: "V.O. — final",
          text: "She had been afraid of Solomon. She had been right to be. I had fallen in love with a woman I never took the trouble to know, and by the time I understood that, she was already somebody else's evidence.",
        },
      ],
      choices: [],
      hotspots: [],
    },
  ],
};
