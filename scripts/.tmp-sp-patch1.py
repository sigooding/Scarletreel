import io, sys
p = "src/data/southPark.ts"
s = io.open(p, encoding="utf-8").read()

# 1. Rick & Morty characters (stage-only cameo: NO talking cutouts)
old = u'''    { id: "sp_barbrady", name: "Officer Barbrady", role: "The law, at a simmer", avatarUrl: "emoji:\U0001F46E", trustMeter: 0, talkingSheet: SP_BARBRADY_TALK, talkingX: 24, talkingY: 0, talkingScale: 0.6 },
  ],'''
new = u'''    { id: "sp_barbrady", name: "Officer Barbrady", role: "The law, at a simmer", avatarUrl: "emoji:\U0001F46E", trustMeter: 0, talkingSheet: SP_BARBRADY_TALK, talkingX: 24, talkingY: 0, talkingScale: 0.6 },
    { id: "sp_rick", name: "Rick (wrong cartoon)", role: "Multiversal tourist", avatarUrl: "emoji:\U0001F9EA", trustMeter: 0 },
    { id: "sp_morty", name: "Morty (wrong cartoon)", role: "Reluctant multiversal tourist", avatarUrl: "emoji:\U0001F630", trustMeter: 0 },
  ],'''
assert s.count(old) == 1, "chars"
s = s.replace(old, new, 1)

# 2. cameo sheets
old = u'''\u002f\u002a\u002a Tweek \u2014 jittery pass-3 patrol sheet (faces right natively). \u002a/'''
new = u'''/** The WRONG-CARTOON cameo \u2014 a certain scientist & grandson, passing
 *  through. Stage-only characters (no talking cutouts here). */
const SP_RICK_SHEET: SpriteSheet = {
  image: "assets/southpark/sp-rick-walk.png",
  frameWidth: 181,
  frameHeight: 291,
  animations: {
    idle: { frames: [0] },
    walk: { frames: [0, 1, 2, 3, 4, 5], fps: 7 },
  },
};
const SP_MORTY_SHEET: SpriteSheet = {
  image: "assets/southpark/sp-morty-walk.png",
  frameWidth: 169,
  frameHeight: 245,
  animations: {
    idle: { frames: [0] },
    walk: { frames: [0, 1, 2, 3, 4, 5], fps: 9 },
  },
};

\u002f\u002a\u002a Tweek \u2014 jittery pass-3 patrol sheet (faces right natively). \u002a/'''
assert s.count(old) == 1, "sheets"
s = s.replace(old, new, 1)

io.open(p, "w", encoding="utf-8").write(s)
print("part 1 ok")
