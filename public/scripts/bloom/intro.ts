import init, { greet } from "./intro/intro.js";

window.onload = () => {
	let url = import.meta.url.replace(/\/public/g, "/blog/public");
	console.log("URL: " + url);
	// init().then(() => console.log("WASM Loaded"));
	init().then(() => greet());
};
