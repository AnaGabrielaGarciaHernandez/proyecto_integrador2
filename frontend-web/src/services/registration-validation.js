const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const PASSWORD_REQUIREMENTS = [
  { id: 'min-length', label: 'Mínimo 8 caracteres' },
  { id: 'max-length', label: 'Máximo 128 caracteres' },
  { id: 'uppercase', label: 'Una letra mayúscula' },
  { id: 'lowercase', label: 'Una letra minúscula' },
  { id: 'number', label: 'Un número' },
]

export function getRegistrationValidation({ name = '', email = '', password = '' } = {}) {
  const trimmedName = name.trim()
  const trimmedEmail = email.trim()

  const nameRequirements = [
    { id: 'min-length', label: 'Mínimo 2 caracteres', valid: trimmedName.length >= 2 },
    {
      id: 'max-length',
      label: 'Máximo 50 caracteres',
      valid: trimmedName.length <= 50,
      visible: trimmedName.length > 50,
    },
  ]

  const emailRequirements = [
    {
      id: 'format',
      label: 'Formato válido (nombre@dominio.com)',
      valid: EMAIL_PATTERN.test(trimmedEmail),
    },
  ]

  const passwordRequirements = [
    { id: 'min-length', label: 'Mínimo 8 caracteres', valid: password.length >= 8 },
    {
      id: 'max-length',
      label: 'Máximo 128 caracteres',
      valid: password.length <= 128,
      visible: password.length > 128,
    },
    { id: 'uppercase', label: 'Una letra mayúscula', valid: /[A-Z]/.test(password) },
    { id: 'lowercase', label: 'Una letra minúscula', valid: /[a-z]/.test(password) },
    { id: 'number', label: 'Un número', valid: /[0-9]/.test(password) },
  ]

  const requirements = {
    name: nameRequirements,
    email: emailRequirements,
    password: passwordRequirements,
  }

  return {
    ...requirements,
    isValid: Object.values(requirements).flat().every(({ valid }) => valid),
  }
}
