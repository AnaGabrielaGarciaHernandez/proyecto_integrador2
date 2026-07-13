import { useEffect, useRef } from 'react'
import { renderGoogleButton } from '../services/googleAuth'

export default function GoogleLoginButton({ text = 'signin_with', onCredential, onError }) {
  const buttonRef = useRef(null)

  useEffect(() => {
    if (!buttonRef.current) return

    renderGoogleButton(buttonRef.current, {
      text,
      onCredential,
      onError,
    })
  }, [text, onCredential, onError])

  return (
    <div className="google-button-wrapper">
      <div ref={buttonRef} />
    </div>
  )
}
