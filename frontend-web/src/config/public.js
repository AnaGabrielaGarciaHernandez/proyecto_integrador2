export const publicConfig = {
  companyName: import.meta.env.VITE_LEGAL_COMPANY_NAME || 'EcoBazar',
  legalAddress: import.meta.env.VITE_LEGAL_ADDRESS || 'Domicilio legal publicado en la información de contacto.',
  privacyEmail: import.meta.env.VITE_PRIVACY_EMAIL || 'privacidad@ecobazar.com',
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL || 'soporte@ecobazar.com',
  supportPhone: import.meta.env.VITE_SUPPORT_PHONE || 'Atención por correo electrónico',
}
