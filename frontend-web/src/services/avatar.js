export const AVATAR_MAX_INPUT_BYTES = 5 * 1024 * 1024
export const AVATAR_ALLOWED_MIME_TYPES = Object.freeze([
  'image/jpeg',
  'image/png',
  'image/webp',
])

export function validateAvatarFile(file) {
  if (!file || !AVATAR_ALLOWED_MIME_TYPES.includes(file.type)) {
    throw new Error('Selecciona una imagen JPEG, PNG o WebP.')
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    throw new Error('La foto seleccionada está vacía.')
  }

  if (file.size > AVATAR_MAX_INPUT_BYTES) {
    throw new Error('La foto no puede superar los 5 MB.')
  }

  return file
}

export function createAvatarPreview(file) {
  return URL.createObjectURL(file)
}
