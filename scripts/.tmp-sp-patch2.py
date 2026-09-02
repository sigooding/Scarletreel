import io
p = "src/data/southPark.ts"
s = io.open(p, encoding="utf-8").read()

# 3. cafe right edge leads to the crash site
old = '        exitEdges: { left: { targetSceneId: "sp_hall", label: "back to school" } },'
new = '''        exitEdges: {
          left: { targetSceneId: "sp_hall", label: "back to school" },
          // Something crashed out past the treeline. It talks.
          right: { targetSceneId: "sp_crash", label: "whatever that explosion was" },
        },'''
assert s.count(old) == 1, "cafe edge"
s = s.replace(old, new, 1)

# 4. the crash scene (wide world 200 + cameo cutscene)
old = "    /* \u2500\u2500 SCENE 4 \u2500 STARK'S POND \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500"
new = '''    /* \u2500\u2500 SCENE 3c \u2500 THE WRONG CARTOON (wide-world cameo) \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500 */
    {
      id: "sp_crash",
      title: "The Shoreline Past the Trees",
      note:
        "BETA SCENE 3c \\u2014 THE WIDE REEL. worldWidth 200: a two-screen shoreline, the camera panning with the walker. " +
        "The room-entry cutscene is the multiversal cameo: Rick & Morty crashed here, decide they are in the wrong " +
        "cartoon, and portal out (the portal marker wakes once you have talked to them). Both are talk-linked \\u2014 " +
        "talk to Rick and ONLY Rick freezes while Morty keeps pacing.",
      background: "assets/southpark/sp-bg-pond.png",
      nodeType: "stage",
      stage: {
        ...stageBase,
        // THE EXTENDED REEL \\u2014 one scrolling strip, twice the plate wide.
        worldWidth: 200,
        spawn: { x: 20, y: 88 },
        enterCaption: "The shoreline runs on for two screens past the treeline. So does the smoke.",
        entrySpawns: { sp_cafe: { x: 16, y: 88 }, sp_pond: { x: 30, y: 88 } },
        enterScript: [
          { do: "wait", seconds: 0.8 },
          { do: "say", text: "A green tear opens over the pond. Something falls out of it. Something... parked badly." },
          { do: "npcWalkTo", npcId: "sp_rick_cameo", x: 150, y: 84 },
          { do: "wait", seconds: 0.6 },
          { do: "say", text: "Morty. Morty! Th-this is\\u2014 you parked us in the wrong CARTOON, Morty!" },
          { do: "npcWalkTo", npcId: "sp_morty_cameo", x: 160, y: 86 },
          { do: "say", text: "Oh jeez. Oh man, Rick, it's SOUTH Park. Th-they kill the kid here, Rick! The little one in the orange\\u2014 they just DO it!" },
          { do: "say", text: "Yeah, well their whole gig is a bunch of eight-year-olds swearing while a fat kid gets humiliated, Morty. It's\\u2014 it's basically our show with ski caps. Legally I cannot say another word." },
          { do: "npcMotion", npcId: "sp_rick_cameo", facing: "left" },
          { do: "say", text: "Oh, sorry. Wrong scene. Wrong cartoon. Bye." },
          { do: "wait", seconds: 0.8 },
        ],
        enterScriptFlag: "sp_crash_seen",
        npcs: [
          {
            id: "sp_rick_cameo",
            sheet: SP_RICK_SHEET,
            x: 150,
            y: 84,
            scale: 1.5,
            speed: 6,
            talkHotspotId: "sp_crash_rick",
            patrol: [
              { x: 150, y: 84, pause: 3, say: "The ship's a rental, Morty. RENTAL." },
              { x: 138, y: 88, pause: 3, say: "Wubba lubba\\u2014 no. No, that's their thing. Ugh." },
            ],
          },
          {
            id: "sp_morty_cameo",
            sheet: SP_MORTY_SHEET,
            x: 160,
            y: 86,
            scale: 1.5,
            speed: 8,
            facing: "left",
            patrol: [
              { x: 160, y: 86, pause: 2, say: "I-I don't wanna be a background character, Rick!" },
              { x: 170, y: 90, pause: 2, say: "Th-the snow here is drawn with PAPER, Rick!" },
            ],
          },
        ],
      },
      prose: "",
      dialogueBeats: [
        { id: "sp_b_crash1", characterId: "sp_rick", text: "Wh\\u2014what? Yeah, the sled thing sounds like a real you problem, kid. We do this at a multi-multiversal scale." },
        { id: "sp_b_crash2", characterId: "sp_stan", text: "Your ship is on fire. In our pond. That's a protected pond." },
        { id: "sp_b_crash3", characterId: "sp_rick", text: "It's a RENTAL, buddy. Tell the pond\\u2014 y'know what, tell the fat kid. He's clearly the one with the lawyer." },
        { id: "sp_b_crash4", characterId: "sp_morty", text: "Rick, the kid's giving us the LOOK, Rick, the\\u2014 oh jeez, portal us, portal us NOW." },
      ],
      hotspots: [
        {
          id: "sp_crash_rick",
          label: "Rick, blaming the parking",
          bounds: { x: 138, y: 54, w: 20, h: 28 },
          cursor: "talk",
          isRepeatable: true,
          action: { type: "startDialogue", flagSet: "sp_cameo_talked" },
          verbs: {
            look: { type: "showText", text: "An old man in a lab coat. He appears to be drooling confidence." },
            punch: { type: "showText", text: "He threatens to turn you into a smaller, angrier version of yourself. Portal science." },
            use: { type: "showText", text: "You can't USE Rick. Rick uses Rick. That's the whole show." },
          },
        },
        {
          id: "sp_crash_ship",
          label: "The smoking wreck (definitely a rental)",
          bounds: { x: 142, y: 58, w: 26, h: 22 },
          cursor: "look",
          isRepeatable: true,
          image: "assets/southpark/sp-obj-ship.png",
          action: { type: "showText", text: "A battered flying saucer, nose-down in a snowbank. The glovebox holds eleven unused portal guns and a magnet for a plumbing van that operates across dimensions." },
          verbs: {
            take: { type: "showText", text: "You try to take the ship. The ship's insurance company files a claim on your SOUL." },
            kick: { type: "showText", text: "You kick the hull. Somewhere, a warranty gets violated in fourteen realities." },
            use: { type: "showText", text: "You turn the steering wheel. It makes a 'wubba' noise and nothing else." },
          },
        },
        {
          id: "sp_crash_portal",
          label: "The portal home (for them, anyway)",
          bounds: { x: 168, y: 50, w: 12, h: 20 },
          cursor: "go",
          isRepeatable: true,
          image: "assets/southpark/sp-obj-portal.png",
          customFailMessage: "The portal spits sparks. Rick waves from the wreck. 'Not til we've talked, kid \\u2014 insurance needs a witness!'",
          gating: { requiresFlags: ["sp_cameo_talked"] },
          action: { type: "goToScene", targetSceneId: "sp_cafe" },
        },
      ],
      choices: [],
    },

    /* \u2500\u2500 SCENE 4 \u2500 STARK'S POND \u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500\u2500'''
assert s.count(old) == 1, "scene anchor"
s = s.replace(old, new, 1)

io.open(p, "w", encoding="utf-8").write(s)
print("part 2 ok")
