export function getContentTypeByExtension(extension?: string) {
	switch (extension) {
		case "html":
		case "htm":
			return "text/html";
		case "css":
			return "text/css";
		case "js":
			return "text/javascript";
		case "json":
			return "application/json";
		case "png":
			return "image/png";
		case "jpg":
		case "jpeg":
			return "image/jpeg";
		case "gif":
			return "image/gif";
		case "svg":
			return "image/svg+xml";
		case "webp":
			return "image/webp";
		case "ico":
			return "image/x-icon";
		case "woff":
			return "font/woff";
		case "woff2":
			return "font/woff2";
		case "ttf":
			return "font/ttf";
		case "otf":
			return "font/otf";
		case "eot":
			return "application/vnd.ms-fontobject";
		case "txt":
		case "md":
			return "text/plain";
		default:
			return "application/octet-stream";
	}
}
