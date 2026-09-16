'use client'
// 사고 입력 모달의 프로젝트 검색 콤보박스 — 등록 프로젝트 검색과 미등록 현장 직접입력 옵션을 한 목록으로 다룬다

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import type { Project } from '@/lib/projects'

export const inputClassName = 'w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-100'

export const getProjectOptionLabel = (project: Project): string =>
  `${project.project_name} (${project.managing_hq} · ${project.managing_branch})`

const getExternalLabel = (name: string, hq: string, branch: string): string => {
  const org = [hq, branch].filter(Boolean).join(' · ')
  return org ? `${name} (미등록 · ${org})` : `${name} (미등록 현장)`
}

const normalizeSearchText = (value: string): string => value.trim().toLocaleLowerCase('ko')

interface ProjectSearchSelectProps {
  id: string
  projects: Project[]
  projectId: string
  externalProjectName: string
  isExternal: boolean
  externalManagingHq: string
  externalManagingBranch: string
  disabled: boolean
  onSelectProject: (projectId: string) => void
  onSelectExternal: (name: string) => void
}

export default function ProjectSearchSelect({
  id,
  projects,
  projectId,
  externalProjectName,
  isExternal,
  externalManagingHq,
  externalManagingBranch,
  disabled,
  onSelectProject,
  onSelectExternal,
}: ProjectSearchSelectProps) {
  const listboxId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const activeOptionRef = useRef<HTMLButtonElement>(null)
  const selectedProject = projects.find((project) => project.id === projectId)
  const selectedLabel = isExternal
    ? getExternalLabel(externalProjectName, externalManagingHq, externalManagingBranch)
    : selectedProject
      ? getProjectOptionLabel(selectedProject)
      : ''
  const [query, setQuery] = useState(selectedLabel)
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(0)

  const filteredProjects = useMemo(() => {
    const searchTerms = normalizeSearchText(query).split(/\s+/).filter(Boolean)
    if (searchTerms.length === 0) return projects

    return projects.filter((project) => {
      const searchableText = normalizeSearchText(
        `${project.project_name} ${project.managing_hq} ${project.managing_branch}`,
      )
      return searchTerms.every((term) => searchableText.includes(term))
    })
  }, [projects, query])

  const trimmedQuery = query.trim()
  const canUseExternal = trimmedQuery.length > 0
  // 프로젝트 옵션 + 직접입력 옵션을 하나의 목록으로 다룬다.
  const optionCount = filteredProjects.length + (canUseExternal ? 1 : 0)
  const activeProject = activeIndex >= 0 && activeIndex < filteredProjects.length
    ? filteredProjects[activeIndex]
    : undefined
  const isExternalOptionActive = canUseExternal && activeIndex === filteredProjects.length

  useEffect(() => {
    setQuery(selectedLabel)
    setIsOpen(false)
  }, [selectedLabel])

  useEffect(() => {
    setActiveIndex(optionCount > 0 ? 0 : -1)
  }, [optionCount, query])

  useEffect(() => {
    if (isOpen) activeOptionRef.current?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, isOpen])

  const selectProject = (project: Project) => {
    onSelectProject(project.id)
    setQuery(getProjectOptionLabel(project))
    setIsOpen(false)
    inputRef.current?.focus()
  }

  const selectExternal = (name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    onSelectExternal(trimmed)
    setQuery(getExternalLabel(trimmed, '', ''))
    setIsOpen(false)
    inputRef.current?.focus()
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (!isOpen) {
        setQuery('')
        setIsOpen(true)
        return
      }
      setActiveIndex((current) => Math.min(current + 1, optionCount - 1))
      return
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!isOpen) {
        setQuery('')
        setIsOpen(true)
        return
      }
      setActiveIndex((current) => Math.max(current - 1, 0))
      return
    }

    if (event.key === 'Enter' && isOpen && activeIndex >= 0) {
      event.preventDefault()
      if (isExternalOptionActive) {
        selectExternal(trimmedQuery)
        return
      }
      const project = filteredProjects[activeIndex]
      if (project) selectProject(project)
      return
    }

    if (event.key === 'Escape' && isOpen) {
      event.preventDefault()
      event.stopPropagation()
      setQuery(selectedLabel)
      setIsOpen(false)
    }
  }

  return (
    <div
      className="relative"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          setQuery(selectedLabel)
          setIsOpen(false)
        }
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-gray-400" />
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={isOpen}
        aria-activedescendant={
          isOpen
            ? (isExternalOptionActive
              ? `${listboxId}-external`
              : activeProject
                ? `${listboxId}-${activeProject.id}`
                : undefined)
            : undefined
        }
        aria-required="true"
        autoComplete="off"
        value={query}
        placeholder="프로젝트명 검색 또는 미등록 현장 직접입력"
        disabled={disabled}
        onFocus={(event) => {
          event.currentTarget.select()
          setQuery('')
          setIsOpen(true)
        }}
        onChange={(event) => {
          setQuery(event.target.value)
          setIsOpen(true)
        }}
        onKeyDown={handleKeyDown}
        className={`${inputClassName} pl-9 pr-10`}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={isOpen ? '프로젝트 목록 닫기' : '프로젝트 목록 열기'}
        disabled={disabled}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => {
          if (isOpen) {
            setQuery(selectedLabel)
            setIsOpen(false)
          } else {
            setQuery('')
            setIsOpen(true)
            inputRef.current?.focus()
          }
        }}
        className="absolute right-0 top-0 flex h-full w-10 items-center justify-center text-gray-400 hover:text-gray-700 disabled:cursor-not-allowed"
      >
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {isOpen && !disabled && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
          <div className="border-b border-gray-100 px-3 py-2 text-xs text-gray-500">
            {filteredProjects.length.toLocaleString('ko-KR')}개 프로젝트 · 미등록 현장은 직접입력 가능
          </div>
          <ul id={listboxId} role="listbox" className="max-h-60 overflow-y-auto py-1">
            {filteredProjects.map((project, index) => {
              const isSelected = !isExternal && project.id === projectId
              const isActive = index === activeIndex
              return (
                <li key={project.id}>
                  <button
                    ref={isActive ? activeOptionRef : undefined}
                    id={`${listboxId}-${project.id}`}
                    type="button"
                    role="option"
                    aria-selected={isSelected}
                    onMouseDown={(event) => event.preventDefault()}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => selectProject(project)}
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm ${isActive ? 'bg-indigo-50 text-indigo-900' : 'text-gray-800 hover:bg-gray-50'}`}
                  >
                    <Check className={`mt-0.5 h-4 w-4 flex-shrink-0 ${isSelected ? 'text-indigo-600' : 'invisible'}`} />
                    <span className="min-w-0 break-words">{getProjectOptionLabel(project)}</span>
                  </button>
                </li>
              )
            })}
            {canUseExternal && (
              <li>
                <button
                  ref={isExternalOptionActive ? activeOptionRef : undefined}
                  id={`${listboxId}-external`}
                  type="button"
                  role="option"
                  aria-selected={isExternal && externalProjectName === trimmedQuery}
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => setActiveIndex(filteredProjects.length)}
                  onClick={() => selectExternal(trimmedQuery)}
                  className={`flex w-full items-start gap-2 border-t border-gray-100 px-3 py-2.5 text-left text-sm ${isExternalOptionActive ? 'bg-amber-50 text-amber-950' : 'text-amber-900 hover:bg-amber-50'}`}
                >
                  <Check className={`mt-0.5 h-4 w-4 flex-shrink-0 ${isExternal && externalProjectName === trimmedQuery ? 'text-amber-600' : 'invisible'}`} />
                  <span className="min-w-0">
                    <span className="font-medium">미등록 현장으로 직접입력</span>
                    <span className="mt-0.5 block break-words text-xs text-amber-800/80">「{trimmedQuery}」</span>
                  </span>
                </button>
              </li>
            )}
            {filteredProjects.length === 0 && !canUseExternal && (
              <li className="px-3 py-5 text-center text-sm text-gray-500">검색어를 입력해 주세요.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  )
}
