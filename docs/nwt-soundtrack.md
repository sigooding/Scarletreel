# Nobody's Witness: True Romance Cut — Production Soundtrack

**Story:** `nobodys-witness-true`  
**Engine limit:** one looping bed per scene (`musicUrl` + `musicMode`). There is no mid-scene needle-drop. Silence is authored with `musicMode: "none"` — inherit keeps whatever is playing, including a leftover jukebox.

## Wired now (ships with the cut)

| Scene | Bed | Mode | Why |
|---|---|---|---|
| Cold open | — | `none` | Rain + gunshot (`/nwt-gunshot.wav`). Plant no theme yet. |
| Titles | `/nobodys-witness.mp3` | `track` 0.6 | House theme. Keep. |
| Blackwood Diner (Act 1) | `/Midnight in the Rain2.mp3` | `track` 0.45 | Smoky jazz under Vera's walk-in. `nwt_diner_take` inherits. |
| Blue Cue (Act 1 + 2) | `/nwt-bluecue-jukebox.mp3` | `track` 0.4 | Diegetic warped 7-inch. Out / named / walk / fight inherit. |
| Office, warehouse, payphone, laundromat, 3 a.m., pumps, interlude, rental, yard, call, Rosa, mill, cost | — | `none` | Silence is the cue. Solomon, Ted, the killing, and confessions play dry. |
| Trade | — | `none` | Space heater only. |
| Final diner (11:47) | — | `none` | Fan and rain until she walks in. |
| She Walks In | `/nobodys-witness.mp3` | `track` 0.7 | Theme's first full statement. |
| SHE STAYS | same | `inherit` | Motif keeps playing. Don't resolve it. |
| NOBODY'S WITNESS (walks) | — | `none` | Cut at the door bell. Coffee lands dry. |
| A STOPPED WATCH | — | `none` | Unscored. Engine cannot drop a song after Rosa leaves. |

`/Soundtrack.mp3` is an unused original bed in `public/`. Do not wire it until someone listens and places it — mystery tracks belong on a cue sheet, not in a diner.

## Licensed references (music supervisor, not the engine)

Clearance is on you. These are the True Romance / Tarantino energies the beds are standing in for:

| Moment | Reference | Energy |
|---|---|---|
| Cold open (if you ever score it) | Hans Zimmer — *You're So Cool*, slowed, buried under rain | Plant the motif broken |
| Act 1 diner | Nino Rota lounge / *Girl, You'll Be a Woman Soon* | Alabama walks into the booth |
| Blue Cue jukebox | George Jones *He Stopped Loving Her Today*, or John Prine *Illegal Smile* | Sad country under Desh's grocery rant |
| Warehouse let-go | Jim Reeves *He'll Have to Go* | Crooner over the payment schedule |
| Three a.m. | Chet Baker *Almost Blue* / Gabrels–Smith *Out of Reach* | One lamp, two people |
| Pumps radio | Merle Haggard *If We Make It Through December* | Diegetic 2 a.m. country |
| Interlude | Chet Baker *I Fall in Love Too Easily* | Warmest light, loneliest horn |
| Yard, after the shot | *You're So Cool* returning, sadder, under the bag-in-trunk | Theme's first appearance is the murder — **not wired**; engine can't start a bed mid-scene |
| SHE STAYS | *You're So Cool* full statement | Earned here |
| A STOPPED WATCH, after Rosa | Chris Isaak *Two Hearts* (on the TR soundtrack) | One song that says it out loud — **not wired** |

If licensing never happens, the synth equivalent is: one 4-note glockenspiel motif (broken at the titles, whole at She Walks In) plus the two diegetic beds already in the build (diner jazz, Blue Cue jukebox).
