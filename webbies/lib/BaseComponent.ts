export class BaseComponent extends HTMLElement {
	// -------------------------------------------------------------------------
	// Shadow root (optional - call useShadow() in subclass constructor)
	// -------------------------------------------------------------------------

	protected useShadow(mode: ShadowRootMode = "open"): ShadowRoot {
		return this.shadowRoot ?? this.attachShadow({ mode });
	}

	protected get root(): ShadowRoot | this {
		return this.shadowRoot ?? this;
	}

	// -------------------------------------------------------------------------
	// Styles
	// -------------------------------------------------------------------------

	private _lightStyle: HTMLStyleElement | null = null;
	private _shadowStyle: HTMLStyleElement | null = null;

	/** Inject a <style> into the light DOM (the element itself). */
	protected setStyle(css: string): void {
		if (!this._lightStyle) {
			this._lightStyle = document.createElement("style");
		}
		this._lightStyle.textContent = css;
	}

	/** Inject a <style> into the shadow root. No-op if no shadow root exists. */
	protected setShadowStyle(css: string): void {
		if (!this.shadowRoot) {
			console.warn(
				`${this.tagName}: setShadowStyle called but no shadow root exists. Call useShadow() first.`,
			);
			return;
		}
		if (!this._shadowStyle) {
			this._shadowStyle = document.createElement("style");
		}
		this._shadowStyle.textContent = css;
	}
	protected adoptStyleSheet(css: CSSStyleSheet) {
		if (!this.shadowRoot) {
			console.warn(
				`${this.tagName}: setShadowStyle called but no shadow root exists. Call useShadow() first.`,
			);
			return;
		}
		this.shadowRoot.adoptedStyleSheets = [
			...this.shadowRoot.adoptedStyleSheets,
			css,
		];
	}

	// -------------------------------------------------------------------------
	// Template
	// -------------------------------------------------------------------------

	private _template: HTMLTemplateElement | null = null;
	private _rendered = false;

	/** Set the HTML template. If already connected, triggers first render. */
	protected setTemplate(html: string): void {
		this._template = document.createElement("template");
		this._template.innerHTML = html;
		this._tryRender();
	}

	// -------------------------------------------------------------------------
	// Pre-connection append queue
	// -------------------------------------------------------------------------

	private _appendQueue: Node[] = [];

	/** Append a child node, queuing it if the element is not yet connected. */
	protected queueAppend(child: Node): void {
		if (this.isConnected) {
			this.appendChild(child);
		} else {
			this._appendQueue.push(child);
		}
	}

	private _drainAppendQueue(): void {
		let child: Node | undefined;
		while ((child = this._appendQueue.shift())) {
			this.appendChild(child);
		}
	}

	// -------------------------------------------------------------------------
	// Connection callbacks
	// -------------------------------------------------------------------------

	private _connectCallbacks: (() => void)[] = [];
	private _disconnectCallbacks: (() => void)[] = [];

	/** Register a callback to fire when the element is connected to the DOM. */
	protected onConnected(callback: () => void): void {
		this._connectCallbacks.push(callback);
	}

	/** Register a callback to fire when the element is disconnected from the DOM. */
	protected onDisconnected(callback: () => void): void {
		this._disconnectCallbacks.push(callback);
	}

	// -------------------------------------------------------------------------
	// Lifecycle
	// -------------------------------------------------------------------------

	connectedCallback(): void {
		this._drainAppendQueue();
		this._tryRender();
		for (const cb of this._connectCallbacks) cb();
	}

	disconnectedCallback(): void {
		for (const cb of this._disconnectCallbacks) cb();
	}

	// -------------------------------------------------------------------------
	// Render - no-op after first successful render
	// -------------------------------------------------------------------------

	private _tryRender(): void {
		if (this._rendered || !this.isConnected) return;
		this._rendered = true;

		const root = this.root;

		if (this._lightStyle && !this._lightStyle.isConnected) {
			this.prepend(this._lightStyle);
		}

		if (this._shadowStyle && !this._shadowStyle.isConnected) {
			root.prepend(this._shadowStyle);
		}

		if (this._template) {
			root.appendChild(this._template.content.cloneNode(true));
		}

		this.afterRender();
	}

	/** Override in subclasses to run logic after the first render. */
	protected afterRender(): void {}
}
