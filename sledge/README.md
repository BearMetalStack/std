# sledge

`<bm-sledge>` turns a tagged SVG into an animated little buddy. It tracks the mouse with parallax,
blinks, sways, and changes expression.

```html
<bm-sledge></bm-sledge>
<!-- Sledge himself -->
<bm-sledge src="/characters/ghost.svg"></bm-sledge>
<!-- fetched -->
<bm-sledge expression="angry">
	<svg>…</svg>
</bm-sledge>
<!-- inline -->
```

Everything is opt-in. Anything a character doesn't tag just doesn't happen.

## Tags

| Tag                                           | Effect                                                               |
| --------------------------------------------- | -------------------------------------------------------------------- |
| `data-part="face"`                            | Anchor that `data-z-mix` parts swap in front of or behind            |
| `data-part="eyes"`                            | Group that follows the gaze                                          |
| `data-part="eye"`                             | Tilts with the gaze; blinks                                          |
| `data-part="nose"`                            | `sniff()`s                                                           |
| `data-layer="n"`                              | Parallax depth                                                       |
| `data-z-mix="[dx,dy]"`                        | Changes stacking order depending on gaze direction                   |
| `data-shape-of="<id>" data-state="<name>"`    | An alternate shape (blend shape) for path `<id>`, removed at runtime |
| `data-sway="stiffness damping [gain] [drag]"` | Swings on a spring as the character moves; defaults `120 10 1 1`     |
| `data-pivot-for="<id>"`                       | Marker shape whose center is that part's pivot, removed at runtime   |
| `data-lid="mask\|cover" data-for="<eye id>"`  | An eyelid path for that eye                                          |
| `data-attach="<lid id>"`                      | Rides that lid's edge once the lid covers its root, e.g. eyelashes   |
| `data-bob="ampY periodY [ampX periodX]"`      | On the root `<svg>`: idle float, in SVG units and seconds            |
| `data-default-expression="<state>"`           | On the root `<svg>`: the starting expression                         |

## Blend shapes

This works like Blender shape keys. In Inkscape, duplicate a path (Ctrl+D) and only _move_ its
nodes. Never add or delete them. Then tag the copy with `data-shape-of` and `data-state`. The copy
can sit in a hidden "States" layer, because it is mapped into the original's coordinate space. A
variant whose nodes don't match is skipped, with a console warning naming it.

Blending is additive and runs in JS, so states mix:

```ts
sledge.setExpression("joy");
sledge.setBlend({ joy: 0.6, angry: 0.4 }, { duration: 300 });
sledge.setExpression("neutral"); // every path back to its base shape
```

## Lids

Lids are ordinary paths. Their expressions are blend shapes, and their `closed` state is what a
blink closes them to. Eyes without lids blink by squashing instead.

- **`mask`** cuts the eye away. The lid's own paint is ignored. On a stroked eye, an edge line in
  the eye's stroke color is drawn along the cut, so the outline survives.
- **`cover`** paints over the eye in the lid's own fill and stroke, confined to the eye. The eye's
  outline is redrawn on top.

Any other path with a `closed` state closes along with a blink.

### Attached parts

`data-attach="<lid id>"` makes a part, such as an eyelash, belong to that lid's eye. It moves with
the eye's glance and tilt, and it stays where you drew it until the lid covers its root: the point
where it leaves the eye, or a path's first point if it starts outside. From then on it slides along
the lid's edge and turns to keep pointing away from the eye's center, so lashes fan out as a lid
comes down over a corner. The whole part moves rigidly, at full length: a lash drawn starting inside
the eye runs on into the lid line once the lid closes. If the part has its own blend shapes, they
take over from attaching in proportion to their weight, so you can hand-place a lash for any pose.

## Sway

A swaying part rotates around its pivot on a damped spring. It is driven by:

- the gaze shift;
- the element's real movement on the page;
- `nudge(vx, vy)`;
- the idle bob.

`gain` scales how hard motion swings it. `drag` adds a lean while moving steadily, like a sheet held
back by the air. Nested sways (hair on a swaying body) work.

## Demo

`deno task dev` (set `BEARMETAL_SLEDGE_PORT` to move it off 3000). Keys:

- `1`–`4`: neutral / joy / angry / sad
- `m`: patrol side to side
- `p`: nudge
- `b`/`c`: blink
- hold `l`: close eyes
- `s`/hold `n`: sniff
- `g`/`f`: eyes-only gaze on/off
- `r`: run a gaze circuit
