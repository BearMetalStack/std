/**
 * An angular damped spring for follow-through: `θ'' = −kθ − cθ' + gain·F`,
 * where `F` is the sideways force on whatever the part hangs from (see
 * `Motion.force`). Moving right swings the part back to the left, like a sheet
 * held back by the air, and it settles once the motion stops. Angles follow
 * SVG `rotate()`: positive is clockwise.
 */
export class AngularSpring {
	/** Current angle, in degrees. */
	angle = 0;
	velocity = 0;

	constructor(
		public stiffness = 120,
		public damping = 10,
		public gain = 1,
		/** Hard limit on the angle, in degrees, so a violent jolt can't flip the part. */
		public limit = 35,
	) {}

	/** Advances the spring by `dt` seconds under a driving force. */
	step(dt: number, force: number): number {
		dt = Math.min(dt, 1 / 20);
		const substeps = Math.max(1, Math.ceil(dt / (1 / 240)));
		const h = dt / substeps;
		for (let i = 0; i < substeps; i++) {
			const accel = -this.stiffness * this.angle - this.damping * this.velocity +
				this.gain * force;
			this.velocity += accel * h;
			this.angle += this.velocity * h;
		}
		if (Math.abs(this.angle) > this.limit) {
			this.angle = Math.sign(this.angle) * this.limit;
			this.velocity = 0;
		}
		return this.angle;
	}
}
