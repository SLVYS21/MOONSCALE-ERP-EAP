import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'

export function OffersPage() {
  const navigate = useNavigate()
  useEffect(() => { navigate('/payments/offers', { replace: true }) }, [navigate])
  return null
}
