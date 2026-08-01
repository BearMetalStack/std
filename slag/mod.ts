export class Slag {
	static injectGlobalMicrodom() {
		globalThis.document = new SlagDocument();
		globalThis.window = new SlagWindow();
	}
}
