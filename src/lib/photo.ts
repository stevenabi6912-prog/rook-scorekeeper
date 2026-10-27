/*
 * Profile photos are stored on the player document as a small JPEG data URL
 * (about 128×128, a few KB), so they sync like everything else without a
 * separate file store.
 */

export const PHOTO_SIZE = 128
/** Hard cap on the stored data URL; a 128px JPEG at this quality is well under it. */
export const PHOTO_MAX_CHARS = 40_000

/** Reads a picked image, crops it square from the centre and shrinks it. */
export function shrinkPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const side = Math.min(img.naturalWidth, img.naturalHeight)
      if (!side) return reject(new Error('That file is not a picture.'))
      const sx = (img.naturalWidth - side) / 2
      const sy = (img.naturalHeight - side) / 2
      const canvas = document.createElement('canvas')
      canvas.width = PHOTO_SIZE
      canvas.height = PHOTO_SIZE
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Could not process the picture.'))
      ctx.drawImage(img, sx, sy, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE)
      let quality = 0.85
      let out = canvas.toDataURL('image/jpeg', quality)
      while (out.length > PHOTO_MAX_CHARS && quality > 0.3) {
        quality -= 0.15
        out = canvas.toDataURL('image/jpeg', quality)
      }
      if (out.length > PHOTO_MAX_CHARS) return reject(new Error('That picture could not be made small enough.'))
      resolve(out)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('That file could not be read as a picture.'))
    }
    img.src = url
  })
}
