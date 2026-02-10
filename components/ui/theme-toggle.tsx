'use client'

import { Moon, Sun } from 'lucide-react'
import { useEffect, useState } from 'react'

import { Button } from '@/components/ui/button'

export default function ThemeToggle() {
  const [mounted, setMounted] = useState(false)
  const [isDark, setIsDark] = useState(false)

  useEffect(() => {
    setMounted(true)
    const stored = window.localStorage.getItem('theme')
    const prefersDark = window.matchMedia(
      '(prefers-color-scheme: dark)'
    ).matches
    const shouldBeDark = stored ? stored === 'dark' : prefersDark
    setIsDark(shouldBeDark)
    document.documentElement.classList.toggle('dark', shouldBeDark)
  }, [])

  const toggleTheme = () => {
    const next = !isDark
    setIsDark(next)
    document.documentElement.classList.toggle('dark', next)
    window.localStorage.setItem('theme', next ? 'dark' : 'light')
  }

  if (!mounted) {
    return (
      <Button variant="outline" size="sm" className="gap-2" disabled>
        <Sun className="size-4" />
        Theme
      </Button>
    )
  }

  return (
    <Button variant="outline" size="sm" className="gap-2" onClick={toggleTheme}>
      {isDark ? <Moon className="size-4" /> : <Sun className="size-4" />}
      {isDark ? 'Dark' : 'Light'}
    </Button>
  )
}
