// A brick pattern for stone walls, towers and keeps (the Citadel of Traitors). It is worked out
// in the shader from where each bit of surface is in the world, so it never stretches however
// long the wall is, and it follows the curve of a tower. `uStone` switches it on and off
// (value 1 = bricks), so one material can be a metal station wall in one script and stone in another.
export function brickify(mat, uStone = { value: 1 }) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uStone = uStone;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos;\nvarying vec3 vWN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvWN = normalize(mat3(modelMatrix) * normal);');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>
varying vec3 vWPos;
varying vec3 vWN;
uniform float uStone;
float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
      .replace('#include <color_fragment>', `#include <color_fragment>
if (uStone > 0.5) {
  float along = dot(vWPos.xz, vec2(-vWN.z, vWN.x));
  float row = floor(vWPos.y / 0.36);
  float col = along / 0.85 + mod(row, 2.0) * 0.5;
  vec2 cell = vec2(floor(col), row);
  vec2 f = vec2(fract(col), fract(vWPos.y / 0.36));
  float mortar = max(step(f.x, 0.05), step(f.y, 0.11));
  float shade = 0.74 + 0.46 * h21(cell);
  diffuseColor.rgb *= mix(shade, 0.42, mortar);
}`);
  };
  mat.customProgramCacheKey = () => 'brick-walls';
  return mat;
}

