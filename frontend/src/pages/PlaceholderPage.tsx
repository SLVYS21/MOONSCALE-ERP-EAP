interface Props {
  title: string
  description?: string
}

export function PlaceholderPage({ title, description }: Props) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-6 text-center">
      <h1 className="text-xl font-semibold text-gray-100">{title}</h1>
      {description && <p className="mt-2 text-sm text-gray-500">{description}</p>}
      <p className="mt-1 text-xs text-gray-600">Module en construction</p>
    </div>
  )
}
