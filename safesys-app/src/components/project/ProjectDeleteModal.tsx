'use client'

import React, { useState } from 'react'
import { X, AlertTriangle } from 'lucide-react'
import { Project } from '@/lib/projects'

interface ProjectDeleteModalProps {
  isOpen: boolean
  project: Project | null
  onClose: () => void
  onConfirm: (projectId: string) => Promise<void>
  loading?: boolean
}

const ProjectDeleteModal: React.FC<ProjectDeleteModalProps> = ({
  isOpen,
  project,
  onClose,
  onConfirm,
  loading = false
}) => {
  const [confirmText, setConfirmText] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  if (!isOpen || !project) return null

  const isConfirmValid = confirmText === '삭제'

  const handleConfirm = async () => {
    if (!isConfirmValid) return

    setIsDeleting(true)
    try {
      await onConfirm(project.id)
      handleClose()
    } catch (error) {
      console.error('Delete confirmation error:', error)
    } finally {
      setIsDeleting(false)
    }
  }

  const handleClose = () => {
    setConfirmText('')
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        {/* 헤더 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center">
            <AlertTriangle className="h-6 w-6 text-red-600 mr-2" />
            <h3 className="text-lg font-semibold text-gray-900">
              프로젝트 삭제
            </h3>
          </div>
          <button
            onClick={handleClose}
            disabled={isDeleting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* 내용 */}
        <div className="p-6">
          <div className="mb-4">
            <p className="text-sm text-gray-600 mb-2">
              다음 프로젝트를 삭제하시겠습니까?
            </p>
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="font-medium text-gray-900">{project.project_name}</p>
              <p className="text-sm text-gray-600 mt-1">
                {project.managing_hq} • {project.managing_branch}
              </p>
            </div>
          </div>

          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
            <div className="flex">
              <AlertTriangle className="h-5 w-5 text-red-600 mr-2 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-red-700">
                <p className="font-medium mb-1">경고: 되돌릴 수 없는 작업입니다</p>
                <ul className="text-xs space-y-1">
                  <li>• 프로젝트가 완전히 삭제됩니다</li>
                  <li>• 해당 프로젝트의 모든 점검 기록이 삭제됩니다</li>
                  <li>• 삭제된 데이터는 복구할 수 없습니다</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="mb-6">
            <label htmlFor="confirmText" className="block text-sm font-medium text-gray-700 mb-2">
              삭제를 확인하려면 <span className="font-bold text-red-600">"삭제"</span>를 입력하세요:
            </label>
            <input
              id="confirmText"
              type="text"
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="삭제"
              disabled={isDeleting}
              className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-red-500 focus:border-red-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
              autoComplete="off"
            />
          </div>
        </div>

        {/* 버튼 */}
        <div className="flex justify-end space-x-3 p-6 border-t border-gray-200">
          <button
            type="button"
            onClick={handleClose}
            disabled={isDeleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            취소
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isConfirmValid || isDeleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 border border-transparent rounded-md shadow-sm hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isDeleting ? (
              <div className="flex items-center">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                삭제 중...
              </div>
            ) : (
              '프로젝트 삭제'
            )}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ProjectDeleteModal 