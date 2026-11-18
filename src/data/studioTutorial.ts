import type { Story } from "../types";

/**
 * STUDIO TUTORIAL — "Getting Started" (extended)
 *
 * A playable guided tour of Studio Mode. Walks a new author through the
 * full pipeline as in-game dialogue with a named character, a findable
 * item, working hotspots, meter changes, a gated choice, and coverage of
 * cinematic / audio / structure / export topics.
 *
 * 12 scenes, 1 character, 1 item, 2 endings, 3 hotspots.
 */
export const STUDIO_TUTORIAL: Story = {
  id: "studio-tutorial",
  title: "Getting Started — Studio Tutorial",
  tagline: "A hands-on tour. Meet a character, find a clue, learn the ropes.",
  coverImage: "gradient:linear-gradient(160deg,#07111e 0%,#1d0c22 55%,#07070c 100%)",
  startSceneId: "tut-welcome",
  items: [
    {
      id: "item_blueprint",
      name: "Studio Blueprint",
      icon: "📐",
      description: "A rough sketch of the Studio workflow, scrawled on the back of a napkin.",
      flavorText: "Build → Validate → Repair → Play → Publish.",
      isClue: true,
    },
  ],
  characters: [
    {
      id: "ch_sam",
      name: "Sam Vane",
      role: "Studio Veteran",
      avatarUrl: "emoji:🕵️",
      trustMeter: 0,
    },
  ],
  scenes: [
    // ── 1. Welcome ────────────────────────────────────────────────────
    {
      id: "tut-welcome",
      title: "Welcome to Studio",
      background: "/img/bg-office.jpg",
      ambientAudio: "drone",
      prose:
        "The rain drums on the office window. A lamp flickers. Somewhere in this building is a story waiting to be told — and you're the one holding the pen.\n\nWelcome to Studio Mode. What you set here IS the game: no code, no compile, no export step. This tour walks you through the tools, hands-on.",
      choices: [
        { id: "c-w-scene", text: "Show me how to build a scene", targetSceneId: "tut-scenes", attitudeTag: "Clever" },
        { id: "c-w-people", text: "Who will I meet? (Characters)", targetSceneId: "tut-people", attitudeTag: "Sultry" },
        { id: "c-w-skip", text: "Skip the tour", targetSceneId: "tut-ending-skip", attitudeTag: "Aggressive" },
      ],
      hotspots: [],
      dialogueBeats: [],
    },

    // ── 2. Scenes & Backgrounds ───────────────────────────────────────
    {
      id: "tut-scenes",
      title: "The Director's Chair",
      background: "/img/bg-alley.jpg",
      ambientAudio: "rain",
      prose: "Rain. An alley. The neon of a club buzzing at the far end. This is a SCENE — a node on your canvas.",
      dialogueBeats: [
        { id: "b-s1", characterId: "narrator", text: "Every scene has a TITLE (shown in the HUD here), a BACKGROUND (picked from the image browser — every built-in location, portrait and sprite in /img and /assets, plus your uploads, plus gradient presets; hover any name for a full preview), and PROSE — this opening text that types in when the player arrives." },
        { id: "b-s2", characterId: "narrator", text: "After the prose, DIALOGUE BEATS play in order. Each beat has a speaker, a line, and optionally its own replacement background image (an 'insert shot'). You can set a recorded MP3 voice per beat too." },
        { id: "b-s3", characterId: "narrator", text: "To add a scene in Studio: click '+ Scene' on the toolbar. To connect it: drag from a choice's coloured handle on the right edge of a card onto another card. That wires the exit. Right-click the canvas for more options (credits, cutscene, end scene, paste)." },
      ],
      choices: [
        { id: "c-s-people", text: "How do I add characters?", targetSceneId: "tut-people", attitudeTag: "Sultry" },
        { id: "c-s-evidence", text: "How do items and hotspots work?", targetSceneId: "tut-evidence", attitudeTag: "Clever" },
      ],
      hotspots: [],
    },

    // ── 3. Characters & Dialogue ──────────────────────────────────────
    {
      id: "tut-people",
      title: "The Cast",
      background: "/img/bg-club.jpg",
      ambientAudio: "jazz",
      prose: "Inside the club, someone is waiting. Meet Sam Vane — a character you'll create in the People tab.",
      dialogueBeats: [
        { id: "b-p1", characterId: "ch_sam", text: "Name's Vane. I'm your tutorial guide — think of me as the detective who's seen it all. In Studio, you'd give me a portrait, a voice, and mark me as a corkboard suspect.", expression: "grizzled" },
        { id: "b-p2", characterId: "ch_sam", text: "Every character gets a Web Speech voice (pick from the system voices, tune pitch and rate, test with a button), or you can set a recorded MP3 per dialogue beat for real voice acting." },
        { id: "b-p3", characterId: "narrator", text: "Characters can also have TALKING ANIMATION — sprite keyframes that auto-cycle while they speak, with a resting pose for when they're silent. Set it in the People tab under 'Talking Animation'. Put two characters at different positions and mirror one so they face each other." },
      ],
      choices: [
        { id: "c-p-choice", text: "How do choices and consequences work?", targetSceneId: "tut-choices", attitudeTag: "Clever" },
        { id: "c-p-evidence", text: "Show me items and hotspots", targetSceneId: "tut-evidence", attitudeTag: "Neutral" },
      ],
      hotspots: [],
    },

    // ── 4. Choices, Meters & Gating ───────────────────────────────────
    {
      id: "tut-choices",
      title: "Crossroads",
      background: "/img/bg-penthouse.jpg",
      ambientAudio: "tension",
      prose: "The penthouse is quiet. Too quiet. Three paths lie before you — and one of them is locked.",
      dialogueBeats: [
        { id: "b-c1", characterId: "narrator", text: "Every choice has an ATTITUDE TAG — Charm (smooth), Intimidate (force), Deduce (insight), or Neutral. The tag colours the button. Put a meter delta in the choice's consequences and the matching meter rises (or falls)." },
        { id: "b-c2", characterId: "narrator", text: "Choices can be GATED — locked until the player holds an item, has a flag, or meets a meter threshold. A gated choice shows a hint so the player knows what they need. Try the locked choice below — you'll need the Studio Blueprint first." },
        { id: "b-c3", characterId: "narrator", text: "A REPLY choice (💬) stays in the scene instead of navigating — pair it with a dialogue beat gated on the flag it sets, and that beat becomes the NPC's response. Great for conversational Q&A." },
      ],
      choices: [
        { id: "c-c-smart", text: "Deduce how this works (+1 Deduce)", targetSceneId: "tut-look", attitudeTag: "Clever", consequences: { meterChanges: [{ meter: "Clever", delta: 1 }] } },
        { id: "c-c-locked", text: "🔒 Use the Studio Blueprint", targetSceneId: "tut-look", attitudeTag: "Clever", gating: { requiresItems: ["item_blueprint"] } },
        { id: "c-c-evidence", text: "Find the blueprint first", targetSceneId: "tut-evidence", attitudeTag: "Neutral" },
      ],
      hotspots: [],
    },

    // ── 5. Evidence: Hotspots & Items ─────────────────────────────────
    {
      id: "tut-evidence",
      title: "The Docks",
      background: "/img/bg-docks.jpg",
      ambientAudio: "rain",
      prose: "Down at the docks, the water is black and the crates are wet. Something glints under a tarp.\n\nClick the glowing zone to find it.",
      dialogueBeats: [
        { id: "b-e1", characterId: "narrator", text: "HOTSPOTS are clickable zones you draw on the scene art in the Hotspots tab. Each one has a cursor type (look, take, talk, use, go) and an action: show text, give an item, set a flag, open the corkboard, navigate, or consume an item to unlock something." },
        { id: "b-e2", characterId: "narrator", text: "Try the hotspot below — it'll give you the Studio Blueprint. Then head back to the locked choice and it'll open up. That's the core loop: explore → find evidence → unlock new paths." },
      ],
      choices: [
        { id: "c-e-back-choice", text: "Try the locked choice now", targetSceneId: "tut-choices", attitudeTag: "Clever", isRepeatable: true },
        { id: "c-e-look", text: "Show me cinematic controls", targetSceneId: "tut-look", attitudeTag: "Neutral" },
      ],
      hotspots: [
        {
          id: "hs-blueprint",
          label: "Glinting under the tarp",
          bounds: { x: 15, y: 50, w: 20, h: 25 },
          cursor: "take",
          isRepeatable: false,
          action: { type: "giveItem", itemGranted: "item_blueprint" },
          showItemImage: true,
        },
        {
          id: "hs-water",
          label: "The black water",
          bounds: { x: 40, y: 70, w: 50, h: 20 },
          cursor: "look",
          isRepeatable: true,
          action: { type: "showText", text: "The harbour is dark and still. A body could disappear in there and nobody would ever know. You file the image away for later." },
        },
      ],
    },

    // ── 6. Cinematic, Audio & Structure ───────────────────────────────
    {
      id: "tut-look",
      title: "The Look",
      background: "/img/bg-dressing.jpg",
      ambientAudio: "drone",
      transition: "fade",
      transitionSpeed: 0.8,
      prose: "A dressing room. Mirror lights. The scene drifts gently — that's a cinematic camera move.",
      dialogueBeats: [
        { id: "b-l1", characterId: "narrator", text: "CINEMATIC CONTROLS grade any image (the scene background or a beat's replacement image). Camera modes: slow pan, zoom-to-subject, shaky cam, dolly track, vertigo dolly-zoom, or static. Add light glows that breathe, dim the image, or layer a foreground overlay (a character or prop that stays still while the camera moves)." },
        { id: "b-l2", characterId: "narrator", text: "AUDIO is separate: each scene can inherit the previous track, play a looping MP3, or go silent. Fade lengths control the crossfade (0s = hard cut, 1-2s = film-reel dissolve). Recorded narration MP3s replace the robotic Web Speech voice for the scene prose." },
        { id: "b-l3", characterId: "narrator", text: "STRUCTURE: acts divide a case into titled sections (with title cards and route-map scoping). Episodes split it into a season with per-episode save slots, recaps and 'next time on...' teasers. Both are optional — a case can be one continuous run." },
      ],
      choices: [
        { id: "c-l-workflow", text: "How do I test and publish?", targetSceneId: "tut-workflow", attitudeTag: "Neutral" },
        { id: "c-l-scenes", text: "Tell me about scenes again", targetSceneId: "tut-scenes", attitudeTag: "Clever", isRepeatable: true },
      ],
      hotspots: [],
    },

    // ── 7. Workflow: Validate → Repair → Play → Publish ───────────────
    {
      id: "tut-workflow",
      title: "Ship It",
      background: "/img/bg-vault.jpg",
      ambientAudio: "tension",
      prose: "A vault. Everything you've built is locked inside. Here's how to get it out into the world.",
      dialogueBeats: [
        { id: "b-w1", characterId: "narrator", text: "STEP 1 — CHECK (Validator): click 'Check' on the toolbar. The Continuity Department lists errors (red — block publishing) and warnings (gold — advisory). Click any note to fly to its scene." },
        { id: "b-w2", characterId: "narrator", text: "STEP 2 — REPAIR: one click auto-fixes dangling links, dead ends, broken gating and phantom items. It won't touch your real content — just the wiring." },
        { id: "b-w3", characterId: "narrator", text: "STEP 3 — PLAY: click 'Play' to run the draft. You can play even with errors — the game warns but lets you explore. The Test tab fakes world state (flags, items, meters, trust) so you can check gating without replaying." },
        { id: "b-w4", characterId: "narrator", text: "STEP 4 — PUBLISH: once the validator is clean, 'Publish' pushes the case to the newsstand. Export a .reel.json to back it up, share it, or hand it to another author — every image, voice line and video is bundled inside." },
        { id: "b-w5", characterId: "ch_sam", text: "One more thing: the end-of-game flowchart shows every decision the player made — the road they took and the roads they didn't. You're looking at one right now if you've reached an ending. Make it count." },
      ],
      choices: [
        { id: "c-w-win", text: "I'm ready to build my own case!", targetSceneId: "tut-ending-win", attitudeTag: "Sultry" },
        { id: "c-w-look", text: "Show me cinematic controls", targetSceneId: "tut-look", attitudeTag: "Clever", isRepeatable: true },
        { id: "c-w-back", text: "Back to the start", targetSceneId: "tut-welcome", attitudeTag: "Neutral", isRepeatable: true },
      ],
      hotspots: [],
    },

    // ── Ending: Victory ───────────────────────────────────────────────
    {
      id: "tut-ending-win",
      title: "The First Reel",
      background: "/img/bg-end-gold.jpg",
      ambientAudio: "jazz",
      prose:
        "That's the tour.\n\nYou've walked through scenes, met a character, found a clue, triggered a meter change, opened a locked gate, explored cinematic controls, and learned the publish workflow.\n\nOpen Studio Mode, click '+ New Story', and start building. The city is waiting, detective.",
      choices: [],
      hotspots: [],
      isEnding: true,
      endingData: {
        tier: "victory-gold",
        headline: "THE FIRST REEL",
        recap: "You completed the Studio tutorial. Every tool is now in your hands — go make something great.",
      },
    },

    // ── Ending: Game Over ─────────────────────────────────────────────
    {
      id: "tut-ending-skip",
      title: "The Reel Cuts Short",
      background: "/img/bg-end-refusal.jpg",
      ambientAudio: "none",
      prose:
        "You skipped the tour. Fair enough.\n\nBut the Studio's tools run deep — cinematic cameras, talking character sprites, a deduction corkboard, episodic seasons, quick-time prompts, memory recalls. When you're ready to dig in, come back. The door is always open.",
      choices: [],
      hotspots: [],
      isEnding: true,
      endingData: {
        tier: "gameover",
        headline: "CUT SHORT",
        recap: "The tutorial was skipped. The tools await.",
      },
    },
  ],
  briefing: {
    objective: "Take the Studio tour — meet Sam Vane, find the blueprint, learn the workflow.",
    winConditions: ["Reach the 'I'm ready to build!' ending"],
    loseConditions: ["Choose to skip the tutorial entirely"],
  },
};
