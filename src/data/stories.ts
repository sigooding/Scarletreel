import type { Story } from "../types";
import { FULL_THROTTLE } from "./fullThrottle";
import { NOBODYS_WITNESS_FLAGSHIP } from "./nobodysWitnessFlagship";
import { LAST_CALL_ON_PIER_7 } from "./lastCallOnPier7";
import { QTE_DEMO } from "./qteDemo";
import { PERK_RANGE } from "./perkRange";
import { PATTERN_PUZZLE_DEMO } from "./patternPuzzleDemo";
import { MAP_DEMO } from "./mapDemo";
import { TINTIN_MERIDIAN } from "./tintinMeridian";
import { THROTTLE_ASH } from "./throttleAsh";
import { KINGFISHER_JOB } from "./kingfisherJob";
import { BUMPY_NIGHT } from "./allAboutEve";
import { NOBODYS_WITNESS_DRAFT } from "./nobodysWitnessDraft";
import { NOBODYS_WITNESS_NEW } from "./nobodysWitnessNew";
import { NOBODYS_WITNESS_FINAL } from "./nobodysWitnessFinal";
import { SCREENING_ROOM } from "./screeningRoom";import { STUDIO_TUTORIAL } from "./studioTutorial";
import { NEON_DINER } from "./neonDiner";
import { DEMO_LIE } from "./demoLie";
import { DEMO_CONVERSATION } from "./demoConversation";
import { DEMO_SCENE_CRAFT } from "./demoSceneCraft";
import { DEMO_STRUCTURE } from "./demoStructure";
import { THE_LATE_SHIFT } from "./theLateShift";
import { THE_LATE_SHIFT_REIMAGINED } from "./theLateShiftReimagined";
import { THE_LATE_SHIFT_REDUX } from "./theLateShiftRedux";
import { NOBODYS_WITNESS_TRUE } from "./nobodysWitnessTrue";

/**
 * The playable catalogue.
 *
 * The two smoke-test demos ship alongside the features they exercise, exactly
 * as the Studio Instruction Manual describes them (§7 "QUICK-TIME DEMO CASE",
 * §8 "TESTING THE PERKS"):
 * - QTE_DEMO ("Quick-Time Demo") — smoke-test for quick-time prompts: the big
 *   banner, the countdown ring, heartbeat + shaky cam, and the "you hesitated"
 *   expiry branch.
 * - PERK_RANGE ("The Perk Range") — a four-station proving ground for the
 *   Velvet Tongue / Iron Nerve / Sharp Eye / HEAT perks.
 * - PATTERN_PUZZLE_DEMO — the ledger/cipher mini-game, retry vs one-shot.
 *
 * The three "Demo Lab" cases are step-by-step TEACHING reels: every scene
 * carries a 📝 author note (visible on its Studio canvas card, editable in the
 * Scene tab's "Author note" box) explaining how the scene was built, click by
 * click, in Studio. Open them in 🎬 Studio Editor to read the notes, press
 * ▶ Play to feel the feature:
 * - DEMO_CONVERSATION ("Demo Lab: Conversation") — characters, dialogue beats,
 *   💬 reply choices, hidden sequential questions, memoryLog recalls ({said}),
 *   and the present-item verb.
 * - DEMO_SCENE_CRAFT ("Demo Lab: Scene Craft") — credits title sequence,
 *   camera modes, foreground anchor, animated lights + flare, particles,
 *   letterbox, hold-to-EXAMINE hotspots, music crossfades and auto-advance.
 * - DEMO_STRUCTURE ("Demo Lab: Branching Reel") — consequences & meters,
 *   exclusive groups, gating with hints, quick-time timeout branches, part
 *   breaks, acts, ending tiers and the heat bust.
 * - DEMO_LIE ("Demo Lab: Press the Lie") — the contradiction verb: a 🎯
 *   "press them on that" beat where the player must present the evidence
 *   that proves a claim false. Teaches breaking-evidence vs red herrings,
 *   the caught/bluff beats, wrong-evidence limits, trust/heat swings, and a
 *   lie inside an interrogation (composureDamage cracks the suspect).
 *
 * The other story files still live in src/data/ and every image, video and
 * audio asset is untouched in public/ — to bring one back, import it here and
 * add it to the array.
 *
 * Previously: ASHFORD_VANISHING, WOLF_AT_THE_DOOR, LAST_SET, COPPER_QUEEN,
 * NOBODYS_WITNESS, LOW_MIDNIGHT, JUNGLE_JUNIPER, WAR_OF_THE_WORLDS, PULP_REEL,
 * BLACKWOOD_LEDGER, PIER_FOUR, SOUR_NOTE, GILDED_GUILLOTINE, WOMAN_TWICE,
 * VELVET_ALIBI, STATIC_MARLOWE, GLASS_HOUR, THE_THING, CONFESSION, LAST_REEL,
 * VELVET_STING, satin, neon, sandbox, velvet, waltz, bulletDark.
 */
export const STORIES: Story[] = [
  FULL_THROTTLE,
  THROTTLE_ASH,
  NOBODYS_WITNESS_TRUE,
  NOBODYS_WITNESS_FINAL,
  NOBODYS_WITNESS_NEW,
  THE_LATE_SHIFT_REDUX,
  THE_LATE_SHIFT_REIMAGINED,
  THE_LATE_SHIFT,
  STUDIO_TUTORIAL,
  DEMO_CONVERSATION,
  DEMO_SCENE_CRAFT,
  DEMO_STRUCTURE,
  DEMO_LIE,
  NEON_DINER,
  NOBODYS_WITNESS_FLAGSHIP,
  LAST_CALL_ON_PIER_7,
  NOBODYS_WITNESS_DRAFT,
  SCREENING_ROOM,
  QTE_DEMO,
  PERK_RANGE,
  PATTERN_PUZZLE_DEMO,
  MAP_DEMO,
  TINTIN_MERIDIAN,
  KINGFISHER_JOB,
  BUMPY_NIGHT,
];
