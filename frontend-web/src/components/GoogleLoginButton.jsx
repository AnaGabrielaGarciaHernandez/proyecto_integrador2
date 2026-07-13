import { useEffect, useRef } from 'react'
import { renderGoogleButton } from '../services/googleAuth'

export default function GoogleLoginButton({ text = 'signin_with', onCredential, onError }) {
  const buttonRef = useRef(null)
  const onCredentialRef = useRef(onCredential)
  const onErrorRef = useRef(onError)

  useEffect(() => {
    onCredentialRef.current = onCredential
  }, [onCredential])

  useEffect(() => {
    onErrorRef.current = onError
  }, [onError])

  useEffect(() => {
    if (!buttonRef.current) return

    renderGoogleButton(buttonRef.current, {
      text,
      onCredential: (credential) => onCredentialRef.current?.(credential),
      onError: (error) => onErrorRef.current?.(error),
    })
  }, [text])

  return (
    <div className="google-button-wrapper">
      <div ref={buttonRef} />
    </div>
  )
}
