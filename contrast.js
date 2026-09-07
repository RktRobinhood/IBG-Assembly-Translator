export function srgbToLinear(channel) {
  const value = channel / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(red, green, blue) {
  return 0.2126 * srgbToLinear(red) + 0.7152 * srgbToLinear(green) + 0.0722 * srgbToLinear(blue);
}

export function chooseCaptionTheme(imageData) {
  if (!imageData?.data?.length) return 'dark';
  const values = [];
  for (let i = 0; i < imageData.data.length; i += 16) {
    if (imageData.data[i + 3] < 128) continue;
    values.push(relativeLuminance(imageData.data[i], imageData.data[i + 1], imageData.data[i + 2]));
  }
  if (!values.length) return 'dark';
  values.sort((a, b) => a - b);
  const median = values[Math.floor(values.length / 2)];
  const brightPixels = values.filter(value => value > 0.36).length / values.length;
  return median > 0.32 || brightPixels > 0.62 ? 'light' : 'dark';
}
