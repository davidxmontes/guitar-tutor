import { useState, useCallback, useRef } from 'react'

interface PlayButtonProps {
  onClick: (e: React.MouseEvent) => void
  duration?: number  // How long the playing state should last (ms)
  size?: 'sm' | 'md' | 'lg'
  variant?: 'primary' | 'secondary' | 'ghost'
  label?: string
  className?: string
}

export function PlayButton({
  onClick,
  duration = 2000,
  size = 'md',
  variant = 'secondary',
  label,
  className = '',
}: PlayButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const timeoutRef = useRef<number | null>(null)
  
  const handleClick = useCallback((e: React.MouseEvent) => {
    // Clear any existing timeout
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    setIsPlaying(true)
    onClick(e)
    
    // Reset playing state after duration
    timeoutRef.current = window.setTimeout(() => {
      setIsPlaying(false)
    }, duration)
  }, [onClick, duration])
  
  const sizeClasses = {
    sm: 'w-6 h-6 text-xs',
    md: 'w-8 h-8 text-sm',
    lg: 'w-10 h-10 text-base',
  }
  
  const variantClasses = {
    primary: isPlaying 
      ? 'bg-blue-600 text-white' 
      : 'bg-blue-500 hover:bg-blue-600 text-white',
    secondary: isPlaying 
      ? 'bg-gray-300 text-gray-700' 
      : 'bg-gray-200 hover:bg-gray-300 text-gray-700',
    ghost: isPlaying 
      ? 'bg-gray-200 text-gray-700' 
      : 'hover:bg-gray-100 text-gray-600',
  }
  
  return (
    <button
      onClick={handleClick}
      disabled={isPlaying}
      className={`
        ${sizeClasses[size]}
        ${variantClasses[variant]}
        rounded-full
        flex items-center justify-center
        transition-all
        disabled:cursor-not-allowed
        ${isPlaying ? 'animate-pulse' : ''}
        ${className}
      `}
      title={label || 'Play'}
    >
      {isPlaying ? (
        // Sound wave icon when playing
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <rect x="4" y="8" width="3" height="8" rx="1">
            <animate attributeName="height" values="8;16;8" dur="0.5s" repeatCount="indefinite" />
            <animate attributeName="y" values="8;4;8" dur="0.5s" repeatCount="indefinite" />
          </rect>
          <rect x="10" y="6" width="3" height="12" rx="1">
            <animate attributeName="height" values="12;8;12" dur="0.5s" repeatCount="indefinite" />
            <animate attributeName="y" values="6;8;6" dur="0.5s" repeatCount="indefinite" />
          </rect>
          <rect x="16" y="9" width="3" height="6" rx="1">
            <animate attributeName="height" values="6;14;6" dur="0.5s" repeatCount="indefinite" />
            <animate attributeName="y" values="9;5;9" dur="0.5s" repeatCount="indefinite" />
          </rect>
        </svg>
      ) : (
        // Play icon
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <path d="M8 5v14l11-7z" />
        </svg>
      )}
    </button>
  )
}

// Text button variant for inline use
interface PlayTextButtonProps {
  onClick: () => void
  duration?: number
  label: string
  className?: string
}

export function PlayTextButton({
  onClick,
  duration = 2000,
  label,
  className = '',
}: PlayTextButtonProps) {
  const [isPlaying, setIsPlaying] = useState(false)
  const timeoutRef = useRef<number | null>(null)
  
  const handleClick = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
    }
    
    setIsPlaying(true)
    onClick()
    
    timeoutRef.current = window.setTimeout(() => {
      setIsPlaying(false)
    }, duration)
  }, [onClick, duration])
  
  return (
    <button
      onClick={handleClick}
      disabled={isPlaying}
      className={`
        inline-flex items-center gap-1.5
        px-3 py-1.5
        text-sm font-medium
        rounded-lg
        transition-all
        ${isPlaying 
          ? 'bg-blue-100 text-blue-700' 
          : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
        }
        disabled:cursor-not-allowed
        ${className}
      `}
    >
      {isPlaying ? (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <rect x="4" y="8" width="3" height="8" rx="1">
            <animate attributeName="height" values="8;16;8" dur="0.5s" repeatCount="indefinite" />
            <animate attributeName="y" values="8;4;8" dur="0.5s" repeatCount="indefinite" />
          </rect>
          <rect x="10" y="6" width="3" height="12" rx="1">
            <animate attributeName="height" values="12;8;12" dur="0.5s" repeatCount="indefinite" />
            <animate attributeName="y" values="6;8;6" dur="0.5s" repeatCount="indefinite" />
          </rect>
          <rect x="16" y="9" width="3" height="6" rx="1">
            <animate attributeName="height" values="6;14;6" dur="0.5s" repeatCount="indefinite" />
            <animate attributeName="y" values="9;5;9" dur="0.5s" repeatCount="indefinite" />
          </rect>
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
          <path d="M8 5v14l11-7z" />
        </svg>
      )}
      {label}
    </button>
  )
}
