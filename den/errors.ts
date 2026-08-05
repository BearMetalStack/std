/**
 * @module
 * Every failure den can produce, so a caller can tell "you never told me the
 * app name" apart from "that path tried to escape".
 */

/** Base class for every error den throws. */
export class DenError extends Error {
	override name = "DenError";
}

/** The application name could not be determined. */
export class DenConfigError extends DenError {
	override name = "DenConfigError";
}

/** A path segment tried to leave its directory, or was otherwise unusable. */
export class DenPathError extends DenError {
	override name = "DenPathError";
}

/** The environment didn't say where the user's home directory is. */
export class DenEnvError extends DenError {
	override name = "DenEnvError";
}

/** A destructive operation was aimed at a directory another app has claimed. */
export class DenOwnershipError extends DenError {
	override name = "DenOwnershipError";
}
