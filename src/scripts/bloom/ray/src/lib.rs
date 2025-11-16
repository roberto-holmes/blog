mod algebra;
mod bvh;
mod camera;
mod helpers;
mod material;
mod primitives;
mod select;

use core::f32;
use std::iter;

use algebra::Vec3;
use bvh::{create_bvh, AABB, BVH};
use camera::{Camera, CameraUniforms};
use helpers::get_random;
use material::Material;
use primitives::{Quad, Scene, Sphere, Triangle};
use select::{add_selection, clear_all_selections, get_selected_object, remove_selection};

use bytemuck::Zeroable;
use wgpu::Limits;
use winit::{
    dpi::PhysicalPosition,
    event::*,
    event_loop::EventLoop,
    keyboard::{KeyCode, PhysicalKey},
    window::Window,
};

#[cfg(not(target_arch = "wasm32"))]
use rand::rngs::ThreadRng;

#[cfg(target_arch = "wasm32")]
use web_sys::js_sys::Date;

#[cfg(target_arch = "wasm32")]
use wasm_bindgen::prelude::*;

// #[cfg(target_arch = "wasm32")]
// #[link(wasm_import_module = "./ray.js")]
// extern "C" {
//     fn update_fps(new_fps: f32);
// }

const FOCAL_DISTANCE: f32 = 4.5;
const VFOV_DEG: f32 = 40.;
const DOF_SCALE: f32 = 0.05;

#[cfg(target_arch = "wasm32")]
const FPS_HISTORY_LENGTH: usize = 60;
pub const MAX_MATERIAL_COUNT: usize = 10;
pub const MAX_SPHERE_COUNT: usize = 100;
pub const MAX_QUAD_COUNT: usize = 100;
pub const MAX_TRIANGLE_COUNT: usize = 100;
pub const MAX_OBJECT_COUNT: usize = MAX_SPHERE_COUNT + MAX_QUAD_COUNT + MAX_TRIANGLE_COUNT;
pub const MAX_PASSES: u32 = 100; // Number of frames before we accept the result
pub const MAX_FPS: u32 = 10; // Number of frames before we accept the result

// We need this for Rust to store our data correctly for the shaders
#[repr(C)]
// This is so we can store this in a buffer
#[derive(Debug, Copy, Clone, bytemuck::Pod, bytemuck::Zeroable)]
struct Uniforms {
    camera: CameraUniforms,
    frame_num: u32,
    width: u32,
    height: u32,
    _padding: u32,
}

impl Uniforms {
    fn new() -> Self {
        Self {
            camera: CameraUniforms::zeroed(),
            frame_num: 0,
            width: 0,
            height: 0,
            _padding: 0,
        }
    }
    fn tick(&mut self) {
        self.frame_num += 1;
    }
    fn update(&mut self, width: u32, height: u32) {
        self.width = width;
        self.height = height;
    }
    fn reset_samples(&mut self) {
        self.frame_num = 0;
    }
}

struct State<'a> {
    limits: Limits,
    surface: wgpu::Surface<'a>,
    device: wgpu::Device,
    queue: wgpu::Queue,
    config: wgpu::SurfaceConfiguration,
    size: winit::dpi::PhysicalSize<u32>,

    render_pipeline: wgpu::RenderPipeline,

    uniforms: Uniforms,
    uniforms_buffer: wgpu::Buffer,
    display_bind_groups: [wgpu::BindGroup; 2],

    scene: Scene,
    material_buffer: wgpu::Buffer,
    sphere_buffer: wgpu::Buffer,
    quad_buffer: wgpu::Buffer,
    triangle_buffer: wgpu::Buffer,

    bvh: [AABB; 2 * MAX_OBJECT_COUNT - 1],
    bvh_buffer: wgpu::Buffer,

    // The window must be declared after the surface so
    // it gets dropped after it as the surface contains
    // unsafe references to the window's resources.
    window: &'a Window,
    camera: Camera,
    mouse_position: PhysicalPosition<f64>,
    mouse_pressed_position: [PhysicalPosition<f64>; 3],
    mouse_button_pressed: [bool; 3],
    ctrl_pressed: bool,

    #[cfg(target_arch = "wasm32")]
    last_frame_time: Date,
    #[cfg(target_arch = "wasm32")]
    frame_rate_history: [f32; FPS_HISTORY_LENGTH],
    #[cfg(target_arch = "wasm32")]
    frame_rate_pos: usize,

    #[cfg(target_arch = "wasm32")]
    rng: u32, // Dummy variable to allow the same function signature to be used for wasm random calls
    #[cfg(not(target_arch = "wasm32"))]
    rng: ThreadRng,
}

impl<'a> State<'a> {
    async fn new(window: &'a Window, limits: Limits) -> State<'a> {
        let size = window.inner_size();

        // The instance is a handle to our GPU
        // BackendBit::PRIMARY => Vulkan + Metal + DX12 + Browser WebGPU
        let instance = wgpu::Instance::new(wgpu::InstanceDescriptor {
            #[cfg(not(target_arch = "wasm32"))]
            backends: wgpu::Backends::PRIMARY,
            #[cfg(target_arch = "wasm32")]
            backends: wgpu::Backends::BROWSER_WEBGPU,
            ..Default::default()
        });

        let surface = instance.create_surface(window).unwrap();

        let adapter = instance
            .request_adapter(&wgpu::RequestAdapterOptions {
                power_preference: wgpu::PowerPreference::default(),
                compatible_surface: Some(&surface),
                force_fallback_adapter: false,
            })
            .await
            .unwrap();

        let (device, queue) = adapter
            .request_device(
                &wgpu::DeviceDescriptor {
                    label: None,
                    required_features: wgpu::Features::empty(),
                    required_limits: limits.clone(),
                    memory_hints: Default::default(),
                },
                // Some(&std::path::Path::new("trace")), // Trace path
                None,
            )
            .await
            .unwrap();

        let surface_caps = surface.get_capabilities(&adapter);
        // Shader code in this tutorial assumes an Srgb surface texture. Using a different
        // one will result all the colors comming out darker. If you want to support non
        // Srgb surfaces, you'll need to account for that when drawing to the frame.
        let surface_format = surface_caps
            .formats
            .iter()
            .copied()
            .find(|f| f.is_srgb())
            .unwrap_or(surface_caps.formats[0]);
        let config = wgpu::SurfaceConfiguration {
            usage: wgpu::TextureUsages::RENDER_ATTACHMENT,
            format: surface_format,
            width: size.width,
            height: size.height,
            present_mode: surface_caps.present_modes[0],
            alpha_mode: surface_caps.alpha_modes[0],
            desired_maximum_frame_latency: 2,
            view_formats: vec![],
        };

        let camera = Camera::look_at(
            Vec3::new(3., 2., 3.),
            Vec3::new(0., 1., 0.),
            Vec3::new(0., 1., 0.),
            FOCAL_DISTANCE,
            VFOV_DEG,
            DOF_SCALE,
        );

        let uniforms = Uniforms::new();
        let uniforms_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Uniforms"),
            size: std::mem::size_of::<Uniforms>() as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let material_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Materials"),
            size: (std::mem::size_of::<Material>() * MAX_MATERIAL_COUNT) as u64,
            usage: wgpu::BufferUsages::UNIFORM | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let mut scene = Scene::new();
        scene.add_material(Material::new_basic(Vec3::new(0.5, 0.5, 0.5), 0.));
        scene.add_sphere(Sphere::new(Vec3::new(0., -1000., -1.), 1000., 1));
        // for a in -11..11 {
        //     for b in -11..11 {
        //         scene.add_sphere(Sphere::new(
        //             Vec3::new(
        //                 (a as f64 + 0.9 * get_random(&mut self.rng)) as f32,
        //                 0.2,
        //                 (b as f64 + 0.9 * get_random(&mut self.rng)) as f32,
        //             ),
        //             0.2,
        //             Material::new(
        //                 Vec3::new(get_random(&mut self.rng) as f32, get_random(&mut self.rng) as f32, get_random(&mut self.rng) as f32).normalized(),
        //                 get_random(&mut self.rng) as f32,
        //                 get_random(&mut self.rng) as f32,
        //                 1. / 1.5,
        //                 get_random(&mut self.rng) as f32,
        //                 get_random(&mut self.rng) as f32,
        //                 Vec3::new(get_random(&mut self.rng) as f32, get_random(&mut self.rng) as f32, get_random(&mut self.rng) as f32),
        //             ),
        //         )));
        //     }
        // }
        scene.add_sphere(Sphere::new(Vec3::new(2., 1., -2.), 1.0, 0));
        let mut current_material_index =
            scene.add_material(Material::new_clear(Vec3::new(1., 1., 1.)));
        scene.add_sphere(Sphere::new(
            Vec3::new(-2., 1., 0.),
            1.0,
            current_material_index,
        ));
        current_material_index = scene.add_material(Material::new(
            Vec3::new(0.9, 0.0, 0.3),
            0.,
            1.,
            0.67,
            1.,
            0.1,
            Vec3::new(0.9, 0.0, 0.3),
        ));
        scene.add_sphere(Sphere::new(
            Vec3::new(0., 3., 0.),
            0.5,
            current_material_index,
        ));
        current_material_index = scene.add_material(Material::new(
            Vec3::new(1.0, 1.0, 1.0),
            0.,
            1.,
            0.67,
            1.,
            1.,
            Vec3::new(1.0, 1.0, 1.0),
        ));
        scene.add_sphere(Sphere::new(
            Vec3::new(0., 3., -1.5),
            0.5,
            current_material_index,
        ));
        current_material_index =
            scene.add_material(Material::new_emissive(Vec3::new(1.0, 0.8, 0.7), 1.0));
        scene.add_quad(Quad::new(
            Vec3::new(-3.0, 4.0, -3.0),
            Vec3::new(6.0, 0.0, 0.0),
            Vec3::new(0., 0.0, 6.0),
            current_material_index,
        ));
        scene.add_quad(Quad::default());
        scene.add_triangle(Triangle::default());
        let sphere_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Spheres"),
            size: (std::mem::size_of::<Sphere>() * MAX_SPHERE_COUNT) as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let quad_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Quads"),
            size: (std::mem::size_of::<Quad>() * MAX_QUAD_COUNT) as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });
        let triangle_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("Triangles"),
            size: (std::mem::size_of::<Triangle>() * MAX_TRIANGLE_COUNT) as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let bvh_buffer = device.create_buffer(&wgpu::BufferDescriptor {
            label: Some("BVH"),
            size: std::mem::size_of::<BVH>() as u64,
            usage: wgpu::BufferUsages::STORAGE | wgpu::BufferUsages::COPY_DST,
            mapped_at_creation: false,
        });

        let radiance_samples = helpers::create_sample_textures(&device, 1280, 720);

        let bind_group_layout = device.create_bind_group_layout(&wgpu::BindGroupLayoutDescriptor {
            entries: &[
                wgpu::BindGroupLayoutEntry {
                    binding: 0,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Texture {
                        sample_type: wgpu::TextureSampleType::Float { filterable: false },
                        view_dimension: wgpu::TextureViewDimension::D2,
                        multisampled: false,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 1,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::StorageTexture {
                        access: wgpu::StorageTextureAccess::WriteOnly,
                        format: wgpu::TextureFormat::Rgba32Float,
                        view_dimension: wgpu::TextureViewDimension::D2,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 2,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 3,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Uniform,
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 4,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 5,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 6,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
                wgpu::BindGroupLayoutEntry {
                    binding: 7,
                    visibility: wgpu::ShaderStages::FRAGMENT,
                    ty: wgpu::BindingType::Buffer {
                        ty: wgpu::BufferBindingType::Storage { read_only: true },
                        has_dynamic_offset: false,
                        min_binding_size: None,
                    },
                    count: None,
                },
            ],
            label: Some("bind_group_layout"),
        });

        let display_bind_groups = helpers::create_display_bind_groups(
            &device,
            &bind_group_layout,
            &radiance_samples,
            &uniforms_buffer,
            &material_buffer,
            &bvh_buffer,
            &sphere_buffer,
            &quad_buffer,
            &triangle_buffer,
        );

        let shader = device.create_shader_module(wgpu::ShaderModuleDescriptor {
            label: Some("Shader"),
            source: wgpu::ShaderSource::Wgsl(
                format!(
                    "{}{}",
                    include_str!("vertex.wgsl"),
                    include_str!("fragment.wgsl")
                )
                .into(),
            ),
        });

        let render_pipeline_layout =
            device.create_pipeline_layout(&wgpu::PipelineLayoutDescriptor {
                label: Some("Render Pipeline Layout"),
                bind_group_layouts: &[&bind_group_layout],
                push_constant_ranges: &[],
            });

        let render_pipeline = device.create_render_pipeline(&wgpu::RenderPipelineDescriptor {
            label: Some("Render Pipeline"),
            layout: Some(&render_pipeline_layout),
            vertex: wgpu::VertexState {
                module: &shader,
                entry_point: Some("vs_main"),
                buffers: &[],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            },
            fragment: Some(wgpu::FragmentState {
                module: &shader,
                entry_point: Some("fs_main"),
                targets: &[Some(wgpu::ColorTargetState {
                    format: config.format,
                    blend: Some(wgpu::BlendState::REPLACE),
                    write_mask: wgpu::ColorWrites::ALL,
                })],
                compilation_options: wgpu::PipelineCompilationOptions::default(),
            }),
            primitive: wgpu::PrimitiveState {
                topology: wgpu::PrimitiveTopology::TriangleList,
                strip_index_format: None,
                front_face: wgpu::FrontFace::Ccw,
                cull_mode: Some(wgpu::Face::Back),
                polygon_mode: wgpu::PolygonMode::Fill, // Setting this to anything other than Fill requires Features::NON_FILL_POLYGON_MODE
                unclipped_depth: false,                // Requires Features::DEPTH_CLIP_CONTROL
                conservative: false, // Requires Features::CONSERVATIVE_RASTERIZATION
            },
            depth_stencil: None,
            multisample: wgpu::MultisampleState {
                count: 1,
                mask: !0,
                alpha_to_coverage_enabled: false,
            },
            multiview: None,
            cache: None,
        });

        let bvh = create_bvh(&mut scene);

        // log::warn!("{:#?}", bvh);

        Self {
            limits,

            surface,
            device,
            queue,
            config,
            size,
            render_pipeline,

            uniforms,
            display_bind_groups,
            uniforms_buffer,

            scene,
            material_buffer,
            sphere_buffer,
            quad_buffer,
            triangle_buffer,

            bvh,
            bvh_buffer,

            window,
            camera,
            mouse_position: PhysicalPosition { x: 0., y: 0. },
            mouse_pressed_position: [PhysicalPosition { x: 0., y: 0. }; 3],
            mouse_button_pressed: [false; 3],
            ctrl_pressed: false,

            #[cfg(target_arch = "wasm32")]
            last_frame_time: Date::new_0(),
            #[cfg(target_arch = "wasm32")]
            frame_rate_history: [60.; FPS_HISTORY_LENGTH],
            #[cfg(target_arch = "wasm32")]
            frame_rate_pos: 0,

            #[cfg(target_arch = "wasm32")]
            rng: 0,
            #[cfg(not(target_arch = "wasm32"))]
            rng: rand::thread_rng(),
        }
    }

    fn rebuild_scene(&mut self) {
        self.bvh = create_bvh(&mut self.scene);
    }

    fn window(&self) -> &Window {
        &self.window
    }

    pub fn resize(&mut self, new_size: winit::dpi::PhysicalSize<u32>) {
        if new_size.width > 0 && new_size.height > 0 {
            self.size = new_size;
            self.config.width = new_size.width;
            self.config.height = new_size.height;
            self.surface.configure(&self.device, &self.config);
            self.uniforms.update(new_size.width, new_size.height);
            self.uniforms.reset_samples();
        }
    }

    fn input(&mut self, event: &WindowEvent) -> bool {
        match event {
            WindowEvent::CursorMoved { position, .. } => {
                self.mouse_position = *position;
                true
            }
            WindowEvent::KeyboardInput {
                event:
                    KeyEvent {
                        state,
                        physical_key,
                        ..
                    },
                ..
            } => match (physical_key, state) {
                (PhysicalKey::Code(KeyCode::KeyA), ElementState::Pressed) => {
                    for _ in 0..10 {
                        self.scene.add_sphere(Sphere::new(
                            Vec3::new(
                                (10. * get_random(&mut self.rng) - 5.0) as f32,
                                (5. * get_random(&mut self.rng)) as f32,
                                (10. * get_random(&mut self.rng) - 5.0) as f32,
                            ),
                            0.2,
                            self.scene.get_random_material(&mut self.rng),
                        ));
                    }
                    self.rebuild_scene();
                    self.uniforms.reset_samples();
                    true
                }
                // (PhysicalKey::Code(KeyCode::KeyR), ElementState::Pressed) => {
                //     self.scene.pop();
                //     self.rebuild_scene();
                //     self.uniforms.reset_samples();
                //     true
                // }
                (PhysicalKey::Code(KeyCode::ControlLeft), _) => {
                    self.ctrl_pressed = *state == ElementState::Pressed;
                    true
                }
                _ => false,
            },
            _ => false,
        }
    }

    fn mouse_input(&mut self, event: &DeviceEvent) {
        match event {
            DeviceEvent::MouseWheel { delta } => {
                let delta = match delta {
                    MouseScrollDelta::PixelDelta(delta) => 0.001 * delta.y as f32,
                    MouseScrollDelta::LineDelta(_, y) => y * 0.1,
                };
                self.camera.zoom(delta);
                self.uniforms.reset_samples();
            }
            DeviceEvent::Button { button, state } => {
                // 0 - Left
                // 1 - Right
                // 2 - Middle
                if *button <= 3 {
                    self.mouse_button_pressed[*button as usize] = *state == ElementState::Pressed;

                    if *state == ElementState::Pressed {
                        self.mouse_pressed_position[*button as usize] = self.mouse_position;
                    } else {
                        let last_pos = &self.mouse_pressed_position[*button as usize];
                        let pos = &self.mouse_position;
                        // Allow for the mouse to move a little bit between being pressed and released
                        if (pos.x - last_pos.x).abs() < 5. && (pos.y - last_pos.y).abs() < 5. {
                            // Check if there are any object we can select
                            // TODO: Select other primitives
                            let (hit_object, dist_to_object) = get_selected_object(
                                &self.mouse_position,
                                &self.uniforms,
                                self.scene.get_sphere_arr(),
                            );

                            if hit_object == usize::MAX {
                                clear_all_selections(self.scene.get_sphere_arr_mut());
                                if *button == 0 {
                                    self.camera.uniforms.dof_scale = 0.;
                                }
                            } else {
                                match *button {
                                    0 => {
                                        if self.ctrl_pressed {
                                            add_selection(
                                                hit_object,
                                                self.scene.get_sphere_arr_mut(),
                                            );
                                        } else {
                                            self.camera.uniforms.focal_distance = dist_to_object;
                                            self.camera.uniforms.dof_scale = DOF_SCALE;
                                        }
                                    }
                                    1 => {
                                        if self.ctrl_pressed {
                                            remove_selection(
                                                hit_object,
                                                self.scene.get_sphere_arr_mut(),
                                            );
                                        }
                                    }
                                    _ => {
                                        if self.ctrl_pressed {
                                            clear_all_selections(self.scene.get_sphere_arr_mut());
                                        }
                                    }
                                }
                            }
                            self.uniforms.reset_samples();
                        }
                    }
                }
            }
            DeviceEvent::MouseMotion { delta: (dx, dy) } => {
                let dx = *dx as f32 * -0.01;
                let dy = *dy as f32 * 0.01;
                if self.mouse_button_pressed[0] {
                    self.camera.orbit(dx, dy);
                    self.uniforms.reset_samples();
                } else if self.mouse_button_pressed[1] {
                    self.camera.pan(dx, dy);
                    self.uniforms.reset_samples();
                } else if self.mouse_button_pressed[2] {
                    self.camera.zoom(-dy);
                    self.uniforms.reset_samples();
                }
            }
            _ => (),
        }
    }

    fn update(&mut self) {}

    fn render(&mut self) -> Result<(), wgpu::SurfaceError> {
        if self.uniforms.frame_num > MAX_PASSES {
            return Ok(());
        }
        #[cfg(target_arch = "wasm32")]
        {
            // Calculate FPS
            let current_date = Date::new_0();
            let elapsed = current_date.get_milliseconds() - self.last_frame_time.get_milliseconds();

            // Limit fps so that low performance systems don't tank when rendering the page
            if elapsed < 1000 / MAX_FPS {
                return Ok(());
            }

            self.last_frame_time = current_date;
            self.frame_rate_pos += 1;
            self.frame_rate_pos %= self.frame_rate_history.len();
        }

        // Update Uniforms
        self.uniforms.camera = *self.camera.uniforms();
        self.uniforms.tick();
        self.queue.write_buffer(
            &self.uniforms_buffer,
            0,
            bytemuck::cast_slice(&[self.uniforms]),
        );

        // Update scene
        self.queue.write_buffer(
            &self.material_buffer,
            0,
            bytemuck::cast_slice(self.scene.get_material_arr()),
        );
        self.queue.write_buffer(
            &self.sphere_buffer,
            0,
            bytemuck::cast_slice(self.scene.get_sphere_arr()),
        );
        self.queue.write_buffer(
            &self.quad_buffer,
            0,
            bytemuck::cast_slice(self.scene.get_quad_arr()),
        );
        self.queue.write_buffer(
            &self.triangle_buffer,
            0,
            bytemuck::cast_slice(self.scene.get_triangle_arr()),
        );

        self.queue
            .write_buffer(&self.bvh_buffer, 0, bytemuck::cast_slice(&self.bvh));

        // Prepare pipeline
        let output = self.surface.get_current_texture()?;
        let view = output
            .texture
            .create_view(&wgpu::TextureViewDescriptor::default());

        let mut encoder = self
            .device
            .create_command_encoder(&wgpu::CommandEncoderDescriptor {
                label: Some("Render Encoder"),
            });

        {
            let mut render_pass = encoder.begin_render_pass(&wgpu::RenderPassDescriptor {
                label: Some("Render Pass"),
                color_attachments: &[Some(wgpu::RenderPassColorAttachment {
                    view: &view,
                    resolve_target: None,
                    ops: wgpu::Operations {
                        load: wgpu::LoadOp::Clear(wgpu::Color {
                            r: 0.,
                            g: 0.,
                            b: 0.,
                            a: 1.0,
                        }),
                        store: wgpu::StoreOp::Store,
                    },
                })],
                depth_stencil_attachment: None,
                occlusion_query_set: None,
                timestamp_writes: None,
            });

            // Swap the textures around for storing the previous frame
            render_pass.set_bind_group(
                0,
                &self.display_bind_groups[(self.uniforms.frame_num % 2) as usize],
                &[],
            );
            render_pass.set_pipeline(&self.render_pipeline);

            // Provide vertices to cover the screen
            render_pass.draw(0..6, 0..1);
        }

        self.queue.submit(iter::once(encoder.finish()));
        output.present();

        Ok(())
    }
}

#[cfg_attr(target_arch = "wasm32", wasm_bindgen)]
pub async fn run(canvas_id: &str) {
    cfg_if::cfg_if! {
        if #[cfg(target_arch = "wasm32")] {
            std::panic::set_hook(Box::new(console_error_panic_hook::hook));
            console_log::init_with_level(log::Level::Debug).expect("Couldn't initialize logger");
            // console_log::init_with_level(log::Level::Warn).expect("Couldn't initialize logger");
        } else {
            env_logger::init();
        }
    }

    let event_loop = EventLoop::new().unwrap();
    // let mut window_builder = WindowBuilder::new();
    let mut window_attributes = Window::default_attributes();

    // WebGL doesn't support all of wgpu's features, so if
    // we're building for that (or other old APIs) we'll have to disable some.
    let limits = wgpu::Limits::default();

    #[cfg(target_arch = "wasm32")]
    {
        use winit::platform::web::WindowAttributesExtWebSys;
        let document = web_sys::window().unwrap().document().unwrap();
        let canvas = document.get_element_by_id(canvas_id).unwrap();
        let canvas: web_sys::HtmlCanvasElement = canvas
            .dyn_into::<web_sys::HtmlCanvasElement>()
            .map_err(|_| ())
            .unwrap();

        window_attributes = window_attributes.with_canvas(Some(canvas));
        window_attributes = window_attributes.with_active(false); // Don't jump directly to the canvas
    }

    let window = event_loop.create_window(window_attributes).unwrap();

    // State::new uses async code, so we're going to wait for it to finish
    let mut state = State::new(&window, limits).await;
    let mut surface_configured = false;

    // TODO: replace run with run_app
    event_loop
        .run(move |event, control_flow| {
            match event {
                Event::WindowEvent {
                    ref event,
                    window_id,
                } if window_id == state.window().id() => {
                    if !state.input(event) {
                        match event {
                            WindowEvent::CloseRequested
                            | WindowEvent::KeyboardInput {
                                event:
                                    KeyEvent {
                                        state: ElementState::Pressed,
                                        physical_key: PhysicalKey::Code(KeyCode::Escape),
                                        ..
                                    },
                                ..
                            } => control_flow.exit(),
                            WindowEvent::Resized(mut physical_size) => {
                                // Check if we are trying to make a window larger than the current Limits allows
                                if physical_size.width > state.limits.max_texture_dimension_2d {
                                    log::warn!("Trying to resize window width to be larger than the maximum texture size");
                                    physical_size.width = state.limits.max_texture_dimension_2d;
                                }
                                if physical_size.height > state.limits.max_texture_dimension_2d {
                                    log::warn!("Trying to resize window height to be larger than the maximum texture size");
                                    physical_size.height = state.limits.max_texture_dimension_2d;
                                }
                                surface_configured = true;
                                state.resize(physical_size);
                            }
                            WindowEvent::RedrawRequested => {
                                // This tells winit that we want another frame after this one
                                state.window().request_redraw();

                                if !surface_configured {
                                    return;
                                }

                                state.update();
                                match state.render() {
                                    Ok(_) => {}
                                    // Reconfigure the surface if it's lost or outdated
                                    Err(
                                        wgpu::SurfaceError::Lost | wgpu::SurfaceError::Outdated,
                                    ) => state.resize(state.size),
                                    // The system is out of memory, we should probably quit
                                    Err(wgpu::SurfaceError::OutOfMemory) => {
                                        log::error!("OutOfMemory");
                                        control_flow.exit();
                                    }

                                    // This happens when the a frame takes too long to present
                                    Err(wgpu::SurfaceError::Timeout) => {
                                        log::warn!("Surface timeout")
                                    }
                                }
                            }
                            _ => {}
                        }
                    }
                }
                Event::DeviceEvent { event, .. } => {state.mouse_input(&event)}
                _ => {}
            }
        })
        .unwrap();
}
