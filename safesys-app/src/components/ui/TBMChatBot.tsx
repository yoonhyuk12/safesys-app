'use client'

import React, { useState, useRef, useEffect } from 'react'
import { MessageCircle, X, Send, Bot, User, Loader2, Minimize2, Maximize2 } from 'lucide-react'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface UserProfile {
  full_name?: string
  role?: string
  hq_division?: string | null
  branch_division?: string | null
}

interface TBMChatBotProps {
  userProfile?: UserProfile | null
}

export default function TBMChatBot({ userProfile }: TBMChatBotProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  // 사용자 권한에 따른 초기 메시지 생성
  const getInitialMessage = (): string => {
    if (!userProfile) {
      return '안녕하세요! TBM 현황에 대해 궁금한 점을 물어보세요.'
    }
    
    const name = userProfile.full_name || '사용자'
    const hq = userProfile.hq_division
    const branch = userProfile.branch_division
    
    if (branch && !branch.endsWith('본부')) {
      return `안녕하세요 ${name}님! ${branch} TBM 현황에 대해 물어보세요. 소속 지사의 TBM 실시율, 위험공종, 신규인원 현황 등을 안내해드립니다.`
    } else if (hq) {
      return `안녕하세요 ${name}님! ${hq} TBM 현황에 대해 물어보세요. 본부 내 지사별 TBM 현황, 위험공종 분석 등을 도와드립니다.`
    }
    return `안녕하세요 ${name}님! 전체 TBM 현황에 대해 궁금한 점을 물어보세요. TBM 실시율, 본부별 현황, 위험공종 분석 등을 도와드릴 수 있습니다.`
  }

  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: getInitialMessage(),
      timestamp: new Date()
    }
  ])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 메시지 스크롤
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages])

  // 채팅창 열릴 때 인풋 포커스
  useEffect(() => {
    if (isOpen && !isMinimized && inputRef.current) {
      inputRef.current.focus()
    }
  }, [isOpen, isMinimized])

  const handleSend = async () => {
    if (!input.trim() || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input.trim(),
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const response = await fetch('/api/chat/tbm', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: userMessage.content,
          conversationHistory: messages.slice(-10).map(m => ({
            role: m.role,
            content: m.content
          })),
          userPermission: userProfile ? {
            hq: userProfile.hq_division,
            branch: userProfile.branch_division,
            role: userProfile.role,
            name: userProfile.full_name
          } : null
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'API 요청 실패')
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: data.response || '죄송합니다. 응답을 생성하지 못했습니다.',
        timestamp: new Date()
      }

      setMessages(prev => [...prev, assistantMessage])
    } catch (error) {
      console.error('Chat error:', error)
      const errorContent = error instanceof Error 
        ? `오류: ${error.message}` 
        : '죄송합니다. 오류가 발생했습니다. 잠시 후 다시 시도해주세요.'
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: errorContent,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, errorMessage])
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  // 빠른 질문 버튼
  const quickQuestions = [
    '오늘 TBM 실시율은?',
    '위험공종 현황 알려줘',
    '신규인원 현황은?',
    '본부별 비교해줘'
  ]

  return (
    <>
      {/* 플로팅 버튼 */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className="fixed bottom-4 right-4 sm:bottom-6 sm:right-6 z-50 w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-full shadow-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-300 flex items-center justify-center group hover:scale-110"
          title="TBM 현황 AI 상담"
        >
          <MessageCircle className="h-6 w-6 sm:h-7 sm:w-7 group-hover:scale-110 transition-transform" />
          <span className="absolute -top-1 -right-1 w-3 h-3 sm:w-4 sm:h-4 bg-green-500 rounded-full animate-pulse" />
        </button>
      )}

      {/* 채팅 창 */}
      {isOpen && (
        <div 
          className={`fixed z-50 bg-white rounded-2xl shadow-2xl border border-gray-200 flex flex-col transition-all duration-300 ${
            isMinimized 
              ? 'bottom-4 right-4 w-64 sm:w-72 h-14' 
              : 'bottom-4 right-4 left-4 sm:left-auto sm:w-96 h-[500px] sm:h-[600px] max-h-[85vh]'
          }`}
        >
          {/* 헤더 */}
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-t-2xl">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">TBM AI 어시스턴트</h3>
                {!isMinimized && (
                  <p className="text-xs text-blue-100">
                    GPT-4o-mini · Supabase · {userProfile?.branch_division && !userProfile.branch_division.endsWith('본부') 
                      ? userProfile.branch_division 
                      : userProfile?.hq_division 
                        ? userProfile.hq_division 
                        : '전체'}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsMinimized(!isMinimized)}
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                title={isMinimized ? '확대' : '최소화'}
              >
                {isMinimized ? (
                  <Maximize2 className="h-4 w-4" />
                ) : (
                  <Minimize2 className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                title="닫기"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* 메시지 영역 */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {messages.map((message) => (
                  <div
                    key={message.id}
                    className={`flex gap-2 ${message.role === 'user' ? 'flex-row-reverse' : ''}`}
                  >
                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
                      message.role === 'user' 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-100 text-gray-600'
                    }`}>
                      {message.role === 'user' ? (
                        <User className="h-4 w-4" />
                      ) : (
                        <Bot className="h-4 w-4" />
                      )}
                    </div>
                    <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${
                      message.role === 'user'
                        ? 'bg-blue-600 text-white rounded-br-md'
                        : 'bg-gray-100 text-gray-800 rounded-bl-md'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                    </div>
                  </div>
                ))}
                
                {isLoading && (
                  <div className="flex gap-2">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">
                      <Bot className="h-4 w-4 text-gray-600" />
                    </div>
                    <div className="bg-gray-100 px-4 py-2.5 rounded-2xl rounded-bl-md">
                      <div className="flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-blue-600" />
                        <span className="text-sm text-gray-500">분석 중...</span>
                      </div>
                    </div>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>

              {/* 빠른 질문 버튼 */}
              {messages.length <= 2 && (
                <div className="px-4 py-2 border-t border-gray-100">
                  <p className="text-xs text-gray-500 mb-2">빠른 질문</p>
                  <div className="flex flex-wrap gap-2">
                    {quickQuestions.map((q, index) => (
                      <button
                        key={index}
                        onClick={() => {
                          setInput(q)
                          setTimeout(() => handleSend(), 100)
                        }}
                        disabled={isLoading}
                        className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-blue-100 text-gray-700 hover:text-blue-700 rounded-full transition-colors disabled:opacity-50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* 입력 영역 */}
              <div className="p-4 border-t border-gray-200">
                <div className="flex items-center gap-2">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="TBM 현황에 대해 물어보세요..."
                    className="flex-1 px-4 py-2.5 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white transition-all"
                    disabled={isLoading}
                  />
                  <button
                    onClick={handleSend}
                    disabled={!input.trim() || isLoading}
                    className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isLoading ? (
                      <Loader2 className="h-5 w-5 animate-spin" />
                    ) : (
                      <Send className="h-5 w-5" />
                    )}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
