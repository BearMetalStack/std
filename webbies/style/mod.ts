import { css } from "@bearmetal/miscellanea";
import { injectStyle } from "@bearmetal/drip";
export * from "./animations.ts";

// injectStyle(
// 	"bm-base",
// 	css`
// 		/* ============================================================
// 		   BearMetal Webbies - Base Stylesheet
// 		   bearmetal-base.css

// 		   DO NOT edit tokens here. Override them in your config file:

// 		     @import 'bearmetal-base.css';
// 		     @import 'bearmetal-config.css'; - your tokens go there

// 		   All custom properties fall back to sane defaults so the
// 		   library is usable even with zero configuration.
// 		   ============================================================ */

// 		/* ============================================================
// 		   SECTION 1 - TOKEN LAYER (override these in your config)
// 		   ============================================================ */

// 		:root {
// 			/* interpolate-size: allow-keywords; */

// 			/* ----------------------------------------------------------
// 			   COLOR - Brand
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-50: #f5eeff; /* Tints, hover backgrounds */
// 			--color-bearmetal-100: #e8ccff; /* Subtle fills, badge backgrounds */
// 			--color-bearmetal-200: #cc99ff; /* Borders on light surfaces */
// 			--color-bearmetal-300: #aa55ee; /* Icons on light bg, decorative */
// 			--color-bearmetal-400: #7711cc; /* Large text on white, light mode links */
// 			--color-bearmetal-600: #36005c; /* ← brand identity color */
// 			--color-bearmetal-500: #4a0080; /* NOTE: lighter than 500 - interactive default (see docs) */
// 			--color-bearmetal-700: #290047; /* Hover state */
// 			--color-bearmetal-800: #1a0030; /* Active/pressed - "vibrant" dark bg */
// 			--color-bearmetal-900: #0d0018; /* Near-black */
// 			--color-bearmetal-950: #060009; /* Dark mode page bg - "shadow" dark bg */

// 			/* ----------------------------------------------------------
// 			   COLOR - Brand Grey
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-grey-50: #faf8fc; /* Page background                   → --color-bg */
// 			--color-bearmetal-grey-100: #f2eff6; /* Subtle surface                    → --color-bg-subtle */
// 			--color-bearmetal-grey-200: #e8e4f0; /* Muted surface, skeleton           → --color-bg-muted */
// 			--color-bearmetal-grey-300: #d8d2e6; /* Emphasis surface, hover           → --color-bg-emphasis */
// 			--color-bearmetal-grey-400: #c2bace; /* Subtle border                     → --color-border */
// 			--color-bearmetal-grey-500: #a89eb8; /* Default border                    → --color-border-strong */
// 			--color-bearmetal-grey-600: #7a7085; /* Muted text, placeholders          → --color-text-muted */
// 			--color-bearmetal-grey-700: #544d5e; /* Subtle text, secondary labels     → --color-text-subtle */
// 			--color-bearmetal-grey-800: #332d3a; /* Body text                         → --color-text */
// 			--color-bearmetal-grey-900: #1c1820; /* High contrast text */
// 			--color-bearmetal-grey-950: #100d14; /* Dark mode page bg */

// 			/* ----------------------------------------------------------
// 			   COLOR - Brand Success
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-success-50: #f0faf1; /* Success bg tint                   → --color-success-light */
// 			--color-bearmetal-success-100: #d6f5d8; /* Alert background */
// 			--color-bearmetal-success-200: #a8e8ac; /* Badge background */
// 			--color-bearmetal-success-300: #6bcf72; /* Icons on light bg */
// 			--color-bearmetal-success-400: #2ea838; /* Large text on white */
// 			--color-bearmetal-success-500: #005c08; /* ← brand identity                  → --color-success */
// 			--color-bearmetal-success-600: #004d07; /* Buttons, interactive */
// 			--color-bearmetal-success-700: #003d05; /* Hover state                       → --color-success-dark */
// 			--color-bearmetal-success-800: #002803; /* Active/pressed, dark surfaces */
// 			--color-bearmetal-success-900: #001602; /* Near-black */
// 			--color-bearmetal-success-950: #000a01; /* Dark mode page bg (branded) */

// 			/* ----------------------------------------------------------
// 			   COLOR - Brand Danger
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-danger-50: #fdf0f4; /* Danger bg tint                    → --color-danger-light */
// 			--color-bearmetal-danger-100: #f8d6e3; /* Alert background */
// 			--color-bearmetal-danger-200: #f0a8c2; /* Badge background */
// 			--color-bearmetal-danger-300: #d96690; /* Icons on light bg */
// 			--color-bearmetal-danger-400: #b03060; /* Large text on white */
// 			--color-bearmetal-danger-500: #5c0026; /* ← brand identity                  → --color-danger */
// 			--color-bearmetal-danger-600: #4a001e; /* Buttons, interactive */
// 			--color-bearmetal-danger-700: #380016; /* Hover state                       → --color-danger-dark */
// 			--color-bearmetal-danger-800: #25000e; /* Active/pressed, dark surfaces */
// 			--color-bearmetal-danger-900: #140008; /* Near-black */
// 			--color-bearmetal-danger-950: #0a0004; /* Dark mode page bg (branded) */

// 			/* ----------------------------------------------------------
// 			   COLOR - Brand Warning
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-warning-50: #fdf9ee; /* Warning bg tint                   → --color-warning-light */
// 			--color-bearmetal-warning-100: #faefc8; /* Alert background */
// 			--color-bearmetal-warning-200: #f5dc88; /* Badge background */
// 			--color-bearmetal-warning-300: #e8c020; /* Icons on light bg */
// 			--color-bearmetal-warning-400: #a88800; /* Large text on white */
// 			--color-bearmetal-warning-500: #3d2e00; /* ← brand identity                  → --color-warning */
// 			--color-bearmetal-warning-600: #332600; /* Buttons, interactive */
// 			--color-bearmetal-warning-700: #261c00; /* Hover state                       → --color-warning-dark */
// 			--color-bearmetal-warning-800: #181100; /* Active/pressed, dark surfaces */
// 			--color-bearmetal-warning-900: #0d0900; /* Near-black */
// 			--color-bearmetal-warning-950: #070400; /* Dark mode page bg (branded) */

// 			/* ----------------------------------------------------------
// 			   COLOR - Brand Info
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-info-50: #eef4fd; /* Info bg tint                      → --color-info-light */
// 			--color-bearmetal-info-100: #cce0f8; /* Alert background */
// 			--color-bearmetal-info-200: #96c4f0; /* Badge background */
// 			--color-bearmetal-info-300: #4e9add; /* Icons on light bg */
// 			--color-bearmetal-info-400: #1a6ab8; /* Large text on white */
// 			--color-bearmetal-info-500: #001f4a; /* ← brand identity                  → --color-info */
// 			--color-bearmetal-info-600: #001838; /* Buttons, interactive */
// 			--color-bearmetal-info-700: #001028; /* Hover state                       → --color-info-dark */
// 			--color-bearmetal-info-800: #000a18; /* Active/pressed, dark surfaces */
// 			--color-bearmetal-info-900: #00050e; /* Near-black */
// 			--color-bearmetal-info-950: #000208; /* Dark mode page bg (branded) */

// 			/* ----------------------------------------------------------
// 			   COLOR - Brand Orange
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-orange-50: #fef4ec;
// 			--color-bearmetal-orange-100: #fcdcb0;
// 			--color-bearmetal-orange-200: #f5a855;
// 			--color-bearmetal-orange-300: #e88a30;
// 			--color-bearmetal-orange-400: #d96810;
// 			--color-bearmetal-orange-500: #b85500;
// 			--color-bearmetal-orange-600: #9c4400;
// 			--color-bearmetal-orange-700: #742f00;
// 			--color-bearmetal-orange-800: #5a2800;
// 			--color-bearmetal-orange-900: #2c1200;
// 			--color-bearmetal-orange-950: #160900;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Slate
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-slate-50: #f4f6f8;
// 			--color-bearmetal-slate-100: #e2e8f0;
// 			--color-bearmetal-slate-200: #c4d0e0;
// 			--color-bearmetal-slate-300: #94a8c0;
// 			--color-bearmetal-slate-400: #6480a0;
// 			--color-bearmetal-slate-500: #3c5068; /* ← identity */
// 			--color-bearmetal-slate-600: #2e3e52;
// 			--color-bearmetal-slate-700: #202e3c;
// 			--color-bearmetal-slate-800: #141e28;
// 			--color-bearmetal-slate-900: #0a1018;
// 			--color-bearmetal-slate-950: #04080c;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Pebble
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-pebble-50: #f5f4f3;
// 			--color-bearmetal-pebble-100: #e4e2e0;
// 			--color-bearmetal-pebble-200: #c8c4c0;
// 			--color-bearmetal-pebble-300: #a09c98;
// 			--color-bearmetal-pebble-400: #787470;
// 			--color-bearmetal-pebble-500: #484442; /* ← identity */
// 			--color-bearmetal-pebble-600: #3a3634;
// 			--color-bearmetal-pebble-700: #2c2a28;
// 			--color-bearmetal-pebble-800: #1c1a18;
// 			--color-bearmetal-pebble-900: #100e0c;
// 			--color-bearmetal-pebble-950: #060504;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Stone
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-stone-50: #f7f5f2;
// 			--color-bearmetal-stone-100: #e8e2d8;
// 			--color-bearmetal-stone-200: #d0c4b0;
// 			--color-bearmetal-stone-300: #a89880;
// 			--color-bearmetal-stone-400: #806858;
// 			--color-bearmetal-stone-500: #4a3c30; /* ← identity */
// 			--color-bearmetal-stone-600: #3c3028;
// 			--color-bearmetal-stone-700: #2c2420;
// 			--color-bearmetal-stone-800: #1c1814;
// 			--color-bearmetal-stone-900: #100c08;
// 			--color-bearmetal-stone-950: #060402;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Cyan
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-cyan-50: #edfaf8;
// 			--color-bearmetal-cyan-100: #c2f0ea;
// 			--color-bearmetal-cyan-200: #80dfd1;
// 			--color-bearmetal-cyan-300: #3abfad;
// 			--color-bearmetal-cyan-400: #009688;
// 			--color-bearmetal-cyan-500: #005c52; /* ← identity */
// 			--color-bearmetal-cyan-600: #004a42;
// 			--color-bearmetal-cyan-700: #003830;
// 			--color-bearmetal-cyan-800: #002420;
// 			--color-bearmetal-cyan-900: #001210;
// 			--color-bearmetal-cyan-950: #00080a;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Cyan Muted
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-cyan-muted-50: #eef7f5;
// 			--color-bearmetal-cyan-muted-100: #bce0d8;
// 			--color-bearmetal-cyan-muted-200: #82c0b4;
// 			--color-bearmetal-cyan-muted-300: #4e9e90;
// 			--color-bearmetal-cyan-muted-400: #287870;
// 			--color-bearmetal-cyan-muted-500: #184e48;
// 			--color-bearmetal-cyan-muted-600: #123e3a;
// 			--color-bearmetal-cyan-muted-700: #0c2e2c;
// 			--color-bearmetal-cyan-muted-800: #081e1c;
// 			--color-bearmetal-cyan-muted-900: #041010;
// 			--color-bearmetal-cyan-muted-950: #020808;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Magenta
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-magenta-50: #fef0f8;
// 			--color-bearmetal-magenta-100: #fac8e8;
// 			--color-bearmetal-magenta-200: #f090cc;
// 			--color-bearmetal-magenta-300: #d855a0;
// 			--color-bearmetal-magenta-400: #aa2070;
// 			--color-bearmetal-magenta-500: #5c0038; /* ← identity */
// 			--color-bearmetal-magenta-600: #4a002e;
// 			--color-bearmetal-magenta-700: #380022;
// 			--color-bearmetal-magenta-800: #250016;
// 			--color-bearmetal-magenta-900: #14000c;
// 			--color-bearmetal-magenta-950: #0a0006;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Magenta Muted
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-magenta-muted-50: #fbf1f5;
// 			--color-bearmetal-magenta-muted-100: #e8cdd8;
// 			--color-bearmetal-magenta-muted-200: #c99ab2;
// 			--color-bearmetal-magenta-muted-300: #a86888;
// 			--color-bearmetal-magenta-muted-400: #7e3c60;
// 			--color-bearmetal-magenta-muted-500: #4a2038;
// 			--color-bearmetal-magenta-muted-600: #3c1a2e;
// 			--color-bearmetal-magenta-muted-700: #2e1424;
// 			--color-bearmetal-magenta-muted-800: #1e0c18;
// 			--color-bearmetal-magenta-muted-900: #100810;
// 			--color-bearmetal-magenta-muted-950: #080408;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Chartreuse
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-chartreuse-50: #f2faec;
// 			--color-bearmetal-chartreuse-100: #d4f0b4;
// 			--color-bearmetal-chartreuse-200: #a8d870;
// 			--color-bearmetal-chartreuse-300: #72b030;
// 			--color-bearmetal-chartreuse-400: #4a8800;
// 			--color-bearmetal-chartreuse-500: #2c5c00; /* ← identity */
// 			--color-bearmetal-chartreuse-600: #224a00;
// 			--color-bearmetal-chartreuse-700: #183800;
// 			--color-bearmetal-chartreuse-800: #0e2400;
// 			--color-bearmetal-chartreuse-900: #071200;
// 			--color-bearmetal-chartreuse-950: #030800;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Chartreuse Muted
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-chartreuse-muted-50: #f2f6ee;
// 			--color-bearmetal-chartreuse-muted-100: #cee0b8;
// 			--color-bearmetal-chartreuse-muted-200: #a2be80;
// 			--color-bearmetal-chartreuse-muted-300: #789650;
// 			--color-bearmetal-chartreuse-muted-400: #507030;
// 			--color-bearmetal-chartreuse-muted-500: #304a18;
// 			--color-bearmetal-chartreuse-muted-600: #263c12;
// 			--color-bearmetal-chartreuse-muted-700: #1c2e0e;
// 			--color-bearmetal-chartreuse-muted-800: #121e08;
// 			--color-bearmetal-chartreuse-muted-900: #0a1004;
// 			--color-bearmetal-chartreuse-muted-950: #040802;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Brick
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-brick-50: #faf2f0;
// 			--color-bearmetal-brick-100: #eaccc6;
// 			--color-bearmetal-brick-200: #cc9890;
// 			--color-bearmetal-brick-300: #a86860;
// 			--color-bearmetal-brick-400: #7e3c34;
// 			--color-bearmetal-brick-500: #4a1c18; /* ← identity */
// 			--color-bearmetal-brick-600: #3c1612;
// 			--color-bearmetal-brick-700: #2e100c;
// 			--color-bearmetal-brick-800: #1e0a08;
// 			--color-bearmetal-brick-900: #100604;
// 			--color-bearmetal-brick-950: #080402;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Danger Muted
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-danger-muted-50: #faf2f2;
// 			--color-bearmetal-danger-muted-100: #eaccca;
// 			--color-bearmetal-danger-muted-200: #cc989a;
// 			--color-bearmetal-danger-muted-300: #a8686c;
// 			--color-bearmetal-danger-muted-400: #7e3c40;
// 			--color-bearmetal-danger-muted-500: #4a1c20;
// 			--color-bearmetal-danger-muted-600: #3c1618;
// 			--color-bearmetal-danger-muted-700: #2e1012;
// 			--color-bearmetal-danger-muted-800: #1e0a0c;
// 			--color-bearmetal-danger-muted-900: #100606;
// 			--color-bearmetal-danger-muted-950: #080404;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Success Muted
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-success-muted-50: #eff5ef;
// 			--color-bearmetal-success-muted-100: #c4dcc4;
// 			--color-bearmetal-success-muted-200: #92bc92;
// 			--color-bearmetal-success-muted-300: #609460;
// 			--color-bearmetal-success-muted-400: #326e32;
// 			--color-bearmetal-success-muted-500: #1c481e;
// 			--color-bearmetal-success-muted-600: #163c18;
// 			--color-bearmetal-success-muted-700: #102e12;
// 			--color-bearmetal-success-muted-800: #0a1e0c;
// 			--color-bearmetal-success-muted-900: #061008;
// 			--color-bearmetal-success-muted-950: #020802;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Warning Muted
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-warning-muted-50: #f8f4ec;
// 			--color-bearmetal-warning-muted-100: #e0d4a0;
// 			--color-bearmetal-warning-muted-200: #c0b068;
// 			--color-bearmetal-warning-muted-300: #988840;
// 			--color-bearmetal-warning-muted-400: #706220;
// 			--color-bearmetal-warning-muted-500: #403e10;
// 			--color-bearmetal-warning-muted-600: #34320c;
// 			--color-bearmetal-warning-muted-700: #282608;
// 			--color-bearmetal-warning-muted-800: #1a1804;
// 			--color-bearmetal-warning-muted-900: #0e0c02;
// 			--color-bearmetal-warning-muted-950: #060602;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Info Muted
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-info-muted-50: #eff4f8;
// 			--color-bearmetal-info-muted-100: #bcd0e4;
// 			--color-bearmetal-info-muted-200: #84a8cc;
// 			--color-bearmetal-info-muted-300: #5080a8;
// 			--color-bearmetal-info-muted-400: #285878;
// 			--color-bearmetal-info-muted-500: #143448;
// 			--color-bearmetal-info-muted-600: #102a3a;
// 			--color-bearmetal-info-muted-700: #0c202c;
// 			--color-bearmetal-info-muted-800: #08141c;
// 			--color-bearmetal-info-muted-900: #040c10;
// 			--color-bearmetal-info-muted-950: #020608;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Orange Muted
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-orange-muted-50: #f8f2ec;
// 			--color-bearmetal-orange-muted-100: #e4cca8;
// 			--color-bearmetal-orange-muted-200: #c8a472;
// 			--color-bearmetal-orange-muted-300: #a87a48;
// 			--color-bearmetal-orange-muted-400: #805428;
// 			--color-bearmetal-orange-muted-500: #4e3418;
// 			--color-bearmetal-orange-muted-600: #3e2a12;
// 			--color-bearmetal-orange-muted-700: #2e1e0c;
// 			--color-bearmetal-orange-muted-800: #1e1408;
// 			--color-bearmetal-orange-muted-900: #100a04;
// 			--color-bearmetal-orange-muted-950: #080402;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Purple Muted
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-muted-50: #f2eef8;
// 			--color-bearmetal-muted-100: #dcd0ee;
// 			--color-bearmetal-muted-200: #bca8d8;
// 			--color-bearmetal-muted-300: #9878b8;
// 			--color-bearmetal-muted-400: #6e4890;
// 			--color-bearmetal-muted-500: #442868; /* ← identity */
// 			--color-bearmetal-muted-600: #3a2050;
// 			--color-bearmetal-muted-700: #281838;
// 			--color-bearmetal-muted-800: #1a1028;
// 			--color-bearmetal-muted-900: #0e0814;
// 			--color-bearmetal-muted-950: #06040a;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Indigo
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-indigo-50: #eeeeff;
// 			--color-bearmetal-indigo-100: #ccd4f8;
// 			--color-bearmetal-indigo-200: #99aaee;
// 			--color-bearmetal-indigo-300: #6677d8;
// 			--color-bearmetal-indigo-400: #3344b0;
// 			--color-bearmetal-indigo-500: #0f1a60; /* ← identity */
// 			--color-bearmetal-indigo-600: #0c1448;
// 			--color-bearmetal-indigo-700: #080d30;
// 			--color-bearmetal-indigo-800: #040618;
// 			--color-bearmetal-indigo-900: #02030c;
// 			--color-bearmetal-indigo-950: #010106;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Indigo Muted
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-indigo-muted-50: #eeeef6;
// 			--color-bearmetal-indigo-muted-100: #c8cce8;
// 			--color-bearmetal-indigo-muted-200: #9298cc;
// 			--color-bearmetal-indigo-muted-300: #6668a8;
// 			--color-bearmetal-indigo-muted-400: #3c4080;
// 			--color-bearmetal-indigo-muted-500: #1e2248; /* ← identity */
// 			--color-bearmetal-indigo-muted-600: #181a38;
// 			--color-bearmetal-indigo-muted-700: #101228;
// 			--color-bearmetal-indigo-muted-800: #0a0c1a;
// 			--color-bearmetal-indigo-muted-900: #06080e;
// 			--color-bearmetal-indigo-muted-950: #030408;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Yellow
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-yellow-50: #fefce8;
// 			--color-bearmetal-yellow-100: #faf5a0;
// 			--color-bearmetal-yellow-200: #f0e040;
// 			--color-bearmetal-yellow-300: #c8b800;
// 			--color-bearmetal-yellow-400: #948400;
// 			--color-bearmetal-yellow-500: #4a4200; /* ← identity */
// 			--color-bearmetal-yellow-600: #383200;
// 			--color-bearmetal-yellow-700: #262200;
// 			--color-bearmetal-yellow-800: #181400;
// 			--color-bearmetal-yellow-900: #0c0a00;
// 			--color-bearmetal-yellow-950: #060500;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Yellow Muted
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-yellow-muted-50: #faf8e8;
// 			--color-bearmetal-yellow-muted-100: #ede8a8;
// 			--color-bearmetal-yellow-muted-200: #d4c860;
// 			--color-bearmetal-yellow-muted-300: #a8a030;
// 			--color-bearmetal-yellow-muted-400: #787010;
// 			--color-bearmetal-yellow-muted-500: #3c3a10; /* ← identity */
// 			--color-bearmetal-yellow-muted-600: #2e2c0c;
// 			--color-bearmetal-yellow-muted-700: #201e08;
// 			--color-bearmetal-yellow-muted-800: #141204;
// 			--color-bearmetal-yellow-muted-900: #0a0802;
// 			--color-bearmetal-yellow-muted-950: #050401;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Gold
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-gold-50: #fdf6e0;
// 			--color-bearmetal-gold-100: #f5d878;
// 			--color-bearmetal-gold-200: #d4a020;
// 			--color-bearmetal-gold-300: #a87000;
// 			--color-bearmetal-gold-400: #784800;
// 			--color-bearmetal-gold-500: #3c2400; /* ← identity */
// 			--color-bearmetal-gold-600: #2e1c00;
// 			--color-bearmetal-gold-700: #201400;
// 			--color-bearmetal-gold-800: #140c00;
// 			--color-bearmetal-gold-900: #0a0600;
// 			--color-bearmetal-gold-950: #050300;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Gold Muted
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-gold-muted-50: #f8f0e0;
// 			--color-bearmetal-gold-muted-100: #e8d090;
// 			--color-bearmetal-gold-muted-200: #c4a448;
// 			--color-bearmetal-gold-muted-300: #987428;
// 			--color-bearmetal-gold-muted-400: #6c4e10;
// 			--color-bearmetal-gold-muted-500: #342808; /* ← identity */
// 			--color-bearmetal-gold-muted-600: #281e06;
// 			--color-bearmetal-gold-muted-700: #1c1604;
// 			--color-bearmetal-gold-muted-800: #100e02;
// 			--color-bearmetal-gold-muted-900: #080602;
// 			--color-bearmetal-gold-muted-950: #040301;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Pink
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-pink-50: #fef0f4;
// 			--color-bearmetal-pink-100: #fac8d4;
// 			--color-bearmetal-pink-200: #f090a8;
// 			--color-bearmetal-pink-300: #d85878;
// 			--color-bearmetal-pink-400: #aa2848;
// 			--color-bearmetal-pink-500: #580020; /* ← identity */
// 			--color-bearmetal-pink-600: #420018;
// 			--color-bearmetal-pink-700: #2c0010;
// 			--color-bearmetal-pink-800: #1a000a;
// 			--color-bearmetal-pink-900: #0e0006;
// 			--color-bearmetal-pink-950: #060002;

// 			/* ----------------------------------------------------------
// 			   COLOR - BearMetal Pink Muted
// 			   ---------------------------------------------------------- */
// 			--color-bearmetal-pink-muted-50: #fbf0f2;
// 			--color-bearmetal-pink-muted-100: #eacdd2;
// 			--color-bearmetal-pink-muted-200: #cc98a4;
// 			--color-bearmetal-pink-muted-300: #a86878;
// 			--color-bearmetal-pink-muted-400: #7e3c4c;
// 			--color-bearmetal-pink-muted-500: #461e28; /* ← identity */
// 			--color-bearmetal-pink-muted-600: #36181e;
// 			--color-bearmetal-pink-muted-700: #261016;
// 			--color-bearmetal-pink-muted-800: #180a0e;
// 			--color-bearmetal-pink-muted-900: #0c0608;
// 			--color-bearmetal-pink-muted-950: #060304;

// 			/* ----------------------------------------------------------
// 			   COLOR - Semantic
// 			   ---------------------------------------------------------- */
// 			--color-success-text: var(--color-bearmetal-success-500);
// 			--color-success-bg: var(--color-bearmetal-success-50);
// 			--color-success-light: var(--color-bearmetal-success-100);
// 			--color-success: var(--color-bearmetal-success-500);
// 			--color-success-vibrant: var(--color-bearmetal-success-400);
// 			--color-success-dark: var(--color-bearmetal-success-700);

// 			--color-warning-text: var(--color-bearmetal-warning-500);
// 			--color-warning-bg: var(--color-bearmetal-warning-50);
// 			--color-warning-light: var(--color-bearmetal-warning-100);
// 			--color-warning: var(--color-bearmetal-warning-500);
// 			--color-warning-vibrant: var(--color-bearmetal-warning-400);
// 			--color-warning-dark: var(--color-bearmetal-warning-700);

// 			--color-danger-text: var(--color-bearmetal-danger-500);
// 			--color-danger-bg: var(--color-bearmetal-danger-50);
// 			--color-danger-light: var(--color-bearmetal-danger-100);
// 			--color-danger: var(--color-bearmetal-danger-500);
// 			--color-danger-vibrant: var(--color-bearmetal-danger-400);
// 			--color-danger-dark: var(--color-bearmetal-danger-700);

// 			--color-info-text: var(--color-bearmetal-info-500);
// 			--color-info-bg: var(--color-bearmetal-info-50);
// 			--color-info-light: var(--color-bearmetal-info-100);
// 			--color-info: var(--color-bearmetal-info-500);
// 			--color-info-vibrant: var(--color-bearmetal-info-400);
// 			--color-info-dark: var(--color-bearmetal-info-700);

// 			--color-orange-text: var(--color-bearmetal-orange-800);
// 			--color-orange-bg: var(--color-bearmetal-orange-50);
// 			--color-orange-light: var(--color-bearmetal-orange-100);
// 			--color-orange: var(--color-bearmetal-orange-500);
// 			--color-orange-vibrant: var(--color-bearmetal-orange-400);
// 			--color-orange-dark: var(--color-bearmetal-orange-800);

// 			/* ----------------------------------------------------------
// 			   COLOR - Surface / Background aliases
// 			   ---------------------------------------------------------- */
// 			--color-bg: var(--color-bearmetal-grey-50);
// 			--color-bg-subtle: var(--color-bearmetal-grey-100);
// 			--color-bg-muted: var(--color-bearmetal-grey-200);
// 			--color-bg-emphasis: var(--color-bearmetal-grey-300);

// 			--color-surface: var(--color-bearmetal-grey-50);
// 			--color-surface-raised: var(--color-bearmetal-grey-100);
// 			--color-surface-overlay: var(--color-bearmetal-grey-50);

// 			/* ----------------------------------------------------------
// 			   COLOR - Text aliases
// 			   ---------------------------------------------------------- */
// 			--color-text: var(--color-bearmetal-grey-950);
// 			--color-text-subtle: var(--color-bearmetal-grey-700);
// 			--color-text-muted: var(--color-bearmetal-grey-600);
// 			--color-text-disabled: var(--color-bearmetal-pebble-300);
// 			--color-text-inverse: var(--color-bearmetal-pebble-50);
// 			--color-text-on-brand: var(--color-bearmetal-pebble-50);

// 			/* ----------------------------------------------------------
// 			   COLOR - Border aliases
// 			   ---------------------------------------------------------- */
// 			--color-border: var(--color-bearmetal-grey-200);
// 			--color-border-strong: var(--color-bearmetal-grey-300);
// 			--color-border-subtle: var(--color-bearmetal-grey-100);
// 			--color-border-focus: var(--color-bearmetal-info-300);

// 			/* ----------------------------------------------------------
// 			   COLOR - Interactive aliases
// 			   ---------------------------------------------------------- */
// 			--color-interactive: var(--color-bearmetal-400);
// 			--color-interactive-hover: var(--color-bearmetal-500);
// 			--color-interactive-active: var(--color-bearmetal-700);
// 			--color-interactive-disabled: var(--color-bearmetal-pebble-300);
// 			--color-interactive-subtle: var(--color-bearmetal-50);

// 			/* ----------------------------------------------------------
// 			   TYPOGRAPHY - Font families
// 			   ---------------------------------------------------------- */
// 			--font-sans:
// 				"Urbanist",
// 				system-ui,
// 				-apple-system,
// 				BlinkMacSystemFont,
// 				"Segoe UI",
// 				Helvetica,
// 				Arial,
// 				sans-serif,
// 				"Apple Color Emoji";
// 			--font-serif: "Georgia", "Times New Roman", Times, serif;
// 			--font-mono:
// 				"JetBrains Mono",
// 				"Fira Code",
// 				"Cascadia Code",
// 				ui-monospace,
// 				"Courier New",
// 				monospace;
// 			--font-display: var(--font-sans);
// 			--font-body: var(--font-sans);

// 			/* ----------------------------------------------------------
// 			   TYPOGRAPHY - Scale (Major Third: 1.25)
// 			   ---------------------------------------------------------- */
// 			--text-xs: 0.64rem;
// 			--text-sm: 0.8rem;
// 			--text-base: 1rem;
// 			--text-md: 1.25rem;
// 			--text-lg: 1.563rem;
// 			--text-xl: 1.953rem;
// 			--text-2xl: 2.441rem;
// 			--text-3xl: 3.052rem;
// 			--text-4xl: 3.815rem;

// 			/* ----------------------------------------------------------
// 			   TYPOGRAPHY - Line heights
// 			   ---------------------------------------------------------- */
// 			--leading-none: 1;
// 			--leading-tight: 1.25;
// 			--leading-snug: 1.375;
// 			--leading-normal: 1.5;
// 			--leading-relaxed: 1.625;
// 			--leading-loose: 2;

// 			/* ----------------------------------------------------------
// 			   TYPOGRAPHY - Font weights
// 			   ---------------------------------------------------------- */
// 			--weight-thin: 100;
// 			--weight-light: 300;
// 			--weight-normal: 400;
// 			--weight-medium: 500;
// 			--weight-semibold: 600;
// 			--weight-bold: 700;
// 			--weight-extrabold: 800;
// 			--weight-black: 900;

// 			/* ----------------------------------------------------------
// 			   TYPOGRAPHY - Letter spacing
// 			   ---------------------------------------------------------- */
// 			--tracking-tighter: -0.05em;
// 			--tracking-tight: -0.025em;
// 			--tracking-normal: 0;
// 			--tracking-wide: 0.025em;
// 			--tracking-wider: 0.05em;
// 			--tracking-widest: 0.1em;

// 			/* ----------------------------------------------------------
// 			   SPACING - Base unit + scale
// 			   ---------------------------------------------------------- */
// 			--space-unit: 0.25rem;

// 			--space-0: 0;
// 			--space-px: 1px;
// 			--space-0-5: calc(var(--space-unit) * 0.5);
// 			--space-1: calc(var(--space-unit) * 1);
// 			--space-1-5: calc(var(--space-unit) * 1.5);
// 			--space-2: calc(var(--space-unit) * 2);
// 			--space-2-5: calc(var(--space-unit) * 2.5);
// 			--space-3: calc(var(--space-unit) * 3);
// 			--space-4: calc(var(--space-unit) * 4);
// 			--space-5: calc(var(--space-unit) * 5);
// 			--space-6: calc(var(--space-unit) * 6);
// 			--space-7: calc(var(--space-unit) * 7);
// 			--space-8: calc(var(--space-unit) * 8);
// 			--space-10: calc(var(--space-unit) * 10);
// 			--space-12: calc(var(--space-unit) * 12);
// 			--space-14: calc(var(--space-unit) * 14);
// 			--space-16: calc(var(--space-unit) * 16);
// 			--space-20: calc(var(--space-unit) * 20);
// 			--space-24: calc(var(--space-unit) * 24);
// 			--space-32: calc(var(--space-unit) * 32);
// 			--space-40: calc(var(--space-unit) * 40);
// 			--space-48: calc(var(--space-unit) * 48);
// 			--space-64: calc(var(--space-unit) * 64);

// 			/* ----------------------------------------------------------
// 			   BORDER RADIUS
// 			   ---------------------------------------------------------- */
// 			--radius-none: 0;
// 			--radius-sm: 0.125rem;
// 			--radius-base: 0.25rem;
// 			--radius-md: 0.375rem;
// 			--radius-lg: 0.5rem;
// 			--radius-xl: 0.75rem;
// 			--radius-2xl: 1rem;
// 			--radius-3xl: 1.5rem;
// 			--radius-full: 9999px;

// 			/* ----------------------------------------------------------
// 			   BORDER WIDTH
// 			   ---------------------------------------------------------- */
// 			--border-0: 0;
// 			--border-1: 1px;
// 			--border-1-5: 1.5px;
// 			--border-2: 2px;
// 			--border-4: 4px;
// 			--border-8: 8px;

// 			/* ----------------------------------------------------------
// 			   SHADOWS
// 			   ---------------------------------------------------------- */
// 			--shadow-none: none;
// 			--shadow-xs: 0 1px 2px 0 rgb(0 0 0 / 0.05);
// 			--shadow-sm: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
// 			--shadow-base: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
// 			--shadow-md: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
// 			--shadow-lg: 0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1);
// 			--shadow-xl: 0 25px 50px -12px rgb(0 0 0 / 0.25);
// 			--shadow-inner: inset 0 2px 4px 0 rgb(0 0 0 / 0.05);
// 			--shadow-focus: 0 0 0 3px rgb(from var(--color-bearmetal-600) r g b / 0.35);

// 			/* ----------------------------------------------------------
// 			   Z-INDEX
// 			   ---------------------------------------------------------- */
// 			--z-hide: -1;
// 			--z-base: 0;
// 			--z-raised: 10;
// 			--z-dropdown: 100;
// 			--z-sticky: 200;
// 			--z-overlay: 300;
// 			--z-modal: 400;
// 			--z-popover: 500;
// 			--z-toast: 600;
// 			--z-tooltip: 700;
// 			--z-top: 9999;

// 			/* ----------------------------------------------------------
// 			   TRANSITIONS
// 			   ---------------------------------------------------------- */
// 			--duration-instant: 0ms;
// 			--duration-fast: 80ms;
// 			--duration-base: 150ms;
// 			--duration-slow: 300ms;
// 			--duration-slower: 500ms;
// 			--duration-lazy: 700ms;

// 			--ease-linear: linear;
// 			--ease-in: cubic-bezier(0.4, 0, 1, 1);
// 			--ease-out: cubic-bezier(0, 0, 0.2, 1);
// 			--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
// 			--ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);
// 			--ease-bounce: cubic-bezier(0.68, -0.55, 0.265, 1.55);

// 			--transition-colors:
// 				color var(--duration-base) var(--ease-in-out),
// 				background-color var(--duration-base) var(--ease-in-out),
// 				border-color var(--duration-base) var(--ease-in-out),
// 				text-decoration-color var(--duration-base) var(--ease-in-out),
// 				fill var(--duration-base) var(--ease-in-out),
// 				stroke var(--duration-base) var(--ease-in-out);
// 			--transition-opacity: opacity var(--duration-base) var(--ease-in-out);
// 			--transition-shadow: box-shadow var(--duration-base) var(--ease-in-out);
// 			--transition-transform: transform var(--duration-base) var(--ease-in-out);
// 			--transition-all: all var(--duration-base) var(--ease-in-out);

// 			/* ----------------------------------------------------------
// 			   LAYOUT - Breakpoints
// 			   ---------------------------------------------------------- */
// 			--bp-xs: 480px;
// 			--bp-sm: 640px;
// 			--bp-md: 768px;
// 			--bp-lg: 1024px;
// 			--bp-xl: 1280px;
// 			--bp-2xl: 1536px;

// 			/* ----------------------------------------------------------
// 			   LAYOUT - Container widths
// 			   ---------------------------------------------------------- */
// 			--container-xs: 480px;
// 			--container-sm: 640px;
// 			--container-md: 768px;
// 			--container-lg: 1024px;
// 			--container-xl: 1280px;
// 			--container-2xl: 1536px;
// 			--container-prose: 65ch;

// 			/* ----------------------------------------------------------
// 			   LAYOUT - Grid
// 			   ---------------------------------------------------------- */
// 			--grid-cols: 12;
// 			--grid-gap: var(--space-6);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Button
// 			   ---------------------------------------------------------- */
// 			--btn-font-family: var(--font-body);
// 			--btn-font-weight: var(--weight-semibold);
// 			--btn-letter-spacing: var(--tracking-wide);
// 			--btn-border-width: var(--border-2);
// 			--btn-transition:
// 				var(--transition-colors),
// 				var(--transition-shadow),
// 				var(--transition-transform);

// 			--btn-padding-y-xs: var(--space-1);
// 			--btn-padding-x-xs: var(--space-2);
// 			--btn-font-size-xs: var(--text-xs);
// 			--btn-radius-xs: var(--radius-base);

// 			--btn-padding-y-sm: var(--space-1-5);
// 			--btn-padding-x-sm: var(--space-3);
// 			--btn-font-size-sm: var(--text-sm);
// 			--btn-radius-sm: var(--radius-md);

// 			--btn-padding-y-base: var(--space-2);
// 			--btn-padding-x-base: var(--space-4);
// 			--btn-font-size-base: var(--text-base);
// 			--btn-radius-base: var(--radius-md);

// 			--btn-padding-y-lg: var(--space-3);
// 			--btn-padding-x-lg: var(--space-6);
// 			--btn-font-size-lg: var(--text-md);
// 			--btn-radius-lg: var(--radius-lg);

// 			--btn-primary-bg: var(--color-interactive);
// 			--btn-primary-bg-hover: var(--color-interactive-hover);
// 			--btn-primary-bg-active: var(--color-interactive-active);
// 			--btn-primary-color: var(--color-text-on-brand);
// 			--btn-primary-border: transparent;
// 			--btn-primary-shadow: var(--shadow-xs);

// 			--btn-secondary-bg: var(--color-surface);
// 			--btn-secondary-bg-hover: var(--color-bg-muted);
// 			--btn-secondary-color: var(--color-text);
// 			--btn-secondary-border: var(--color-border-strong);
// 			--btn-secondary-shadow: var(--shadow-xs);

// 			--btn-ghost-bg: transparent;
// 			--btn-ghost-bg-hover: var(--color-bg-muted);
// 			--btn-ghost-color: var(--color-text-subtle);
// 			--btn-ghost-border: transparent;

// 			--btn-danger-bg: var(--color-bearmetal-danger-300);
// 			--btn-danger-bg-hover: var(--color-danger-dark);
// 			--btn-danger-color: var(--color-bearmetal-pebble-50);
// 			--btn-danger-border: transparent;

// 			--btn-warning-bg: var(--color-bearmetal-warning-300);
// 			--btn-warning-bg-hover: var(--color-warning-dark);
// 			--btn-warning-color: var(--color-bearmetal-pebble-50);
// 			--btn-warning-border: transparent;

// 			--btn-info-bg: var(--color-bearmetal-info-300);
// 			--btn-info-bg-hover: var(--color-info-dark);
// 			--btn-info-color: var(--color-bearmetal-pebble-50);
// 			--btn-info-border: transparent;

// 			--btn-success-bg: var(--color-bearmetal-success-300);
// 			--btn-success-bg-hover: var(--color-success-dark);
// 			--btn-success-color: var(--color-bearmetal-pebble-50);
// 			--btn-success-border: transparent;

// 			--btn-orange-bg: var(--color-bearmetal-orange-200);
// 			--btn-orange-bg-hover: var(--color-orange-dark);
// 			--btn-orange-color: var(--color-bearmetal-pebble-50);
// 			--btn-orange-border: transparent;

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Input / Textarea / Select
// 			   ---------------------------------------------------------- */
// 			--input-font-family: var(--font-body);
// 			--input-font-size: var(--text-base);
// 			--input-font-size-sm: var(--text-sm);
// 			--input-font-size-lg: var(--text-md);
// 			--input-bg: var(--color-surface);
// 			--input-bg-disabled: var(--color-bg-muted);
// 			--input-color: var(--color-text);
// 			--input-color-placeholder: var(--color-text-muted);
// 			--input-border: var(--color-border-strong);
// 			--input-border-hover: var(--color-bearmetal-pebble-400);
// 			--input-border-focus: var(--color-border-focus);
// 			--input-border-error: var(--color-danger);
// 			--input-border-width: var(--border-1);
// 			--input-radius: var(--radius-md);
// 			--input-padding-y: var(--space-2);
// 			--input-padding-x: var(--space-3);
// 			--input-shadow: var(--shadow-xs);
// 			--input-shadow-focus: var(--shadow-focus);
// 			--input-transition: var(--transition-colors), var(--transition-shadow);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Card
// 			   ---------------------------------------------------------- */
// 			--card-bg: var(--color-surface);
// 			--card-border: var(--color-border);
// 			--card-border-width: var(--border-1);
// 			--card-radius: var(--radius-base);
// 			--card-shadow: var(--shadow-sm);
// 			--card-padding: var(--space-6);
// 			--card-padding-sm: var(--space-4);
// 			--card-padding-lg: var(--space-8);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Badge / Tag
// 			   ---------------------------------------------------------- */
// 			--badge-font-size: var(--text-xs);
// 			--badge-font-weight: var(--weight-semibold);
// 			--badge-padding-y: var(--space-0-5);
// 			--badge-padding-x: var(--space-2);
// 			--badge-radius: var(--radius-full);
// 			--badge-letter-spacing: var(--tracking-wide);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Modal / Dialog
// 			   ---------------------------------------------------------- */
// 			--modal-bg: var(--color-surface-overlay);
// 			--modal-border: var(--color-border);
// 			--modal-radius: var(--radius-2xl);
// 			--modal-shadow: var(--shadow-xl);
// 			--modal-padding: var(--space-8);
// 			--modal-max-width-sm: 24rem;
// 			--modal-max-width-base: 32rem;
// 			--modal-max-width-lg: 48rem;
// 			--modal-max-width-xl: 64rem;
// 			--modal-backdrop: rgb(0 0 0 / 0.5);
// 			--modal-backdrop-blur: 4px;

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Toast / Notification
// 			   ---------------------------------------------------------- */
// 			--toast-bg: var(--color-bearmetal-pebble-200);
// 			--toast-color: var(--color-bearmetal-pebble-900);
// 			--toast-border: var(--color-bearmetal-pebble-400);
// 			--toast-border-radius: var(--radius-lg);
// 			--toast-shadow: var(--shadow-lg);
// 			--toast-padding-y: var(--space-3);
// 			--toast-padding-x: var(--space-4);
// 			--toast-font-size: var(--text-sm);
// 			--toast-max-width: 24rem;

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Tooltip
// 			   ---------------------------------------------------------- */
// 			--tooltip-bg: var(--color-bearmetal-pebble-800);
// 			--tooltip-color: var(--color-bearmetal-pebble-50);
// 			--tooltip-font-size: var(--text-xs);
// 			--tooltip-padding-y: var(--space-1);
// 			--tooltip-padding-x: var(--space-2);
// 			--tooltip-radius: var(--radius-base);
// 			--tooltip-shadow: var(--shadow-md);
// 			--tooltip-max-width: 16rem;

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Table
// 			   ---------------------------------------------------------- */
// 			--table-bg: transparent;
// 			--table-header-bg: var(--color-bg-subtle);
// 			--table-row-bg-alt: var(--color-bg-subtle);
// 			--table-row-bg-hover: var(--color-bg-muted);
// 			--table-border: var(--color-border);
// 			--table-cell-padding-y: var(--space-3);
// 			--table-cell-padding-x: var(--space-4);
// 			--table-font-size: var(--text-sm);
// 			--table-header-font-weight: var(--weight-semibold);
// 			--table-header-color: var(--color-text-subtle);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Navigation / Navbar
// 			   ---------------------------------------------------------- */
// 			--nav-bg: var(--color-surface);
// 			--nav-border: var(--color-border);
// 			--nav-height: var(--space-16);
// 			--nav-shadow: var(--shadow-xs);
// 			--nav-item-color: var(--color-text-subtle);
// 			--nav-item-color-hover: var(--color-text);
// 			--nav-item-color-active: var(--color-interactive);
// 			--nav-item-bg-hover: var(--color-bg-muted);
// 			--nav-item-font-weight: var(--weight-medium);
// 			--nav-item-font-size: var(--text-sm);
// 			--nav-item-radius: var(--radius-md);
// 			--nav-item-padding-y: var(--space-2);
// 			--nav-item-padding-x: var(--space-3);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Sidebar
// 			   ---------------------------------------------------------- */
// 			--sidebar-bg: var(--color-bg-subtle);
// 			--sidebar-border: var(--color-border);
// 			--sidebar-width: 16rem;
// 			--sidebar-width-collapsed: 4rem;
// 			--sidebar-padding: var(--space-4);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Avatar
// 			   ---------------------------------------------------------- */
// 			--avatar-size-xs: var(--space-6);
// 			--avatar-size-sm: var(--space-8);
// 			--avatar-size-base: var(--space-10);
// 			--avatar-size-lg: var(--space-14);
// 			--avatar-size-xl: var(--space-16);
// 			--avatar-radius: var(--radius-full);
// 			--avatar-border: var(--color-bearmetal-pebble-50);
// 			--avatar-border-width: 2px;
// 			--avatar-bg: var(--color-bearmetal-100);
// 			--avatar-color: var(--color-bearmetal-700);
// 			--avatar-font-weight: var(--weight-semibold);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Progress / Spinner
// 			   ---------------------------------------------------------- */
// 			--progress-bg: var(--color-bg-emphasis);
// 			--progress-fill: var(--color-interactive);
// 			--progress-height: var(--space-2);
// 			--progress-radius: var(--radius-full);

// 			--spinner-color: var(--color-interactive);
// 			--spinner-track-color: var(--color-bg-emphasis);
// 			--spinner-size-sm: var(--space-4);
// 			--spinner-size-base: var(--space-6);
// 			--spinner-size-lg: var(--space-8);
// 			--spinner-size-xl: var(--space-10);
// 			--spinner-thickness: 2px;

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Skeleton
// 			   ---------------------------------------------------------- */
// 			--skeleton-bg: var(--color-bg-emphasis);
// 			--skeleton-shine: var(--color-bg-muted);
// 			--skeleton-radius: var(--radius-base);
// 			--skeleton-duration: 1.5s;

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Alert / Banner
// 			   ---------------------------------------------------------- */
// 			--alert-padding-y: var(--space-3);
// 			--alert-padding-x: var(--space-4);
// 			--alert-radius: var(--radius-lg);
// 			--alert-border-width: var(--border-1);
// 			--alert-font-size: var(--text-sm);

// 			--alert-info-bg: var(--color-info-light);
// 			--alert-info-border: var(--color-info);
// 			--alert-info-color: var(--color-info-dark);

// 			--alert-success-bg: var(--color-success-light);
// 			--alert-success-border: var(--color-success);
// 			--alert-success-color: var(--color-success-dark);

// 			--alert-warning-bg: var(--color-warning-light);
// 			--alert-warning-border: var(--color-warning);
// 			--alert-warning-color: var(--color-warning-dark);

// 			--alert-danger-bg: var(--color-danger-light);
// 			--alert-danger-border: var(--color-danger);
// 			--alert-danger-color: var(--color-danger-dark);

// 			--alert-orange-bg: var(--color-orange-light);
// 			--alert-orange-border: var(--color-orange);
// 			--alert-orange-color: var(--color-orange-dark);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Divider
// 			   ---------------------------------------------------------- */
// 			--divider-color: var(--color-border);
// 			--divider-width: var(--border-1);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Tabs
// 			   ---------------------------------------------------------- */
// 			--tab-bar-border: var(--color-border);
// 			--tab-item-color: var(--color-text-subtle);
// 			--tab-item-color-hover: var(--color-text);
// 			--tab-item-color-active: var(--color-interactive);
// 			--tab-item-font-weight: var(--weight-medium);
// 			--tab-item-font-size: var(--text-sm);
// 			--tab-indicator-color: var(--color-interactive);
// 			--tab-indicator-height: 2px;
// 			--tab-padding-y: var(--space-3);
// 			--tab-padding-x: var(--space-4);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Toggle / Switch
// 			   ---------------------------------------------------------- */
// 			--toggle-bg-off: var(--color-bearmetal-pebble-300);
// 			--toggle-bg-on: var(--color-interactive);
// 			--toggle-thumb-bg: var(--color-bearmetal-pebble-50);
// 			--toggle-thumb-shadow: var(--shadow-sm);
// 			--toggle-width: 2.75rem;
// 			--toggle-height: 1.5rem;
// 			--toggle-thumb-size: 1.25rem;
// 			--toggle-radius: var(--radius-full);
// 			--toggle-transition: var(--transition-colors), var(--transition-transform);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Checkbox & Radio
// 			   ---------------------------------------------------------- */
// 			--check-size: 1rem;
// 			--check-border: var(--color-border-strong);
// 			--check-border-hover: var(--color-bearmetal-400);
// 			--check-bg: var(--color-surface);
// 			--check-bg-checked: var(--color-interactive);
// 			--check-border-checked: var(--color-interactive);
// 			--check-color: var(--color-bearmetal-pebble-50);
// 			--check-radius: var(--radius-base);
// 			--radio-radius: var(--radius-full);
// 			--check-transition: var(--transition-colors);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Dropdown / Select Menu
// 			   ---------------------------------------------------------- */
// 			--dropdown-bg: var(--color-surface-overlay);
// 			--dropdown-border: var(--color-border);
// 			--dropdown-radius: var(--radius-lg);
// 			--dropdown-shadow: var(--shadow-md);
// 			--dropdown-padding-y: var(--space-1);
// 			--dropdown-item-padding-y: var(--space-2);
// 			--dropdown-item-padding-x: var(--space-3);
// 			--dropdown-item-font-size: var(--text-sm);
// 			--dropdown-item-color: var(--color-text);
// 			--dropdown-item-color-hover: var(--color-text);
// 			--dropdown-item-bg-hover: var(--color-bg-muted);
// 			--dropdown-item-bg-active: var(--color-interactive-subtle);
// 			--dropdown-item-color-active: var(--color-interactive);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Breadcrumb
// 			   ---------------------------------------------------------- */
// 			--breadcrumb-font-size: var(--text-sm);
// 			--breadcrumb-color: var(--color-text-subtle);
// 			--breadcrumb-color-active: var(--color-text);
// 			--breadcrumb-separator-color: var(--color-text-muted);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Pagination
// 			   ---------------------------------------------------------- */
// 			--pagination-item-size: var(--space-8);
// 			--pagination-item-radius: var(--radius-md);
// 			--pagination-item-bg: transparent;
// 			--pagination-item-bg-hover: var(--color-bg-muted);
// 			--pagination-item-bg-active: var(--color-interactive);
// 			--pagination-item-color: var(--color-text-subtle);
// 			--pagination-item-color-hover: var(--color-text);
// 			--pagination-item-color-active: var(--color-text-on-brand);
// 			--pagination-item-font-size: var(--text-sm);
// 			--pagination-item-font-weight: var(--weight-medium);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Form Field (label + input wrapper)
// 			   ---------------------------------------------------------- */
// 			--field-label-font-size: var(--text-sm);
// 			--field-label-font-weight: var(--weight-medium);
// 			--field-label-color: var(--color-text);
// 			--field-label-gap: var(--space-1-5);
// 			--field-hint-font-size: var(--text-xs);
// 			--field-hint-color: var(--color-text-subtle);
// 			--field-error-font-size: var(--text-xs);
// 			--field-error-color: var(--color-danger);
// 			--field-gap: var(--space-4);

// 			/* ----------------------------------------------------------
// 			   COMPONENT TOKENS - Empty State
// 			   ---------------------------------------------------------- */
// 			--empty-icon-color: var(--color-text-muted);
// 			--empty-title-color: var(--color-text);
// 			--empty-body-color: var(--color-text-subtle);
// 			--empty-padding: var(--space-12);
// 		}

// 		/* ============================================================
// 		   SECTION 2 - DARK MODE
// 		   ============================================================ */

// 		@media (prefers-color-scheme: dark) {
// 			:root {
// 				--color-bg: var(--color-bearmetal-grey-950);
// 				--color-bg-subtle: var(--color-bearmetal-grey-900);
// 				--color-bg-muted: var(--color-bearmetal-grey-800);
// 				--color-bg-emphasis: var(--color-bearmetal-grey-700);

// 				--color-surface: var(--color-bearmetal-grey-900);
// 				--color-surface-raised: var(--color-bearmetal-grey-800);
// 				--color-surface-overlay: var(--color-bearmetal-grey-900);

// 				--color-text: var(--color-bearmetal-grey-50);
// 				--color-text-subtle: var(--color-bearmetal-100);
// 				--color-text-muted: var(--color-bearmetal-grey-500);
// 				--color-text-disabled: var(--color-bearmetal-grey-700);

// 				--color-border: var(--color-bearmetal-grey-800);
// 				--color-border-strong: var(--color-bearmetal-grey-700);
// 				--color-border-subtle: var(--color-bearmetal-grey-900);

// 				--color-interactive: var(--color-bearmetal-600);
// 				--color-interactive-hover: var(--color-bearmetal-700);

// 				--toast-bg: var(--color-bearmetal-grey-800);
// 				--toast-color: var(--color-bearmetal-grey-50);
// 				--toast-border: var(--color-bearmetal-grey-700);
// 				--modal-backdrop: rgb(0 0 0 / 0.7);

// 				--color-success-text: var(--color-bearmetal-success-50);
// 				--color-danger-text: var(--color-bearmetal-danger-50);
// 				--color-info-text: var(--color-bearmetal-info-50);
// 				--color-warning-text: var(--color-bearmetal-warning-50);
// 				--color-orange-text: var(--color-bearmetal-orange-50);

// 				--color-success-bg: var(--color-bearmetal-success-500);
// 				--color-danger-bg: var(--color-bearmetal-danger-500);
// 				--color-info-bg: var(--color-bearmetal-info-500);
// 				--color-warning-bg: var(--color-bearmetal-warning-500);
// 				--color-orange-bg: var(--color-bearmetal-orange-600);

// 				--btn-danger-bg: var(--color-danger);
// 				--btn-warning-bg: var(--color-warning);
// 				--btn-info-bg: var(--color-info);
// 				--btn-success-bg: var(--color-success);
// 				--btn-orange-bg: var(--color-orange);
// 			}
// 		}

// 		[data-theme="dark"] {
// 			--color-bg: var(--color-bearmetal-grey-950);
// 			--color-bg-subtle: var(--color-bearmetal-grey-900);
// 			--color-bg-muted: var(--color-bearmetal-grey-800);
// 			--color-bg-emphasis: var(--color-bearmetal-grey-700);

// 			--color-surface: var(--color-bearmetal-grey-900);
// 			--color-surface-raised: var(--color-bearmetal-grey-800);
// 			--color-surface-overlay: var(--color-bearmetal-grey-900);

// 			--color-text: var(--color-bearmetal-grey-50);
// 			--color-text-subtle: var(--color-bearmetal-grey-400);
// 			--color-text-muted: var(--color-bearmetal-grey-500);
// 			--color-text-disabled: var(--color-bearmetal-grey-700);

// 			--color-border: var(--color-bearmetal-grey-800);
// 			--color-border-strong: var(--color-bearmetal-grey-700);
// 			--color-border-subtle: var(--color-bearmetal-grey-900);

// 			--color-interactive: var(--color-bearmetal-600);
// 			--color-interactive-hover: var(--color-bearmetal-700);

// 			--toast-bg: var(--color-bearmetal-grey-800);
// 			--toast-color: var(--color-bearmetal-grey-50);
// 			--toast-border: var(--color-bearmetal-grey-700);
// 			--modal-backdrop: rgb(0 0 0 / 0.7);

// 			--color-success-text: var(--color-bearmetal-success-50);
// 			--color-danger-text: var(--color-bearmetal-danger-50);
// 			--color-info-text: var(--color-bearmetal-info-50);
// 			--color-warning-text: var(--color-bearmetal-warning-50);

// 			--color-success-bg: var(--color-bearmetal-success-500);
// 			--color-danger-bg: var(--color-bearmetal-danger-500);
// 			--color-info-bg: var(--color-bearmetal-info-500);
// 			--color-warning-bg: var(--color-bearmetal-warning-500);

// 			--btn-danger-bg: var(--color-danger);
// 			--btn-warning-bg: var(--color-warning);
// 			--btn-info-bg: var(--color-info);
// 			--btn-success-bg: var(--color-success);
// 		}

// 		[data-theme="light"] {
// 			--color-bg: var(--color-bearmetal-grey-50);
// 			--color-bg-subtle: var(--color-bearmetal-grey-100);
// 			--color-bg-muted: var(--color-bearmetal-grey-200);
// 			--color-bg-emphasis: var(--color-bearmetal-grey-300);

// 			--color-surface: var(--color-bearmetal-grey-50);
// 			--color-surface-raised: var(--color-bearmetal-grey-100);
// 			--color-surface-overlay: var(--color-bearmetal-grey-50);

// 			--color-text: var(--color-bearmetal-grey-900);
// 			--color-text-subtle: var(--color-bearmetal-grey-600);
// 			--color-text-muted: var(--color-bearmetal-grey-400);
// 			--color-text-disabled: var(--color-bearmetal-grey-300);

// 			--color-border: var(--color-bearmetal-grey-200);
// 			--color-border-strong: var(--color-bearmetal-grey-300);
// 			--color-border-subtle: var(--color-bearmetal-grey-100);

// 			--color-interactive: var(--color-bearmetal-400);
// 			--color-interactive-hover: var(--color-bearmetal-500);

// 			--toast-bg: var(--color-bearmetal-pebble-200);
// 			--toast-color: var(--color-bearmetal-pebble-900);
// 			--toast-border: var(--color-bearmetal-pebble-400);

// 			--color-success-text: var(--color-bearmetal-success-500);
// 			--color-danger-text: var(--color-bearmetal-danger-500);
// 			--color-info-text: var(--color-bearmetal-info-500);
// 			--color-warning-text: var(--color-bearmetal-warning-500);

// 			--color-success-bg: var(--color-bearmetal-success-50);
// 			--color-danger-bg: var(--color-bearmetal-danger-50);
// 			--color-info-bg: var(--color-bearmetal-info-50);
// 			--color-warning-bg: var(--color-bearmetal-warning-50);

// 			--btn-danger-bg: var(--color-bearmetal-danger-300);
// 			--btn-warning-bg: var(--color-bearmetal-warning-300);
// 			--btn-info-bg: var(--color-bearmetal-info-300);
// 			--btn-success-bg: var(--color-bearmetal-success-300);
// 		}

// 		/* ============================================================
// 		   SECTION 3 - RESET / BASE STYLES
// 		   ============================================================ */

// 		*,
// 		*::before,
// 		*::after {
// 			box-sizing: border-box;
// 			margin: 0;
// 			padding: 0;
// 		}

// 		html {
// 			font-size: 16px;
// 			-webkit-text-size-adjust: 100%;
// 			tab-size: 2;
// 			scroll-behavior: smooth;
// 		}

// 		body {
// 			font-family: var(--font-body);
// 			font-size: var(--text-base);
// 			line-height: var(--leading-normal);
// 			color: var(--color-text);
// 			background-color: var(--color-bg);
// 			-webkit-font-smoothing: antialiased;
// 			-moz-osx-font-smoothing: grayscale;
// 		}

// 		img,
// 		video,
// 		svg {
// 			display: block;
// 			max-width: 100%;
// 		}

// 		img {
// 			height: auto;
// 		}

// 		button,
// 		input,
// 		select,
// 		textarea {
// 			font: inherit;
// 			color: inherit;
// 		}

// 		button {
// 			cursor: pointer;
// 		}

// 		a {
// 			color: var(--color-interactive);
// 			text-decoration: underline;
// 			text-underline-offset: 0.15em;
// 			transition: var(--transition-colors);
// 		}

// 		a:hover {
// 			color: var(--color-interactive-hover);
// 		}

// 		p,
// 		h1,
// 		h2,
// 		h3,
// 		h4,
// 		h5,
// 		h6 {
// 			overflow-wrap: break-word;
// 		}

// 		h1,
// 		h2,
// 		h3,
// 		h4,
// 		h5,
// 		h6 {
// 			font-family: var(--font-display);
// 			font-weight: var(--weight-bold);
// 			line-height: var(--leading-tight);
// 			color: var(--color-text);
// 		}

// 		h1 {
// 			font-size: var(--text-3xl);
// 		}
// 		h2 {
// 			font-size: var(--text-2xl);
// 		}
// 		h3 {
// 			font-size: var(--text-xl);
// 		}
// 		h4 {
// 			font-size: var(--text-lg);
// 		}
// 		h5 {
// 			font-size: var(--text-md);
// 		}
// 		h6 {
// 			font-size: var(--text-base);
// 		}

// 		code,
// 		kbd,
// 		samp,
// 		pre {
// 			font-family: var(--font-mono);
// 			font-size: 0.9em;
// 		}

// 		code {
// 			background-color: var(--color-bg-muted);
// 			color: var(--color-text-subtle);
// 			padding: var(--space-1);
// 			border-radius: var(--radius-base);
// 		}

// 		pre {
// 			overflow: auto;
// 			padding: var(--space-4);
// 			background: var(--color-bg-muted);
// 			border-radius: var(--radius-lg);
// 			border: var(--border-1) solid var(--color-border);
// 		}

// 		ol,
// 		ul {
// 			padding-left: 1rem;
// 		}

// 		span.highlight {
// 			background-color: var(--color-bearmetal-400);
// 			color: var(--color-text-subtle);
// 			display: inline-block;
// 			padding: 0 var(--space-0-5);
// 			border-radius: var(--radius-base);
// 		}

// 		:focus-visible {
// 			outline: var(--border-2) solid var(--color-border-focus);
// 			outline-offset: 2px;
// 			border-radius: var(--radius-base);
// 		}

// 		:focus:not(:focus-visible) {
// 			outline: none;
// 		}

// 		[disabled],
// 		[aria-disabled="true"] {
// 			cursor: not-allowed;
// 			opacity: 0.5;
// 			pointer-events: none;
// 		}

// 		@media (prefers-reduced-motion: reduce) {
// 			*,
// 			*::before,
// 			*::after {
// 				animation-duration: 0.01ms !important;
// 				animation-iteration-count: 1 !important;
// 				transition-duration: 0.01ms !important;
// 				scroll-behavior: auto !important;
// 			}
// 		}

// 		/* ============================================================
// 		   SECTION 4 - UTILITY HELPERS
// 		   ============================================================ */

// 		.container {
// 			width: 100%;
// 			max-width: var(--container-xl);
// 			margin-inline: auto;
// 			padding-inline: var(--space-6);
// 		}

// 		.sr-only {
// 			position: absolute;
// 			width: 1px;
// 			height: 1px;
// 			padding: 0;
// 			margin: -1px;
// 			overflow: hidden;
// 			clip: rect(0, 0, 0, 0);
// 			white-space: nowrap;
// 			border: 0;
// 		}

// 		.divider {
// 			border: none;
// 			border-top: var(--divider-width) solid var(--divider-color);
// 			margin-block: var(--space-4);
// 		}

// 		.divider--vertical {
// 			border-top: none;
// 			border-left: var(--divider-width) solid var(--divider-color);
// 			align-self: stretch;
// 			margin-block: 0;
// 			margin-inline: var(--space-4);
// 		}

// 		@keyframes bm-shimmer {
// 			0% {
// 				background-position: 200% center;
// 			}
// 			100% {
// 				background-position: -200% center;
// 			}
// 		}

// 		.skeleton {
// 			display: block;
// 			border-radius: var(--skeleton-radius);
// 			background: linear-gradient(
// 				90deg,
// 				var(--skeleton-bg) 25%,
// 				var(--skeleton-shine) 50%,
// 				var(--skeleton-bg) 75%
// 			);
// 			background-size: 200% 100%;
// 			animation: bm-shimmer var(--skeleton-duration) linear infinite;
// 		}

// 		@keyframes bm-spin {
// 			to {
// 				transform: rotate(360deg);
// 			}
// 		}

// 		.spinner {
// 			display: inline-block;
// 			width: var(--spinner-size-base);
// 			height: var(--spinner-size-base);
// 			border: var(--spinner-thickness) solid var(--spinner-track-color);
// 			border-top-color: var(--spinner-color);
// 			border-radius: var(--radius-full);
// 			animation: bm-spin 0.7s linear infinite;
// 		}

// 		.spinner--sm {
// 			width: var(--spinner-size-sm);
// 			height: var(--spinner-size-sm);
// 		}
// 		.spinner--lg {
// 			width: var(--spinner-size-lg);
// 			height: var(--spinner-size-lg);
// 		}
// 		.spinner--xl {
// 			width: var(--spinner-size-xl);
// 			height: var(--spinner-size-xl);
// 		}

// 		.flex {
// 			display: flex;
// 		}
// 	`,
// );

// injectStyle(
// 	"bm-components",
// 	css`
// 		/* ============================================================
// 		   form elements
// 		   ============================================================ */

// 		input,
// 		select,
// 		textarea {
// 			font-family: var(--input-font-family);
// 			font-size: var(--input-font-size);
// 			background-color: var(--input-bg);
// 			color: var(--input-text);
// 			border: var(--input-border) solid var(--input-border-width);
// 			border-radius: var(--input-radius);
// 			padding: var(--input-padding-y) var(--input-padding-x);
// 			box-shadow: var(--input-shadow);
// 			transition: var(--input-transition);

// 			&.small {
// 				font-size: var(--input-font-size-sm);
// 			}
// 			&.large {
// 				font-size: var(--input-font-size-lg);
// 			}
// 			&:focus {
// 				border-color: var(--input-border-focus);
// 			}
// 			&:hover {
// 				border-color: var(--input-border-hover);
// 			}
// 			&:invalid {
// 				border-color: var(--input-border-error);
// 			}
// 		}

// 		fieldset {
// 			padding: var(--space-2);
// 			display: grid;
// 			grid-template-columns: 1fr;
// 			border: var(--color-text-subtle) solid var(--border-1);
// 			border-radius: var(--radius-base);
// 			gap: var(--space-2);
// 		}

// 		input[type="submit"],
// 		input[type="reset"],
// 		input[type="button"],
// 		button {
// 			font-family: var(--btn-font-family);
// 			font-weight: var(--btn-font-weight);
// 			font-size: var(--btn-font-size-base);
// 			letter-spacing: var(--btn-letter-spacing);

// 			height: min-content;
// 			min-width: max-content;

// 			display: inline-flex;
// 			gap: var(--space-2);
// 			justify-content: center;
// 			align-items: center;

// 			border-style: solid;
// 			border-width: var(--btn-border-width);
// 			border-radius: var(--btn-radius-base);

// 			transition: var(--btn-transition);

// 			--btn-padding: var(--btn-padding-y-base);
// 			--btn-padding-x: var(--btn-padding-x-base);
// 			padding: var(--btn-padding) var(--btn-padding-x);

// 			--btn-hover-color: var(--btn-primary-bg-hover);
// 			--btn-active-border: var(--color-bearmetal-100);

// 			&.full {
// 				width: 100%;
// 				margin-top: var(--space-2);
// 			}

// 			&.icon {
// 				width: min-content;
// 				padding: var(--btn-padding);
// 			}
// 			&.xs {
// 				font-size: var(--btn-font-size-xs);
// 				border-radius: var(--btn-radius-xs);
// 				--btn-padding: var(--btn-padding-y-xs);
// 				--btn-padding-x: var(--btn-padding-x-xs);
// 			}
// 			&.sm {
// 				font-size: var(--btn-font-size-sm);
// 				border-radius: var(--btn-radius-sm);
// 				--btn-padding: var(--btn-padding-y-sm);
// 				--btn-padding-x: var(--btn-padding-x-sm);
// 			}
// 			&.lg {
// 				font-size: var(--btn-font-size-lg);
// 				border-radius: var(--btn-radius-lg);
// 				--btn-padding: var(--btn-padding-y-lg);
// 				--btn-padding-x: var(--btn-padding-x-lg);
// 			}

// 			background-color: var(--btn-primary-bg);
// 			color: var(--btn-primary-color);
// 			border-color: var(--btn-primary-border);
// 			box-shadow: var(--btn-primary-shadow);

// 			&.ghost,
// 			&[type="reset"] {
// 				background-color: var(--btn-ghost-bg);
// 				--btn-hover-color: var(--btn-ghost-bg-hover);
// 				color: var(--btn-ghost-color);
// 				border-color: var(--btn-ghost-border);
// 				box-shadow: var(--btn-ghost-shadow);
// 			}
// 			&.secondary,
// 			&[type="button"] {
// 				background-color: var(--btn-secondary-bg);
// 				--btn-hover-color: var(--btn-secondary-bg-hover);
// 				color: var(--btn-secondary-color);
// 				border-color: var(--btn-secondary-border);
// 				box-shadow: var(--btn-secondary-shadow);
// 			}
// 			&.danger {
// 				background-color: var(--btn-danger-bg);
// 				--btn-hover-color: var(--btn-danger-bg-hover);
// 				color: var(--btn-danger-color);
// 				border-color: var(--btn-danger-border);
// 				box-shadow: var(--btn-danger-shadow);
// 			}
// 			&.warn {
// 				background-color: var(--btn-warning-bg);
// 				--btn-hover-color: var(--btn-warning-bg-hover);
// 				color: var(--btn-warning-color);
// 				border-color: var(--btn-warning-border);
// 				box-shadow: var(--btn-warning-shadow);
// 			}
// 			&.info {
// 				background-color: var(--btn-info-bg);
// 				--btn-hover-color: var(--btn-info-bg-hover);
// 				color: var(--btn-info-color);
// 				border-color: var(--btn-info-border);
// 				box-shadow: var(--btn-info-shadow);
// 			}
// 			&.success {
// 				background-color: var(--btn-success-bg);
// 				--btn-hover-color: var(--btn-success-bg-hover);
// 				color: var(--btn-success-color);
// 				border-color: var(--btn-success-border);
// 				box-shadow: var(--btn-success-shadow);
// 			}
// 			&.orange {
// 				background-color: var(--btn-orange-bg);
// 				--btn-hover-color: var(--btn-orange-bg-hover);
// 				color: var(--btn-orange-color);
// 				border-color: var(--btn-orange-border);
// 				box-shadow: var(--btn-orange-shadow);
// 			}

// 			&:active {
// 				border-color: var(--btn-active-border);
// 			}
// 			&:hover {
// 				background-color: var(--btn-hover-color);
// 			}
// 		}

// 		body.rave-mode *:not(:has(*)) {
// 			animation: spin 1s linear infinite;
// 		}

// 		.prose {
// 			max-width: var(--container-prose);
// 		}

// 		@property --gradient-angle {
// 			syntax: "<angle>";
// 			inherits: false;
// 			initial-value: 0deg;
// 		}
// 		@property --b-gradient-angle {
// 			syntax: "<angle>";
// 			inherits: false;
// 			initial-value: 180deg;
// 		}

// 		.gradient-border {
// 			border: 2px solid transparent;

// 			--b-gradient-angle: 315deg;
// 			--b-gradient: linear-gradient(
// 				in oklch var(--b-gradient-angle),
// 				oklch(from var(--b-gradient-from) l c h),
// 				oklch(from var(--b-gradient-to) l c h)
// 			);
// 			--bg: linear-gradient(var(--color-bg), var(--color-bg));
// 			background:
// 				var(--bg) padding-box,
// 				var(--b-gradient) border-box;

// 			&.border-ember {
// 				--b-gradient-from: var(--color-bearmetal-600);
// 				--b-gradient-to: var(--color-bearmetal-orange-400);
// 			}
// 			&.border-nightshade {
// 				--b-gradient-from: var(--color-bearmetal-600);
// 				--b-gradient-to: var(--color-bearmetal-danger-500);
// 			}
// 			&.border-abyss {
// 				--b-gradient-from: var(--color-bearmetal-success-500);
// 				--b-gradient-to: var(--color-bearmetal-info-500);
// 			}
// 			&.border-harvest {
// 				--b-gradient-from: var(--color-bearmetal-warning-300);
// 				--b-gradient-to: var(--color-bearmetal-orange-400);
// 			}
// 			&.border-witchwood {
// 				--b-gradient-from: var(--color-bearmetal-500);
// 				--b-gradient-to: var(--color-bearmetal-success-500);
// 			}
// 		}

// 		.gradient {
// 			--gradient-angle: 135deg;
// 			--gradient: linear-gradient(
// 				in oklch var(--gradient-angle),
// 				oklch(from var(--gradient-from) l c h),
// 				oklch(from var(--gradient-to) l c h)
// 			);

// 			--bg: var(--gradient);
// 			&:not(.gradient-border) {
// 				background: var(--bg);
// 			}

// 			&.ember {
// 				--gradient-from: var(--color-bearmetal-600);
// 				--gradient-to: var(--color-bearmetal-orange-400);
// 			}
// 			&.nightshade {
// 				--gradient-from: var(--color-bearmetal-600);
// 				--gradient-to: var(--color-bearmetal-danger-500);
// 			}
// 			&.abyss {
// 				--gradient-from: var(--color-bearmetal-success-500);
// 				--gradient-to: var(--color-bearmetal-info-500);
// 			}
// 			&.harvest {
// 				--gradient-from: var(--color-bearmetal-warning-300);
// 				--gradient-to: var(--color-bearmetal-orange-400);
// 			}
// 			&.witchwood {
// 				--gradient-from: var(--color-bearmetal-500);
// 				--gradient-to: var(--color-bearmetal-success-500);
// 			}
// 		}

// 		@keyframes rotate-gradient {
// 			from {
// 				--gradient-angle: 0deg;
// 				--b-gradient-angle: 360deg;
// 			}
// 			to {
// 				--gradient-angle: 360deg;
// 				--b-gradient-angle: 0deg;
// 			}
// 		}

// 		.gradient.animate,
// 		.gradient-border.animate {
// 			animation: rotate-gradient 30s linear infinite;
// 		}

// 		bm-grid.bg div {
// 			aspect-ratio: 1;
// 			animation:
// 				woob 600s linear infinite,
// 				woom 100s linear infinite alternate,
// 				woop 300s linear infinite;
// 			corner-shape: bevel;
// 			border-radius: 50%;
// 			mix-blend-mode: exclusion;
// 			background-color: darkmagenta;
// 		}

// 		@keyframes woom {
// 			0% {
// 				border-radius: 0;
// 				transform: scale(100%);
// 			}
// 			50% {
// 				border-radius: 50%;
// 				transform: scale(100%);
// 			}
// 			100% {
// 				border-radius: 50%;
// 				transform: scale(0);
// 			}
// 		}
// 		@keyframes woop {
// 			0% {
// 				corner-shape: scoop;
// 			}
// 			25% {
// 				corner-shape: bevel;
// 			}
// 			50% {
// 				corner-shape: notch;
// 			}
// 			75% {
// 				corner-shape: round;
// 			}
// 			100% {
// 				corner-shape: scoop;
// 			}
// 		}
// 		@keyframes woob {
// 			0% {
// 				background-color: darkmagenta;
// 			}
// 			10% {
// 				background-color: crimson;
// 			}
// 			30% {
// 				background-color: darkblue;
// 			}
// 			60% {
// 				background-color: darkorange;
// 			}
// 			90% {
// 				background-color: brown;
// 			}
// 			100% {
// 				background-color: darkmagenta;
// 			}
// 		}

// 		bm-grid.bg {
// 			z-index: -100;
// 			width: 100vw;
// 			scale: 200%;
// 			position: fixed;
// 			rotate: 30deg;
// 			filter: blur(5px);
// 			animation:
// 				gloop-spin 600s linear infinite,
// 				gloop-grow 400s linear infinite alternate,
// 				gloop-shift 500s linear infinite alternate;
// 		}

// 		@keyframes gloop-spin {
// 			from {
// 				rotate: 0deg;
// 			}
// 			to {
// 				rotate: 360deg;
// 			}
// 		}
// 		@keyframes gloop-grow {
// 			from {
// 				scale: 150%;
// 			}
// 			to {
// 				scale: 200%;
// 			}
// 		}
// 		@keyframes gloop-shift {
// 			from {
// 				translate: 0 0;
// 			}
// 			to {
// 				translate: 0 -50%;
// 			}
// 		}
// 	`,
// );

// if (typeof document !== "undefined") {
// 	document.head.insertAdjacentHTML(
// 		"beforeend",
// 		`<link rel="preconnect" href="https://fonts.googleapis.com">
// 		<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
// 		<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,200..800&family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Jost:ital,wght@0,100..900;1,100..900&family=Outfit:wght@100..900&family=Syne:wght@400..800&family=Urbanist:ital,wght@0,100..900;1,100..900&display=swap" rel="stylesheet">`,
// 	);
// }
