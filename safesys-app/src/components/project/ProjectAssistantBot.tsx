'use client'

// 프로젝트 현장 AI 비서 챗봇 — 오늘 TBM 브리핑·감독 미서명 안내(플로팅)

import React, { useState, useRef, useEffect, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { MessageCircle, X, Send, Bot, User, Loader2, Minimize2, Maximize2, RotateCcw } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { PROJECT_ROUTE_SEGMENTS } from '@/lib/project-assistant/route-map'
import { useAiModel } from '@/lib/use-ai-model'

interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: Date
}

interface ProjectAssistantBotProps {
  projectId: string
  projectName?: string
}

export default function ProjectAssistantBot({ projectId, projectName }: ProjectAssistantBotProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [isMinimized, setIsMinimized] = useState(false)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const hasBriefedRef = useRef(false)
  const aiModel = useAiModel('chat.project-assistant', 'GPT-5.6 Luna')

  // 안전서류 점검 화면은 우하단에 "진행상황" 플로팅 버튼이 있어 겹친다 — 그 위로 올려 띄운다
  const pathname = usePathname()
  const isSafeDocuments = (pathname || '').endsWith('/safe-documents')

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

  const getAccessToken = async (): Promise<string | null> => {
    const { data: { session } } = await supabase.auth.getSession()
    return session?.access_token ?? null
  }

  const requestBriefing = useCallback(async () => {
    setIsLoading(true)
    try {
      const token = await getAccessToken()
      if (!token) {
        setMessages([{
          id: Date.now().toString(),
          role: 'assistant',
          content: '로그인이 필요합니다',
          timestamp: new Date()
        }])
        return
      }

      const response = await fetch('/api/chat/project-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId,
          mode: 'briefing',
        }),
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'API 요청 실패')
      }

      setMessages([{
        id: Date.now().toString(),
        role: 'assistant',
        content: data.response || '죄송합니다. 브리핑을 생성하지 못했습니다.',
        timestamp: new Date()
      }])
    } catch (error) {
      console.error('Briefing error:', error)
      const errorContent = error instanceof Error
        ? `오류: ${error.message}`
        : '죄송합니다. 브리핑을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.'
      setMessages([{
        id: Date.now().toString(),
        role: 'assistant',
        content: errorContent,
        timestamp: new Date()
      }])
    } finally {
      setIsLoading(false)
    }
  }, [projectId])

  // 챗봇을 처음 열 때(최초 1회) 자동 브리핑
  useEffect(() => {
    if (isOpen && !hasBriefedRef.current) {
      hasBriefedRef.current = true
      requestBriefing()
    }
  }, [isOpen, requestBriefing])

  const handleSend = async (overrideMessage?: string) => {
    const text = (overrideMessage ?? input).trim()
    if (!text || isLoading) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date()
    }

    const historyForApi = messages.slice(-10).map(m => ({
      role: m.role,
      content: m.content
    }))

    setMessages(prev => [...prev, userMessage])
    setInput('')
    setIsLoading(true)

    try {
      const token = await getAccessToken()
      if (!token) {
        setMessages(prev => [...prev, {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: '로그인이 필요합니다',
          timestamp: new Date()
        }])
        return
      }

      const response = await fetch('/api/chat/project-assistant', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId,
          mode: 'chat',
          message: userMessage.content,
          conversationHistory: historyForApi,
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

  // 대화 초기화 — 메시지 비우고 브리핑 재요청
  const handleReset = () => {
    setMessages([])
    setInput('')
    hasBriefedRef.current = true
    requestBriefing()
  }

  // 빠른 질문 버튼
  const quickQuestions = [
    '오늘 작업 브리핑',
    '감독 미서명 문서 알려줘',
    '이번 주 TBM 현황은?',
    '최근 검측 요청 현황은?',
  ]

  return (
    <>
      {/* 플로팅 버튼 */}
      {!isOpen && (
        <button
          onClick={() => setIsOpen(true)}
          className={`fixed ${isSafeDocuments ? 'bottom-20 sm:bottom-24' : 'bottom-4 sm:bottom-6'} right-4 sm:right-6 z-50 w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-full shadow-lg hover:from-emerald-700 hover:to-emerald-800 transition-all duration-300 flex items-center justify-center group hover:scale-110`}
          title="현장 AI 비서"
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
          <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-emerald-600 to-emerald-700 text-white rounded-t-2xl">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center">
                <Bot className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm">현장 AI 비서</h3>
                {!isMinimized && (
                  <p className="text-xs text-emerald-100">
                    {aiModel} · {projectName || '프로젝트'}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleReset}
                className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
                title="대화 초기화"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
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
                        ? 'bg-emerald-600 text-white'
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
                        ? 'bg-emerald-600 text-white rounded-br-md'
                        : 'bg-gray-100 text-gray-800 rounded-bl-md'
                    }`}>
                      {message.role === 'assistant' ? (
                        <AssistantMessageContent content={message.content} projectId={projectId} />
                      ) : (
                        <p className="text-sm whitespace-pre-wrap">{message.content}</p>
                      )}
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
                        <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
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
                        onClick={() => handleSend(q)}
                        disabled={isLoading}
                        className="px-3 py-1.5 text-xs bg-gray-100 hover:bg-emerald-100 text-gray-700 hover:text-emerald-700 rounded-full transition-colors disabled:opacity-50"
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
                    placeholder="현장 현황에 대해 물어보세요..."
                    className="flex-1 px-4 py-2.5 bg-gray-100 rounded-full text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white transition-all"
                    disabled={isLoading}
                  />
                  <button
                    onClick={() => handleSend()}
                    disabled={!input.trim() || isLoading}
                    className="w-10 h-10 bg-emerald-600 text-white rounded-full flex items-center justify-center hover:bg-emerald-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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

interface AssistantMessageContentProps {
  content: string
  projectId: string
}

// 어시스턴트 메시지의 [화면명](/project/{id}/세그먼트) 마크다운 링크를 화이트리스트 검증 후 클릭 링크로 렌더링
function AssistantMessageContent({ content, projectId }: AssistantMessageContentProps) {
  const router = useRouter()
  const linkPattern = /\[([^\]\n]+)\]\(([^)\s]+)\)/g
  const routePrefix = `/project/${projectId}/`
  const parts: React.ReactNode[] = []
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = linkPattern.exec(content)) !== null) {
    const [fullMatch, label, path] = match
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index))
    }
    const segment = path.startsWith(routePrefix) ? path.slice(routePrefix.length) : ''
    if (PROJECT_ROUTE_SEGMENTS.has(segment)) {
      parts.push(
        <button
          key={match.index}
          type="button"
          onClick={() => router.push(path)}
          className="text-emerald-700 underline underline-offset-2 hover:text-emerald-800"
        >
          {label}
        </button>
      )
    } else {
      parts.push(label)
    }
    lastIndex = match.index + fullMatch.length
  }
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex))
  }
  return <p className="text-sm whitespace-pre-wrap">{parts}</p>
}
