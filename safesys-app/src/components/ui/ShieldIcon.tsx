import React from 'react'

interface ShieldIconProps {
  size?: number
  className?: string
}

const ShieldIcon: React.FC<ShieldIconProps> = ({ size = 48, className = '' }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 48 48" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    <path 
      d="M24 4L6 12V22C6 32.5 12.5 42.26 24 44C35.5 42.26 42 32.5 42 22V12L24 4Z" 
      fill="#2563eb" 
      stroke="#1d4ed8" 
      strokeWidth="2"/>
    <path 
      d="M16 24L22 30L32 18" 
      stroke="#ffffff" 
      strokeWidth="3" 
      strokeLinecap="round" 
      strokeLinejoin="round" 
      fill="none"/>
  </svg>
)

export default ShieldIcon 