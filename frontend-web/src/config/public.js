export const publicConfig = {
  companyName: import.meta.env.VITE_LEGAL_COMPANY_NAME || 'EcoBazar',
  legalAddress: import.meta.env.VITE_LEGAL_ADDRESS || 'Domicilio legal publicado en la información de contacto.',
  privacyEmail: import.meta.env.VITE_PRIVACY_EMAIL || 'contacto@eco-bazar.store',
  supportEmail: import.meta.env.VITE_SUPPORT_EMAIL || 'contacto@eco-bazar.store',
  supportPhone: import.meta.env.VITE_SUPPORT_PHONE || 'Atención por correo electrónico',
}
