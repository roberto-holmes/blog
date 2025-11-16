import init, { run } from "./ray/ray_rs.js";

window.onload = () => {
	if (!navigator.gpu) {
		console.log("WebGPU is not supported on your browser. Please enable it or check http://webgpu.io");
		// Display warning and hide the FPS counter
		// (document.getElementById("webgpu-missing") as HTMLDivElement).style.display = "block";
		return;
	}
	// let url = import.meta.url.replace(/\/public/g, "/blog/public");
	// console.log("URL: " + url);
	// init().then(() => console.log("WASM Loaded"));
	init().then(() => {
		console.log("WASM Loaded");
		// run("gpu-port");
		run("gpu-port-modified");
	});
};
