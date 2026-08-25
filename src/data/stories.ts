import type { Story } from "../types";
import { NOBODYS_WITNESS_FLAGSHIP } from "./nobodysWitnessFlagship";
import { LAST_CALL_ON_PIER_7 } from "./lastCallOnPier7";
import { QTE_DEMO } from "./qteDemo";
import { PERK_RANGE } from "./perkRange";
import { PATTERN_PUZZLE_DEMO } from "./patternPuzzleDemo";
import { NOBODYS_WITNESS_DRAFT } from "./nobodysWitnessDraft";
import { SCREENING_ROOM } from "./screeningRoom";import { STUDIO_TUTORIAL } from "./studioTutorial";
import { NEON_DINER } from "./neonDiner";

/**
 * The playable catalogue.
 *
 * The two demo cases ship alongside the features they exercise, exactly as the
 * Studio Instruction Manual describes them (§7 "QUICK-TIME DEMO CASE",
 * §8 "TESTING THE PERKS"):
 * - QTE_DEMO ("Quick-Time Demo") — smoke-test for quick-time prompts: the big
 *   banner, the countdown ring, heartbeat + shaky cam, and the "you hesitated"
 *   expiry branch.
 * - PERK_RANGE ("The Perk Range") — a four-station proving ground for the
 *   Velvet Tongue / Iron Nerve / Sharp Eye / HEAT perks.
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
export const STORIES: Story[] = [STUDIO_TUTORIAL, NEON_DINER, NOBODYS_WITNESS_FLAGSHIP, LAST_CALL_ON_PIER_7, NOBODYS_WITNESS_DRAFT, SCREENING_ROOM, QTE_DEMO, PERK_RANGE, PATTERN_PUZZLE_DEMO];
