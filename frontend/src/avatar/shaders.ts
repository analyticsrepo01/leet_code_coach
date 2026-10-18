export const vertexShaderSource = `
attribute vec2 a_position;
attribute vec2 a_texCoord;
varying vec2 v_texCoord;
void main() {
   gl_Position = vec4(a_position, 0.0, 1.0);
   v_texCoord = a_texCoord;
}
`;

export const fragmentShaderSource = `
precision mediump float;
uniform sampler2D u_image;
uniform sampler2D u_mask;
uniform vec3 u_keyColor;
uniform float u_tolerance;
uniform float u_falloff;
uniform bool u_spillSuppression;
uniform vec2 u_texSize;
uniform bool u_enableChromaKey;
varying vec2 v_texCoord;

const vec3 kY = vec3(0.299, 0.587, 0.114);
const vec3 kCb = vec3(-0.1687, -0.3313, 0.5);
const vec3 kCr = vec3(0.5, -0.4187, -0.0813);

float getAlpha(vec4 color, vec2 keyCbCr, float tol, float fall) {
   float Cb = dot(color.rgb, kCb) + 0.5;
   float Cr = dot(color.rgb, kCr) + 0.5;
   float dist = distance(vec2(Cb, Cr), keyCbCr);
   return smoothstep(tol, tol + fall, dist);
}

void main() {
   vec4 color = texture2D(u_image, v_texCoord);
   
   if (!u_enableChromaKey) {
       gl_FragColor = color;
       return;
   }
   
   // Convert key color to YCbCr
   vec2 keyCbCr = vec2(
       dot(u_keyColor, kCb) + 0.5,
       dot(u_keyColor, kCr) + 0.5
   );
   
   float alpha = getAlpha(color, keyCbCr, u_tolerance, u_falloff);
   
   // Erosion (check 8 neighbors for 2-pixel erosion)
   vec2 texelSize = 1.0 / u_texSize;
   float a1 = getAlpha(texture2D(u_image, v_texCoord + vec2(texelSize.x, 0.0)), keyCbCr, u_tolerance, u_falloff);
   float a2 = getAlpha(texture2D(u_image, v_texCoord - vec2(texelSize.x, 0.0)), keyCbCr, u_tolerance, u_falloff);
   float a3 = getAlpha(texture2D(u_image, v_texCoord + vec2(0.0, texelSize.y)), keyCbCr, u_tolerance, u_falloff);
   float a4 = getAlpha(texture2D(u_image, v_texCoord - vec2(0.0, texelSize.y)), keyCbCr, u_tolerance, u_falloff);
   
   float a5 = getAlpha(texture2D(u_image, v_texCoord + vec2(texelSize.x * 2.0, 0.0)), keyCbCr, u_tolerance, u_falloff);
   float a6 = getAlpha(texture2D(u_image, v_texCoord - vec2(texelSize.x * 2.0, 0.0)), keyCbCr, u_tolerance, u_falloff);
   float a7 = getAlpha(texture2D(u_image, v_texCoord + vec2(0.0, texelSize.y * 2.0)), keyCbCr, u_tolerance, u_falloff);
   float a8 = getAlpha(texture2D(u_image, v_texCoord - vec2(0.0, texelSize.y * 2.0)), keyCbCr, u_tolerance, u_falloff);
   
   // Use min for erosion to remove background outline
   alpha = min(alpha, min(min(min(a1, a2), min(a3, a4)), min(min(a5, a6), min(a7, a8))));
   
   // Protect interior using mask
   float maskVal = texture2D(u_mask, v_texCoord).r;
   alpha = mix(alpha, 1.0, smoothstep(0.7, 0.9, maskVal));
   
   // Spill suppression
   float Cb = dot(color.rgb, kCb) + 0.5;
   float Cr = dot(color.rgb, kCr) + 0.5;
   float dist = distance(vec2(Cb, Cr), keyCbCr);
   
   if (u_spillSuppression && dist < u_tolerance + u_falloff * 2.0) {
       // Aggressive spill suppression: limit green/blue to average of others
       if (u_keyColor.g > u_keyColor.r && u_keyColor.g > u_keyColor.b) {
           color.g = min(color.g, (color.r + color.b) * 0.5);
       } else if (u_keyColor.b > u_keyColor.r && u_keyColor.b > u_keyColor.g) {
           color.b = min(color.b, (color.r + color.g) * 0.5);
       }
   }
   
   gl_FragColor = vec4(color.rgb, color.a * alpha);
}
`;
