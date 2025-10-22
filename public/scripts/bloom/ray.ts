import init, {run} from "./ray/ray_rs.js";

window.onload = () => {
	let url = import.meta.url.replace(/\/public/g, "/blog/public");
	console.log("URL: " + url);
	// init().then(() => console.log("WASM Loaded"));
	init().then(() => {
		run("gpu-port");
		// run("gpu-port-modified");
	});
};
