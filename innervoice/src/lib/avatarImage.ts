const MAX_BYTES = 420_000
const OUTPUT_SIZE = 256

export async function processAvatarFile(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) {
    throw new Error('Please choose a JPG, PNG, or WebP image.')
  }
  if (file.size > 12 * 1024 * 1024) {
    throw new Error('Image must be under 12 MB.')
  }

  const bitmap = await createImageBitmap(file)
  const scale = Math.min(OUTPUT_SIZE / bitmap.width, OUTPUT_SIZE / bitmap.height, 1)
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not process image.')

  ctx.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  let quality = 0.88
  let dataUrl = canvas.toDataURL('image/jpeg', quality)
  while (dataUrl.length > MAX_BYTES && quality > 0.45) {
    quality -= 0.08
    dataUrl = canvas.toDataURL('image/jpeg', quality)
  }

  if (dataUrl.length > MAX_BYTES) {
    throw new Error('Image is too large after compression. Try a smaller photo.')
  }

  return dataUrl
}
