window.onload = () => {
	top_down();
};

class Center {
	x: number;
	y: number;
	constructor(width: number, height: number) {
		this.x = width / 2.0;
		this.y = height / 2.0;
	}
}

function top_down() {
	let canvas = document.getElementById("top") as HTMLCanvasElement;
	if (!canvas.getContext) {
		console.log("canvas not found");
		return;
	}
	const pixelRatio = window.devicePixelRatio;

	const width = canvas.clientWidth * pixelRatio;
	// const height = canvas.clientHeight * pixelRatio;
	const height = width;

	canvas.width = width;
	canvas.height = height;
	let ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

	let c = new Center(width, height);

	const sail_angle_slider = document.getElementById("slider-sail") as HTMLInputElement;
	const sail_angle = Number(sail_angle_slider.value) / 1000;

	const boat_angle_slider = document.getElementById("slider-boat") as HTMLInputElement;
	const boat_angle = Number(boat_angle_slider.value) / 1000;

	ctx.translate(width / 2, height / 2);
	ctx.rotate(boat_angle);
	ctx.translate(-width / 2, -height / 2);

	ctx.fillStyle = "black";
	ctx.beginPath();
	ctx.arc(width * 0.25, width * 0.46, width * 0.438, -0.964, 0.091, false); // Starboard bow
	ctx.lineTo(width * 0.65, height * 0.9); // Starboard stern
	ctx.lineTo(width * 0.35, height * 0.9); // Stern
	ctx.lineTo(width * 0.313, height * 0.5); // Port stern
	ctx.arc(width * 0.75, width * 0.46, width * 0.438, Math.PI - 0.091, Math.PI + 0.964, false); // Port bow
	ctx.fill();

	draw_sail(ctx, sail_angle, c, height * 0.3);
}

function draw_sail(ctx: CanvasRenderingContext2D, angle: number, c: Center, sail_length: number) {
	// Mast
	ctx.fillStyle = "white";
	ctx.beginPath();
	ctx.arc(c.x, c.y, 4, 0, 2 * Math.PI, false);
	ctx.fill();

	// Boom
	ctx.strokeStyle = "white";
	ctx.lineWidth = 5.0;
	ctx.beginPath();
	ctx.moveTo(c.x, c.y);
	ctx.lineTo(c.x + sail_length * Math.sin(angle), c.y + sail_length * Math.cos(angle));
	ctx.stroke();
}

function moved_sliders() {
	top_down();
}
