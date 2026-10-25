// Copies the Phosphor regular and fill sheets out of webbies, so the package can build each
// site's sprite from them (see buildSprite in icons.ts).
for (const weight of ["regular", "fill"]) {
	const source = new URL(`../../webbies/icons/phosphor/${weight}.svg`, import.meta.url);
	const target = new URL(`../assets/phosphor/${weight}.svg`, import.meta.url);
	await Deno.mkdir(new URL(".", target), { recursive: true });
	await Deno.copyFile(source, target);
	console.log(`Copied phosphor/${weight}.svg`);
}
