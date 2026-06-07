import {
	bloody,
	blur,
	cyber,
	dcp1,
	doh,
	fender,
	graffiti,
	poison,
	slrel,
	stp,
	tmplr,
} from "./bearmetal.ts";

export * from "./bearmetal.ts";
export * from "./pride.ts";
export * from "./spooky.ts";

export const sets = {
	spooky: [bloody, poison],
	def: [cyber, fender, stp, slrel, blur, doh, graffiti, tmplr, dcp1],
};
