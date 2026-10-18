export function initWebGL(
  canvas: HTMLCanvasElement,
  vertexShaderSource: string,
  fragmentShaderSource: string,
  logFn: (msg: string, data?: any, imp?: boolean) => void,
) {
  if (typeof canvas.getContext !== 'function') {
    logFn(
      'Canvas.getContext is not a function (likely test environment)',
      null,
      true,
    );
    return null;
  }

  const gl = canvas.getContext('webgl');
  if (!gl) {
    logFn(
      'WebGL not supported, falling back to 2D context implies CPU processing.',
      null,
      true,
    );
    return null;
  }

  // Create program
  const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
  const fragmentShader = createShader(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentShaderSource,
  );
  if (!vertexShader || !fragmentShader) return null;

  const program = gl.createProgram();
  if (!program) return null;
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('WebGL program link failed:', gl.getProgramInfoLog(program));
    return null;
  }

  // Create buffers
  const positionBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      -1.0, -1.0, 1.0, -1.0, -1.0, 1.0, -1.0, 1.0, 1.0, -1.0, 1.0, 1.0,
    ]),
    gl.STATIC_DRAW,
  );

  const texCoordBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([
      0.0, 1.0, 1.0, 1.0, 0.0, 0.0, 0.0, 0.0, 1.0, 1.0, 1.0, 0.0,
    ]),
    gl.STATIC_DRAW,
  );

  const glTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, glTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const maskTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, maskTexture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  return {gl, program, positionBuffer, texCoordBuffer, glTexture, maskTexture};
}

export function createShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error('Shader compile failed:', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function detectKeyColor(
  source: TexImageSource,
  width: number,
  height: number,
  isBlueMode: boolean,
  samplingCanvas: HTMLCanvasElement | null,
): {r: number; g: number; b: number} {
  if (!samplingCanvas) {
    samplingCanvas = document.createElement('canvas');
  }
  samplingCanvas.width = 16;
  samplingCanvas.height = 8;
  const sCtx = samplingCanvas.getContext('2d', {willReadFrequently: true});

  let targetR = 0,
    targetG = 255,
    targetB = 0; // Fallback

  if (sCtx) {
    sCtx.drawImage(source as any, 0, 0, 8, 8, 0, 0, 8, 8);
    sCtx.drawImage(source as any, width - 8, 0, 8, 8, 8, 0, 8, 8);

    const frameData = sCtx.getImageData(0, 0, 16, 8);
    let sumR = 0,
      sumG = 0,
      sumB = 0;
    let count = 0;

    for (let i = 0; i < 128; i++) {
      const r = frameData.data[i * 4 + 0];
      const g = frameData.data[i * 4 + 1];
      const b = frameData.data[i * 4 + 2];

      if (isBlueMode) {
        if (b > r && b > g) {
          sumR += r;
          sumG += g;
          sumB += b;
          count++;
        }
      } else {
        if (g > r && g > b) {
          sumR += r;
          sumG += g;
          sumB += b;
          count++;
        }
      }
    }

    if (count > 0) {
      targetR = Math.round(sumR / count);
      targetG = Math.round(sumG / count);
      targetB = Math.round(sumB / count);
    } else {
      if (isBlueMode) {
        targetR = 0;
        targetG = 71;
        targetB = 187;
      } else {
        targetR = 0;
        targetG = 177;
        targetB = 64;
      }
    }
  }
  return {r: targetR, g: targetG, b: targetB};
}

export function renderWebGLFrame(
  gl: WebGLRenderingContext,
  program: WebGLProgram,
  source: TexImageSource,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
  keyColor: {r: number; g: number; b: number},
  tolerance: number,
  isTransparent: boolean,
  enableChromaKey: boolean,
  positionBuffer: WebGLBuffer,
  texCoordBuffer: WebGLBuffer,
  glTexture: WebGLTexture,
  maskTexture: WebGLTexture,
  maskData: Uint8Array,
  maskWidth: number,
  maskHeight: number,
) {
  gl.viewport(0, 0, targetWidth, targetHeight);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.useProgram(program);

  const keyColorLoc = gl.getUniformLocation(program, 'u_keyColor');
  const toleranceLoc = gl.getUniformLocation(program, 'u_tolerance');
  const falloffLoc = gl.getUniformLocation(program, 'u_falloff');
  const spillLoc = gl.getUniformLocation(program, 'u_spillSuppression');
  const isTransparentLoc = gl.getUniformLocation(program, 'u_isTransparent');
  const texSizeLoc = gl.getUniformLocation(program, 'u_texSize');
  const enableChromaKeyLoc = gl.getUniformLocation(
    program,
    'u_enableChromaKey',
  );

  gl.uniform3f(
    keyColorLoc,
    keyColor.r / 255,
    keyColor.g / 255,
    keyColor.b / 255,
  );
  gl.uniform1f(toleranceLoc, tolerance / 255);
  gl.uniform1f(falloffLoc, 0.1);
  gl.uniform1i(spillLoc, 1);
  gl.uniform1i(isTransparentLoc, isTransparent ? 1 : 0);
  gl.uniform2f(texSizeLoc, width, height);
  gl.uniform1i(enableChromaKeyLoc, enableChromaKey ? 1 : 0);

  const positionLoc = gl.getAttribLocation(program, 'a_position');
  gl.enableVertexAttribArray(positionLoc);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

  const texCoordLoc = gl.getAttribLocation(program, 'a_texCoord');
  gl.enableVertexAttribArray(texCoordLoc);
  gl.bindBuffer(gl.ARRAY_BUFFER, texCoordBuffer);
  gl.vertexAttribPointer(texCoordLoc, 2, gl.FLOAT, false, 0, 0);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, glTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);

  const imageLoc = gl.getUniformLocation(program, 'u_image');
  gl.uniform1i(imageLoc, 0);

  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, maskTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.LUMINANCE,
    maskWidth,
    maskHeight,
    0,
    gl.LUMINANCE,
    gl.UNSIGNED_BYTE,
    maskData,
  );

  const maskLoc = gl.getUniformLocation(program, 'u_mask');
  gl.uniform1i(maskLoc, 1);

  gl.drawArrays(gl.TRIANGLES, 0, 6);
}
