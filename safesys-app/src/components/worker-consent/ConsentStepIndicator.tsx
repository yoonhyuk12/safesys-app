import React from 'react'
import { Check } from 'lucide-react'
import { CONSENT_STEPS } from './types'

interface ConsentStepIndicatorProps {
  currentStep: number
}

export default function ConsentStepIndicator({ currentStep }: ConsentStepIndicatorProps) {
  return (
    <div className="flex items-center justify-between px-2 py-3">
      {CONSENT_STEPS.map((step, index) => (
        <React.Fragment key={step.id}>
          <div className="flex flex-col items-center gap-1">
            <div
              className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                currentStep > step.id
                  ? 'bg-green-500 text-white'
                  : currentStep === step.id
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-200 text-gray-500'
              }`}
            >
              {currentStep > step.id ? <Check className="h-4 w-4" /> : step.id}
            </div>
            <span
              className={`text-[10px] font-medium ${
                currentStep === step.id ? 'text-blue-600' : currentStep > step.id ? 'text-green-600' : 'text-gray-400'
              }`}
            >
              {step.label}
            </span>
          </div>
          {index < CONSENT_STEPS.length - 1 && (
            <div
              className={`flex-1 h-0.5 mx-1 mb-4 ${
                currentStep > step.id ? 'bg-green-400' : 'bg-gray-200'
              }`}
            />
          )}
        </React.Fragment>
      ))}
    </div>
  )
}
