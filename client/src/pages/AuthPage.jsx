import { useEffect } from 'react'
import { buildLoginUrl, getCurrentRelativePath } from '../utils/authUrl'

export default function AuthPage() {
  useEffect(() => {
    window.location.assign(buildLoginUrl(getCurrentRelativePath()))
  }, [])
  return null
}
