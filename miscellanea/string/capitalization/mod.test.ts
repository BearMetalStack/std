import { assert } from "@std/assert";
import {
	normalize,
	toCamelCase,
	toCapitalized,
	toKebabCase,
	toPascalCase,
	toScreamCase,
	toSnakeCase,
	toTitleCase,
} from "./mod.ts";

const input = [
	"noFever",
	"MoreCowBell",
	"I_GOTTA_HAVE_IT",
	"The Only Cure",
	"i_ran_out_of_cow_bell",
	"and-now-christopher-walken-is-coming-for-my-kidneys",
];
Deno.test("normalize", () => {
	const expected = [
		"no fever",
		"more cow bell",
		"i gotta have it",
		"the only cure",
		"i ran out of cow bell",
		"and now christopher walken is coming for my kidneys",
	];
	for (let i = 0; i < input.length; i++) {
		assert(normalize(input[i]) === expected[i]);
	}
});

Deno.test("toCamelCase", () => {
	const expected = [
		"noFever",
		"moreCowBell",
		"iGottaHaveIt",
		"theOnlyCure",
		"iRanOutOfCowBell",
		"andNowChristopherWalkenIsComingForMyKidneys",
	];
	for (let i = 0; i < input.length; i++) {
		assert(toCamelCase(input[i]) === expected[i]);
	}
});

Deno.test("toCapitalized", () => {
	const expected = [
		"No fever",
		"More cow bell",
		"I gotta have it",
		"The only cure",
		"I ran out of cow bell",
		"And now christopher walken is coming for my kidneys",
	];
	for (let i = 0; i < input.length; i++) {
		assert(toCapitalized(input[i]) === expected[i]);
	}
});

Deno.test("toKebabCase", () => {
	const expected = [
		"no-fever",
		"more-cow-bell",
		"i-gotta-have-it",
		"the-only-cure",
		"i-ran-out-of-cow-bell",
		"and-now-christopher-walken-is-coming-for-my-kidneys",
	];
	for (let i = 0; i < input.length; i++) {
		assert(toKebabCase(input[i]) === expected[i]);
	}
});

Deno.test("toPascalCase", () => {
	const expected = [
		"NoFever",
		"MoreCowBell",
		"IGottaHaveIt",
		"TheOnlyCure",
		"IRanOutOfCowBell",
		"AndNowChristopherWalkenIsComingForMyKidneys",
	];
	for (let i = 0; i < input.length; i++) {
		assert(toPascalCase(input[i]) === expected[i]);
	}
});

Deno.test("toScreamCase", () => {
	const expected = [
		"NO_FEVER",
		"MORE_COW_BELL",
		"I_GOTTA_HAVE_IT",
		"THE_ONLY_CURE",
		"I_RAN_OUT_OF_COW_BELL",
		"AND_NOW_CHRISTOPHER_WALKEN_IS_COMING_FOR_MY_KIDNEYS",
	];
	for (let i = 0; i < input.length; i++) {
		assert(toScreamCase(input[i]) === expected[i]);
	}
});

Deno.test("toSnakeCase", () => {
	const expected = [
		"no_fever",
		"more_cow_bell",
		"i_gotta_have_it",
		"the_only_cure",
		"i_ran_out_of_cow_bell",
		"and_now_christopher_walken_is_coming_for_my_kidneys",
	];
	for (let i = 0; i < input.length; i++) {
		assert(toSnakeCase(input[i]) === expected[i]);
	}
});

Deno.test("toTitleCase", () => {
	const expected = [
		"No Fever",
		"More Cow Bell",
		"I Gotta Have It",
		"The Only Cure",
		"I Ran Out Of Cow Bell",
		"And Now Christopher Walken Is Coming For My Kidneys",
	];
	for (let i = 0; i < input.length; i++) {
		assert(toTitleCase(input[i]) === expected[i]);
	}
});
