import type { Order } from './orderTypes.ts'
import type { ResearchProject } from './workspaceTypes.ts'

// 연구비: research and test spending, numbered 269NN (26901, 26902, ...) within each year. Like
// 관리비 it is not a 공사 and never appears in 수주대장; each 연구 is registered on its own list.
export type { ResearchProject }

const researchPrefix = 'research-'
export const isResearchProject = (projectId: string) => projectId.startsWith(researchPrefix)
export const newResearchProjectId = () => `${researchPrefix}${crypto.randomUUID()}`
/** 26901–26999: a two-digit year, then 9 and a two-digit sequence. */
export const isResearchOrderNo = (orderNo: string) => /^\d{2}9\d{2}$/.test(orderNo.trim()) && !/^\d{2}900$/.test(orderNo.trim())
export const researchYear = (orderNo: string) => `20${orderNo.trim().slice(0, 2)}`

/** A stand-in order so a 연구 can be picked, posted to and printed like a 공사. */
export function researchOrder(project: ResearchProject): Order {
  const year = researchYear(project.orderNo)
  return {
    id: project.id, year, orderNo: project.orderNo,
    orderDate: `${year}-01-01`, expectedCompletionDate: `${year}-12-31`,
    manager: '', client1: '', client2: '', region: '', projectName: project.name, note: '',
  }
}

export const researchOfYear = (projects: ResearchProject[], year: string) =>
  projects.filter(project => researchYear(project.orderNo) === year).sort((a, b) => a.orderNo.localeCompare(b.orderNo))

/** The next free 연구 number of the year: 26901 first, then one past the highest. Null once 99 are used. */
export function nextResearchOrderNo(projects: ResearchProject[], year: string) {
  const used = researchOfYear(projects, year).map(project => Number(project.orderNo.slice(3)))
  const next = Math.max(0, ...used) + 1
  return next > 99 ? null : `${year.slice(2)}9${String(next).padStart(2, '0')}`
}
