import e from "express";

// 1x1 gray pixel PNG (base64)
export const GRAY_PIXEL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mM0NTX9DwADRgHBbU8fhQAAAABJRU5ErkJggg==";

export const IMAGE_GENERATION_PLACEHOLDER = "![Generated Image](/files/assets/generated_image_placeholder.png)";
export const IMAGE_BASE64_TPL = (format: string, b64data: string) => `data:image/${format};base64,${b64data}`;
export const IMAGE_URL_BASE64_TPL = (format: string, b64data: string) =>
  `![Generated Image](${IMAGE_BASE64_TPL(format, b64data)})`;
