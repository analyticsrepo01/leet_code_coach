export function applyChromaKey(
  frame: ImageData,
  keyColor: string,
  tolerance: number,
  bgColor: string,
): ImageData {
  const l = frame.data.length / 4;
  const width = frame.width;

  // Dynamic background detection
  let targetR = 0,
    targetG = 255,
    targetB = 0; // Default pure green fallback

  let sumR = 0,
    sumG = 0,
    sumB = 0;
  let count = 0;

  const isGreenMode = keyColor === 'green' || keyColor === '#00b140';
  const isBlueMode = keyColor === 'blue' || keyColor === '#0047bb';

  // Sample 8x8 at top-left
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const i = y * width + x;
      const r = frame.data[i * 4 + 0];
      const g = frame.data[i * 4 + 1];
      const b = frame.data[i * 4 + 2];

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
  }

  // Sample 8x8 at top-right
  for (let y = 0; y < 8; y++) {
    for (let x = width - 8; x < width; x++) {
      const i = y * width + x;
      const r = frame.data[i * 4 + 0];
      const g = frame.data[i * 4 + 1];
      const b = frame.data[i * 4 + 2];

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
  }

  if (count > 0) {
    targetR = Math.round(sumR / count);
    targetG = Math.round(sumG / count);
    targetB = Math.round(sumB / count);
  } else {
    // Fallback to hardcoded specific colors if no pixels match
    if (isGreenMode) {
      targetR = 0;
      targetG = 177;
      targetB = 64;
    } else if (isBlueMode) {
      targetR = 0;
      targetG = 71;
      targetB = 187;
    }
  }

  for (let i = 0; i < l; i++) {
    const r = frame.data[i * 4 + 0];
    const g = frame.data[i * 4 + 1];
    const b = frame.data[i * 4 + 2];

    if (
      Math.abs(r - targetR) < tolerance &&
      Math.abs(g - targetG) < tolerance &&
      Math.abs(b - targetB) < tolerance
    ) {
      if (bgColor === 'white') {
        frame.data[i * 4 + 0] = 255;
        frame.data[i * 4 + 1] = 255;
        frame.data[i * 4 + 2] = 255;
      } else if (bgColor === 'transparent') {
        frame.data[i * 4 + 3] = 0;
      }
    }
  }
  return frame;
}
