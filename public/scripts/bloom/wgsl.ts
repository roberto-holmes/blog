export const ray_shader_code = /*wgsl*/ `
@vertex
fn vs_main(@location(0) position: vec2f) -> @builtin(position) vec4f {
	return vec4f(position, 0, 1);
}

// ----------------------- RNG Tools ----------------------- 
struct Rng {
  state: u32,
};
var<private> rng: Rng;

fn init_rng(pixel: vec2u, width: u32, frame_num: u32) {
	// Seed the PRNG using the scalar index of the pixel and the current frame count.
	let seed = (pixel.x + pixel.y * width) ^ jenkins_hash(frame_num);
	rng.state = jenkins_hash(seed);
}

// A slightly modified version of the "One-at-a-Time Hash" function by Bob Jenkins.
// See https://www.burtleburtle.net/bob/hash/doobs.html
fn jenkins_hash(i: u32) -> u32 {
	var x = i;
	x += x << 10u;
	x ^= x >> 6u;
	x += x << 3u;
	x ^= x >> 11u;
	x += x << 15u;
	return x;
}

// The 32-bit "xor" function from Marsaglia G., "Xorshift RNGs", Section 3.
fn xorshift32() -> u32 {
	var x = rng.state;
	x ^= x << 13;
	x ^= x >> 17;
	x ^= x << 5;
	rng.state = x;
	return x;
}

// Returns a random float in the range [0...1]. This sets the floating point exponent to zero and
// sets the most significant 23 bits of a random 32-bit unsigned integer as the mantissa. That
// generates a number in the range [1, 1.9999999], which is then mapped to [0, 0.9999999] by
// subtraction. See Ray Tracing Gems II, Section 14.3.4.
fn rand_f32() -> f32 {
	return bitcast<f32>(0x3f800000u | (xorshift32() >> 9u)) - 1.;
}

// ----------------------- Fragment shader ----------------------- 

struct CameraUniforms {
	origin: vec3f,
	u: vec3f,
	v: vec3f,
	w: vec3f,
}

struct Uniforms {
	frame_num: u32,
	width: u32,
	height: u32,
};

struct Sphere {
	center: vec3f,
	radius: f32,
	albedo: vec3f,
	material: f32, // 0 - Lambertian, 1 - Metallic, 2 - Dielectric
	refraction_index: f32,
}

@group(0) @binding(0) var<uniform> uniforms: Uniforms;
@group(0) @binding(1) var<uniform> camera: CameraUniforms;
@group(0) @binding(2) var<storage, read> scene: array<Sphere>;

struct Ray {
	origin: vec3f,
	direction: vec3f,
}

struct Intersection {
	normal: vec3f,
	t: f32,
	colour: vec3f,
	material: f32, // 0 - Lambertian, 1 - Metallic, 2 - Dielectric
	refraction_index: f32,
}

struct Scatter {
	attenuation: vec3f,
	ray: Ray,
}

const F32_MAX: f32 = 3.40282346638528859812e+38;
const EPSILON: f32 = 1e-2;

const FOCAL_DISTANCE: f32 = 2.;
const MAX_PATH_LENGTH: u32 = 8u;

fn sky_colour(ray: Ray) ->vec3f {
	// Get a value that goes from 1 to 0 as you go down
	let t = 0.5 * (normalize(ray.direction).y + 1.);
	// Make a vertical linear gradient from light blue to white
	return (1. - t) * vec3(1.) + t * vec3(0.3, 0.5, 1.);
	// or use a rough approximation of twilight (From light red to white)
	// return (1. - t) * vec3(1.) + t * vec3(1., 0.5, 0.3);
}

// Get the position of point on a ray at a given time
fn point_on_ray(ray: Ray, t: f32) -> vec3f{
	return ray.origin + t * ray.direction;
}

fn generate_random_unit_vector() -> vec3f{
	// return vec3f(0.); // For replacing the line below when wanting to see the cargo-wgsl output
	return normalize(vec3f(rand_f32()*2.-1., rand_f32()*2.-1., rand_f32()*2.-1.));
}

fn is_reflective_schlick(cosine: f32, refraction_index: f32) -> bool {
	var r0 = (1. - refraction_index) / (1. + refraction_index);
	r0 = r0*r0;
	return (r0 + (1.-r0)*pow((1. - cosine), 5.)) > rand_f32();
}

fn lambertian_scatter(input_ray: Ray, hit: Intersection) -> Scatter {
	let reflected = hit.normal + generate_random_unit_vector();
	// Bump the start of the reflected ray a little bit off the surface to
	// try to minimize self intersections due to floating point errors
	let output_ray = Ray(point_on_ray(input_ray, hit.t) + hit.normal * EPSILON, reflected);
	let attenuation = hit.colour;
	return Scatter(attenuation, output_ray);
}

fn metallic_scatter(input_ray: Ray, hit: Intersection) -> Scatter {
	let reflected = reflect(input_ray.direction, hit.normal);
	// Bump the start of the reflected ray a little bit off the surface to
	// try to minimize self intersections due to floating point errors
	let output_ray = Ray(point_on_ray(input_ray, hit.t) + hit.normal * EPSILON, reflected);
	let attenuation = hit.colour;
	return Scatter(attenuation, output_ray);
}

fn dielectric_scatter(input_ray: Ray, hit: Intersection) -> Scatter {
	// Figure out which side of the surface we are hitting
	let normal = select(hit.normal, -hit.normal, dot(input_ray.direction, hit.normal) > 0.);
	let refraction_index = select(hit.refraction_index, 1./hit.refraction_index, dot(input_ray.direction, hit.normal) > 0.);
	
	let input_direction = normalize(input_ray.direction);
	var output_ray_direction = refract(input_direction, normal, refraction_index);

	let cos_theta = min(dot(-input_direction, normal), 1.0);

	var output_ray = input_ray;
	// If angle is less than the critical angle, reflection occurs instead and the function returns vec3(0.)
	if (output_ray_direction.x == 0. && output_ray_direction.y == 0. && output_ray_direction.z == 0.) || is_reflective_schlick(cos_theta, hit.refraction_index) {
		output_ray_direction = reflect(input_direction, normal);
		output_ray = Ray(point_on_ray(input_ray, hit.t) + normal * EPSILON, output_ray_direction);
	} else {
		output_ray = Ray(point_on_ray(input_ray, hit.t), output_ray_direction);
	}

	let attenuation = hit.colour;
	return Scatter(attenuation, output_ray);
}

fn scatter(input_ray: Ray, hit: Intersection) -> Scatter {
	if hit.material == 0.0 {
		return lambertian_scatter(input_ray, hit);
	} else if hit.material == 1.0 {
		return metallic_scatter(input_ray, hit);
	} else {
		return dielectric_scatter(input_ray, hit);
	}
}

// Create an empty intersection
fn no_intersection() -> Intersection {
	return Intersection(vec3(0.), -1., vec3f(0.), 0, 0.);
}

// Calculate if an intersection has occured
fn is_intersection(hit: Intersection) -> bool {
	return hit.t > 0.;
}

fn intersect_sphere(ray: Ray, sphere: Sphere) -> Intersection {
	let v = ray.origin - sphere.center;
	let a = dot(ray.direction, ray.direction);
	let b = dot(v, ray.direction);
	// let c = dot(v, v) - .25;
	let c = dot(v, v) - sphere.radius * sphere.radius;

	// Find roots for the quadratic
	let d = b * b - a * c;

	// If no roots are found, the ray does not intersect with the sphere
	if d < 0. {
		return no_intersection();
	}

	// If there is a real solution, find the time at which it takes place
	let sqrt_d = sqrt(d);
	let recip_a = 1. / a;
	let mb = -b;
	let t1 = (mb - sqrt_d) * recip_a;
	let t2 = (mb + sqrt_d) * recip_a;
	let t = select(t2, t1, t1 > EPSILON);
	if t <= EPSILON {
		// Check if the solution is for time = 0
		return no_intersection();
	}

	let p = point_on_ray(ray, t);
	// let N = (p - sphere.center) / .5;
	let N = (p - sphere.center) / sphere.radius;
	// return Intersection(N, t, vec3(0.5, 0.2, 0.8), 0, 0.);
	// return Intersection(N, t, sphere.albedo, 0, 0.);
	return Intersection(N, t, sphere.albedo, sphere.material, sphere.refraction_index);
}

fn intersect_scene(ray: Ray) -> Intersection {
	var closest_hit = no_intersection();
	closest_hit.t = F32_MAX;
	for (var i = 0u; i < arrayLength(&scene); i += 1u) {
		// Ignore the rest of the buffer that has uninitialised spheres
		if(scene[i].radius > 0.) {
			// Loop through each object
			let hit = intersect_sphere(ray, scene[i]);
			if hit.t > 0. && hit.t < closest_hit.t {
				closest_hit = hit;
			}
		}
	}
	if closest_hit.t < F32_MAX {
		return closest_hit;
	}
	return no_intersection();
}


// @fragment
// fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4f {
// 	return vec4f(pos.x/f32(uniforms.width), pos.y/f32(uniforms.height), cos(f32(uniforms.frame_num)/60.0) *.5 +.5, 1);
// }


@fragment
fn fs_main(@builtin(position) pos: vec4f) -> @location(0) vec4<f32> {
	// Seed the Random Number Generator
	init_rng(vec2u(pos.xy), uniforms.width, uniforms.frame_num);

	let origin = camera.origin;
	let aspect_ratio = f32(uniforms.width) / f32(uniforms.height);

	// Normalize the viewport coordinates
	// let offset = vec2(rand_f32() - 0.5, rand_f32() - 0.5);
	let offset = vec2(0.0);
	var uv = (pos.xy + offset) / vec2f(f32(uniforms.width-1u), f32(uniforms.height-1u));

	// Map 'uv' from y-down (normalized) viewport coordinates to camera coordinates
	// (y-up, x-right, right hand, screen height is 2 units)
	uv = (2. * uv - vec2(1.)) * vec2(aspect_ratio,  -1.);

	// if uniforms.height == 494{
	// 	return vec4(0.0, 0.0, 1.0, 1.0);
	// }
	// return vec4(uv, 0.0, 1.0);

	// Compute the scene-space ray direction by rotating the camera-space vector into a new basis
	let camera_rotation = mat3x3(camera.u, camera.v, camera.w);
	let direction = camera_rotation * vec3(uv, FOCAL_DISTANCE);
	var ray = Ray(origin, direction);
	var throughput = vec3f(1.);
	var radiance_sample = vec3(0.);

	// Propagate the ray into the scene and get the final colours
	var path_length = 0u;
	while path_length < MAX_PATH_LENGTH {
		let hit = intersect_scene(ray);
		if !is_intersection(hit) {
			// If not intersection was found, return the colour of the sky and terminate the path
			radiance_sample += throughput * sky_colour(ray);
			break;
		}

		let scattered = scatter(ray, hit);
		throughput *= scattered.attenuation;
		ray = scattered.ray;
		path_length += 1u;
	}

	// Fetch the old sum of samples
	// var old_sum: vec3f;
	// if uniforms.frame_num > 1 {
	// 	old_sum = textureLoad(radiance_samples_old, vec2u(pos.xy), 0).xyz;
	// } else {
	// 	old_sum = vec3(0.);
	// }

	// Compute and store the new sum
	// let new_sum = radiance_sample + old_sum;
	// textureStore(radiance_samples_new, vec2u(pos.xy), vec4(new_sum, 0.));

	// Apply gamma correction to go from linear colour space to sRGB (gamma = 2.2)
	// let colour = new_sum / f32(uniforms.frame_num);
	// return vec4(pow(colour, vec3(1. / 2.2)), 1.);
	return vec4(pow(radiance_sample, vec3(1. / 2.2)), 1.);

	// if pos.x < 780{
	// 	return vec4f(1.0, 0.0, 0.0, 1.0);
	// } 
	// return vec4f(uv, 0.0, 1.0);
	// return vec4f(pos.x/f32(uniforms.width-1),0.0, 0.0, 1.0);
	// return vec4f(0.0, pos.y/f32(uniforms.height-1), 0.0, 1.0);
}
`;
