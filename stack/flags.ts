/** The optional pieces a scaffolded app can be built with. */
export interface flags {
	/** Host to serve the app under in development, or `false` for none. */
	devProxy: string | false;
	/** forces the inclusion of the miscellanea package */
	miscellanea: boolean;
	db: "postgres" | false;
	auth: boolean;
}
