import { Camera, Vec3 } from "./camera.js";
// @ts-ignore
import init, { run } from "./ray/ray_rs.js"; // This file will be here (relatively) once we build the wasm app
import { createRTIOWScene } from "./scene.js";
import { ray_shader_code } from "./wgsl.js";

window.onload = () => {
	if (!navigator.gpu) {
		// TODO: Display warning
		// (document.getElementById("webgpu-missing") as HTMLDivElement).style.display = "block";
		throw new Error("WebGPU is not supported on your browser. Consider enabling it or checking out http://webgpu.io for more information.");
	}
	wgpu();
	init().then(() => {
		// console.log("WASM Loaded");
		run("gpu-port-modified");
	});
};

class Buffer {
	array: Uint32Array | Float32Array;
	buffer: GPUBuffer;
	needsUpdate: boolean;

	constructor(array: Uint32Array | Float32Array, buffer: GPUBuffer) {
		this.array = array;
		this.buffer = buffer;
		this.needsUpdate = true;
	}
}

class Triangle {
	element: HTMLElement;
	context: GPUCanvasContext;
	device: GPUDevice;
	pipeline: GPURenderPipeline;
	vertexBuffer: GPUBuffer;
	vertices: Float32Array;

	mouseX: number;
	mouseY: number;

	frameCount: number;
	is_visible: boolean;

	constructor(
		element: HTMLElement,
		context: GPUCanvasContext,
		device: GPUDevice,
		pipeline: GPURenderPipeline,
		vertexBuffer: GPUBuffer,
		vertices: Float32Array
	) {
		this.element = element;
		this.context = context;
		this.device = device;
		this.pipeline = pipeline;
		this.vertexBuffer = vertexBuffer;
		this.vertices = vertices;

		this.mouseX = 0.0;
		this.mouseY = 0.0;

		this.frameCount = 0;
		this.is_visible = false;
	}
}

class Demo {
	element: HTMLElement;
	context: GPUCanvasContext;
	device: GPUDevice;
	pipeline: GPURenderPipeline;
	vertexBuffer: GPUBuffer;
	vertices: Float32Array;
	bindGroup: GPUBindGroup;
	uniformBuffers: Buffer[];
	storageBuffers: Buffer[];

	camera: Camera;

	mouseX: number;
	mouseY: number;

	frameCount: number;
	is_visible: boolean;

	constructor(
		element: HTMLElement,
		context: GPUCanvasContext,
		device: GPUDevice,
		pipeline: GPURenderPipeline,
		vertexBuffer: GPUBuffer,
		vertices: Float32Array,
		bindGroup: GPUBindGroup,
		uniformBuffers: Buffer[],
		storageBuffers: Buffer[],
		camera: Camera
	) {
		this.element = element;
		this.context = context;
		this.device = device;
		this.pipeline = pipeline;
		this.vertexBuffer = vertexBuffer;
		this.vertices = vertices;
		this.bindGroup = bindGroup;
		this.uniformBuffers = uniformBuffers;
		this.storageBuffers = storageBuffers;

		this.mouseX = 0.0;
		this.mouseY = 0.0;

		this.camera = camera;

		this.frameCount = 0;
		this.is_visible = false;
	}
}

let triangle: Triangle | null = null;
let ray: Demo | null = null;

let lastTimestamp = 0;

const triangle_canvas_name = "triangle";
const gpu_port_canvas_name = "gpu-port";

// ------------------- Only Render Elements that are in the viewport -------------------

function isElementInViewport(el: HTMLElement): boolean {
	const rect = el.getBoundingClientRect();
	// console.log(rect);
	// console.log([rect.top, rect.bottom, window.innerHeight]);
	// console.log([window.innerHeight, document.documentElement.clientHeight, window.innerHeight || document.documentElement.clientHeight]);
	// Return true if any of the element is visible
	return (
		(rect.top >= 0 || rect.bottom >= 0) &&
		(rect.left >= 0 || rect.right >= 0) &&
		(rect.top <= window.innerHeight || rect.bottom <= window.innerHeight) &&
		(rect.right <= window.innerWidth || rect.left <= window.innerWidth)
	);
}

function visibilityHandler(_e: Event) {
	// We want to keep track if the canvas is visible in the viewport so we don't waste compute
	if (triangle !== null && isElementInViewport(triangle.element)) {
		triangle.is_visible = true;
	} else if (triangle !== null) {
		triangle.is_visible = false;
	}
	if (ray !== null && isElementInViewport(ray.element)) {
		ray.is_visible = true;
	} else if (ray !== null) {
		ray.is_visible = false;
	}
}

addEventListener("DOMContentLoaded", visibilityHandler);
addEventListener("load", visibilityHandler);
addEventListener("scroll", visibilityHandler);
addEventListener("resize", visibilityHandler);

// -------------------------------------- WebGPU --------------------------------------

async function wgpu() {
	const adapter = await navigator.gpu.requestAdapter();
	if (!adapter) {
		throw new Error("No appropriate GPUAdapter found.");
	}
	const device = await adapter.requestDevice();

	initTriangle(triangle_canvas_name, device);
	initRay(gpu_port_canvas_name, device);

	render(0.0);
}

function initTriangle(canvas_id: string, device: GPUDevice) {
	const canvas_element = document.getElementById(canvas_id)!;
	let canvas = canvas_element as HTMLCanvasElement;
	canvas.width = canvas.clientWidth * window.devicePixelRatio;
	canvas.height = canvas.clientHeight * window.devicePixelRatio;

	const context = canvas.getContext("webgpu");
	if (context === null) {
		throw new Error("Failed to get webgpu context");
	}
	const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
	context.configure({
		device: device,
		format: canvasFormat,
	});

	const canvasAspectRatio = canvas.width / canvas.height;

	const triangle_size = 0.5; // Units of height of canvas
	const x_pos = triangle_size / canvasAspectRatio;

	/* prettier-ignore */
	const vertices = new Float32Array([
	//      X         Y
		   0.0,  triangle_size,
		 x_pos, -triangle_size,
		-x_pos, -triangle_size,
	]);
	const vertexBuffer = device.createBuffer({
		label: "Triangle Vertices",
		size: vertices.byteLength,
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
	});
	device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/ 0, vertices);

	const vertexBufferLayout = {
		arrayStride: 8,
		attributes: [
			{
				format: "float32x2",
				offset: 0,
				shaderLocation: 0, // Position, see vertex shader
			},
		],
	} as GPUVertexBufferLayout;

	// Create the shader that will render the cells.
	const shaderModule = device.createShaderModule({
		label: "Triangle Shader",
		code: `
          @vertex
          fn vertexMain(@location(0) position: vec2f)
            -> @builtin(position) vec4f {
            return vec4f(position, 0, 1);
          }

          @fragment
          fn fragmentMain() -> @location(0) vec4f {
            return vec4f(1, 0, 0, 1);
          }
        `,
	});

	// Create a pipeline that renders the cell.
	const pipeline = device.createRenderPipeline({
		label: "Triangle Pipeline",
		layout: "auto",
		vertex: {
			module: shaderModule,
			entryPoint: "vertexMain",
			buffers: [vertexBufferLayout],
		},
		fragment: {
			module: shaderModule,
			entryPoint: "fragmentMain",
			targets: [
				{
					format: canvasFormat,
				},
			],
		},
	});

	triangle = new Triangle(canvas_element, context, device, pipeline, vertexBuffer, vertices);

	canvas.addEventListener("mousemove", (e) => {
		if (triangle === null) {
			return;
		}
		let rect = canvas.getBoundingClientRect(); // abs. size of element

		triangle.mouseX = (e.clientX - rect.left) / rect.width; // scale mouse coordinates after they have
		triangle.mouseY = (e.clientY - rect.top) / rect.height; // been adjusted to be relative to element
	});

	// TODO: Test listener for touch events
	canvas.addEventListener("touchmove", (e) => {
		if (triangle === null) {
			return;
		}
		if (e.touches[0] === undefined) {
			return;
		}
		let rect = canvas.getBoundingClientRect(); // abs. size of element

		triangle.mouseX = (e.touches[0].clientX - rect.left) / rect.width; // scale mouse coordinates after they have
		triangle.mouseY = (e.touches[0].clientY - rect.top) / rect.height; // been adjusted to be relative to element
	});
}

function initRay(canvas_id: string, device: GPUDevice) {
	const canvas_element = document.getElementById(canvas_id)!;
	let canvas = canvas_element as HTMLCanvasElement;
	canvas.width = canvas.clientWidth * window.devicePixelRatio;
	canvas.height = canvas.clientHeight * window.devicePixelRatio;

	const context = canvas.getContext("webgpu");
	if (context === null) {
		throw new Error("Failed to get webgpu context");
	}
	const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
	context.configure({
		device: device,
		format: canvasFormat,
	});

	/* prettier-ignore */
	const vertices = new Float32Array([
	//     X,    Y,
		-1.0, -1.0, // Bottom left
		-1.0, 10.0, // Top left
		10.0, -1.0, // Bottom right
	]);
	const vertexBuffer = device.createBuffer({
		label: "Triangle Vertices",
		size: vertices.byteLength,
		usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
	});
	device.queue.writeBuffer(vertexBuffer, /*bufferOffset=*/ 0, vertices);

	const vertexBufferLayout = {
		arrayStride: 8,
		attributes: [
			{
				format: "float32x2",
				offset: 0,
				shaderLocation: 0, // Position, see vertex shader
			},
		],
	} as GPUVertexBufferLayout;

	// Create the shader that will render the cells.
	const shaderModule = device.createShaderModule({
		label: "Ray Shader",
		code: ray_shader_code,
	});

	const pipelineLayout = device.createPipelineLayout({
		label: "Pipeline Layout",
		bindGroupLayouts: [
			device.createBindGroupLayout({
				label: "Bind Group Layout",
				entries: [
					{
						binding: 0,
						visibility: GPUShaderStage.FRAGMENT,
						buffer: {
							type: "uniform",
						},
					},
					{
						binding: 1,
						visibility: GPUShaderStage.FRAGMENT,
						buffer: {
							type: "uniform",
						},
					},
					{
						binding: 2,
						visibility: GPUShaderStage.FRAGMENT,
						buffer: {
							type: "read-only-storage",
						},
					},
				],
			}),
		],
	});

	// Create a pipeline that renders the cell.
	const pipeline = device.createRenderPipeline({
		label: "Ray Pipeline",
		layout: pipelineLayout,
		vertex: {
			module: shaderModule,
			entryPoint: "vs_main",
			buffers: [vertexBufferLayout],
		},
		fragment: {
			module: shaderModule,
			entryPoint: "fs_main",
			targets: [
				{
					format: canvasFormat,
				},
			],
		},
	});

	const uniformArray = new Uint32Array([0, canvas.width, canvas.height]);
	const uniformBuffer = device.createBuffer({
		label: "Uniforms",
		size: uniformArray.byteLength,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});

	// const camera = new Camera(new Vec3(13, 2, 3), new Vec3(0, 0, 0), new Vec3(0, 1, 0));
	/* prettier-ignore */
	const camera = new Camera(
		new Vec3(13, 2, 3), 
		new Vec3(0, 0, 0), 
		new Vec3(0, 1, 0)
	);
	camera.updateArray();

	const cameraBuffer = device.createBuffer({
		label: "Camera Buffer",
		size: camera.array.byteLength,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});

	const uniformBuffers = [new Buffer(uniformArray, uniformBuffer), new Buffer(camera.array, cameraBuffer)];

	const sceneArray = createRTIOWScene();
	const sceneBuffer = device.createBuffer({
		label: "Scene Buffer",
		size: sceneArray.byteLength,
		usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
	});

	const bindGroup = device.createBindGroup({
		label: "Ray Bind group",
		layout: pipeline.getBindGroupLayout(0),
		entries: [
			{
				binding: 0,
				resource: { buffer: uniformBuffer },
			},
			{
				binding: 1,
				resource: { buffer: cameraBuffer },
			},
			{
				binding: 2,
				resource: { buffer: sceneBuffer },
			},
		],
	});

	const storageArrays = [new Buffer(sceneArray, sceneBuffer)];

	ray = new Demo(canvas_element, context, device, pipeline, vertexBuffer, vertices, bindGroup, uniformBuffers, storageArrays, camera);

	canvas.addEventListener("mousemove", (e) => {
		if (ray === null) {
			return;
		}
		let rect = canvas.getBoundingClientRect(); // abs. size of element

		ray.mouseX = (e.clientX - rect.left) / rect.width; // scale mouse coordinates after they have
		ray.mouseY = (e.clientY - rect.top) / rect.height; // been adjusted to be relative to element
	});
}

function render(timestamp: number) {
	const frameTime_ms = timestamp - lastTimestamp;

	// Triangle
	if (triangle !== null && triangle.is_visible) {
		renderTriangle(triangle);
	}
	// Limit
	if (frameTime_ms > 100 && ray !== null && ray.is_visible) {
		ray.camera.orbit(-0.01, 0.0);
		renderRay(ray);
		lastTimestamp = timestamp;
	}

	requestAnimationFrame(render);
}

function renderTriangle(triangle: Triangle) {
	const encoder = triangle.device.createCommandEncoder();

	const pass = encoder.beginRenderPass({
		colorAttachments: [
			{
				view: triangle.context.getCurrentTexture().createView(),
				loadOp: "clear",
				clearValue: { r: 0.0, g: triangle.mouseX, b: triangle.mouseY, a: 1.0 },
				storeOp: "store",
			} as GPURenderPassColorAttachment,
		],
	});

	// Draw the square.
	pass.setPipeline(triangle.pipeline);
	pass.setVertexBuffer(0, triangle.vertexBuffer);
	pass.draw(triangle.vertices.length / 2);

	pass.end();
	// Finish the command buffer and immediately submit it.
	triangle.device.queue.submit([encoder.finish()]);
}

function renderRay(ray: Demo) {
	ray.frameCount += 1;
	const encoder = ray.device.createCommandEncoder();

	const pass = encoder.beginRenderPass({
		colorAttachments: [
			{
				view: ray.context.getCurrentTexture().createView(),
				loadOp: "clear",
				clearValue: { r: 0.0, g: ray.mouseX, b: ray.mouseY, a: 1.0 },
				storeOp: "store",
			} as GPURenderPassColorAttachment,
		],
	});

	// Draw the square.
	pass.setPipeline(ray.pipeline);
	pass.setVertexBuffer(0, ray.vertexBuffer);

	if (ray.uniformBuffers !== null && ray.uniformBuffers[0] !== undefined) {
		ray.uniformBuffers[0].array[0] = ray.frameCount;
	}

	ray.uniformBuffers?.forEach((x) => {
		ray.device.queue.writeBuffer(x.buffer, 0, x.array.buffer);
	});

	ray.storageBuffers?.forEach((x) => {
		if (x.needsUpdate) {
			ray.device.queue.writeBuffer(x.buffer, 0, x.array.buffer);
		}
	});

	if (ray.bindGroup !== null) {
		pass.setBindGroup(0, ray.bindGroup);
	}

	pass.draw(ray.vertices.length / 2);

	pass.end();
	// Finish the command buffer and immediately submit it.
	ray.device.queue.submit([encoder.finish()]);
}
