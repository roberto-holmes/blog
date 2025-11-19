export class Vec3 {
	x: number;
	y: number;
	z: number;
	constructor(x: number, y: number, z: number) {
		this.x = x;
		this.y = y;
		this.z = z;
	}
	multiply(rhs: number): Vec3 {
		return new Vec3(this.x * rhs, this.y * rhs, this.z * rhs);
	}
	divide(rhs: number): Vec3 {
		return new Vec3(this.x / rhs, this.y / rhs, this.z / rhs);
	}
	subtract(rhs: Vec3): Vec3 {
		return new Vec3(this.x - rhs.x, this.y - rhs.y, this.z - rhs.z);
	}
	dot(rhs: Vec3): number {
		return this.x * rhs.x + this.y * rhs.y + this.z * rhs.z;
	}
	cross(rhs: Vec3): Vec3 {
		/* prettier-ignore */
		return new Vec3(
			this.y * rhs.z - this.z * rhs.y,
			this.z * rhs.x - this.x * rhs.z,
			this.x * rhs.y - this.y * rhs.x,
		);
	}
	lengthSquared(): number {
		return this.dot(this);
	}
	length(): number {
		return Math.sqrt(this.lengthSquared());
	}
	normalized(): Vec3 {
		return this.divide(this.length());
	}
}

export class Camera {
	_center: Vec3;
	_up: Vec3;
	_distance: number;
	_azimuth: number;
	_altitude: number;

	array: Float32Array;

	// Look at
	constructor(source: Vec3, dest: Vec3, up: Vec3) {
		const sourceToDest = source.subtract(dest);
		const negW = sourceToDest.normalized();

		this._center = dest;
		this._up = up;
		this._distance = Math.max(sourceToDest.length(), 0.01);

		this._azimuth = Math.atan2(negW.x, negW.z);
		this._altitude = Math.asin(negW.y);

		this.array = new Float32Array(16);
	}

	orbit(du: number, _dv: number) {
		// const MAX_ALT = Math.PI / 2 - 1e-6;
		// this._altitude = Math.clam
		this._azimuth += du;
		this._azimuth %= 2 * Math.PI;
		this.updateArray();
	}

	updateArray() {
		const y = Math.sin(this._altitude);
		const xz_scale = Math.cos(this._altitude);
		const x = Math.sin(this._azimuth);
		const z = Math.cos(this._azimuth);

		const w = new Vec3(-x * xz_scale, -y, -z * xz_scale);
		const origin = this._center.subtract(w.multiply(this._distance));
		const u = w.cross(this._up).normalized();
		const v = u.cross(w);

		// Origin
		this.array[0] = origin.x;
		this.array[1] = origin.y;
		this.array[2] = origin.z;
		this.array[3] = 0.0; // Padding
		this.array[4] = u.x;
		this.array[5] = u.y;
		this.array[6] = u.z;
		this.array[7] = 0.0; // Padding
		this.array[8] = v.x;
		this.array[9] = v.y;
		this.array[10] = v.z;
		this.array[11] = 0.0; // Padding
		this.array[12] = w.x;
		this.array[13] = w.y;
		this.array[14] = w.z;
		this.array[15] = 0.0; // Padding
	}
}
