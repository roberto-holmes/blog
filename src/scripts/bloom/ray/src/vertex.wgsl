// ----------------------- Vertex shader ----------------------- 
// Cover the viewport with a quad

alias TriangleVertices = array<vec2f, 6>;
var<private> vertices: TriangleVertices = TriangleVertices(
    vec2f(-1.0,  1.0),
    vec2f(-1.0, -1.0),
    vec2f( 1.0,  1.0),
    vec2f( 1.0,  1.0),
    vec2f(-1.0, -1.0),
    vec2f( 1.0, -1.0),
);

@vertex
fn vs_main(
     @builtin(vertex_index) index: u32,
) -> @builtin(position) vec4f {

    return vec4f(vertices[index], 0.0, 1.0);
}