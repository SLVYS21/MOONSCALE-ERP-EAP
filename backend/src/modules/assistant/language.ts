const EN_HINTS = [
  ' the ', ' a ', ' and ', ' is ', ' you ', ' your ', ' i ', ' me ', ' please ', ' thanks ', ' thank ',
  'hello', 'hi ', 'hey ', 'good morning', 'good evening', 'how are', 'how is', 'what is', 'when is',
  'can i', 'could you', 'would you', 'do you', 'i would', 'i want', 'i need',
]

const FR_HINTS = [
  ' le ', ' la ', ' les ', ' et ', ' est ', ' tu ', ' vous ', ' je ', ' moi ', ' bonjour', ' bonsoir',
  ' merci ', ' svp', " s'il", ' comment ', ' quand ', " qu'est", ' pouvez', ' peux ', ' veux ',
]

export function detectLanguage(text: string): 'fr' | 'en' {
  if (!text) return 'fr'
  const t = ` ${text.toLowerCase()} `
  let frScore = 0
  let enScore = 0
  for (const h of FR_HINTS) if (t.includes(h)) frScore++
  for (const h of EN_HINTS) if (t.includes(h)) enScore++
  return enScore > frScore ? 'en' : 'fr'
}
