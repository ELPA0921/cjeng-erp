import { useEffect, useState } from 'react'
import { listProjectFiles, type ProjectFile } from './projectFileApi'

/** The 발주서 and 사진대지 pictures of one 공사, loaded when the 공사 is opened. */
export function useProjectFiles(projectId: string | undefined, shared: boolean) {
  const [state, setState] = useState<{ projectId: string; files: ProjectFile[]; error: string; loaded: boolean }>({ projectId: '', files: [], error: '', loaded: false })
  useEffect(() => {
    if (!projectId || !shared) return
    let active = true
    listProjectFiles(projectId)
      .then(files => { if (active) setState({ projectId, files, error: '', loaded: true }) })
      .catch(error => { if (active) setState({ projectId, files: [], error: error instanceof Error ? error.message : '사진을 불러오지 못했습니다.', loaded: true }) })
    return () => { active = false }
  }, [projectId, shared])
  const current = state.projectId === projectId
  const change = (update: (files: ProjectFile[]) => ProjectFile[]) => setState(previous => ({ ...previous, files: update(previous.files) }))
  return {
    shared,
    loaded: current && state.loaded,
    error: current ? state.error : '',
    files: current ? state.files : [],
    added: (file: ProjectFile) => change(files => [...files, file]),
    replaced: (file: ProjectFile) => change(files => files.map(row => row.id === file.id ? file : row)),
    removed: (id: string) => change(files => files.filter(row => row.id !== id)),
  }
}
export type ProjectFilesStore = ReturnType<typeof useProjectFiles>
