const SIZE = 512;
const ACCEPTED = ["image/webp", "image/jpeg"] as const;

function toBlob(canvas: HTMLCanvasElement, type: (typeof ACCEPTED)[number]): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob && blob.type === type ? blob : null), type, 0.85));
}

/**
 * Crops the picture to a centered square, shrinks it to 512 px and saves it again as WebP or JPEG.
 * Drawing it anew also drops what the camera wrote in the file, such as the location.
 */
export async function squarePhoto(file: File): Promise<File> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("canvas indisponível");
  }
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, SIZE, SIZE);
  bitmap.close();

  for (const type of ACCEPTED) {
    const blob = await toBlob(canvas, type);
    if (blob) {
      return new File([blob], `perfil.${type === "image/webp" ? "webp" : "jpg"}`, { type });
    }
  }
  throw new Error("formato de imagem indisponível");
}
