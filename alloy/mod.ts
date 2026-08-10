abstract class Codec {
	abstract encode(data: unknown): Uint8Array;
	abstract decode(data: Uint8Array): unknown;
}

class NumberCodec extends Codec {
	encode(data: number): Uint8Array {
		return new Uint8Array([data]);
	}

	decode(data: Uint8Array): number {
		return data[0];
	}
}

// class StringCodec extends Codec {
// 	encode(data: string): Uint8Array {
// 		return new TextEncoder().encode(data);
// 	}

// 	decode(data: Uint8Array): string {
// 		return new TextDecoder().decode(data);
// 	}
// }

// class ArrayCodec extends Codec {
// 	encode(data: unknown[]): Uint8Array {
// 		return new Uint8Array(data.flatMap((item) => selectCodec(item).encode(item)));
// 	}

// 	decode(data: Uint8Array): unknown[] {
// 	}
// }

/** temp */
export function selectCodec(data: unknown): Codec {
	switch (typeof data) {
		case "number":
			return new NumberCodec();
		default:
			throw new Error("Unsupported data type");
	}
}
