export const navigationViews = ['home', 'orders', 'project', 'dashboard', 'expenses', 'adminExpenses', 'legacyExpenses', 'taxInvoices', 'corporateCards', 'worklogs', 'worklogList', 'deliveries', 'contacts', 'orderContacts'] as const
export type NavigationRoute = {
  view: typeof navigationViews[number]
  projectId: string
  year: string
  projectTab: 'worklogs' | 'expenses' | 'purchases' | 'purchaseOrders' | 'photos'
  month: string
}

export function parseNavigationHash(hash: string): NavigationRoute | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''))
  const view = params.get('view')
  if (!navigationViews.some(item => item === view)) return null
  const tab = params.get('tab')
  const year = params.get('year') ?? ''
  const month = params.get('month') ?? ''
  return {
    view: view as NavigationRoute['view'],
    projectId: params.get('project') ?? '',
    year: /^\d{4}$/.test(year) || year === '기타' ? year : String(new Date().getFullYear()),
    projectTab: tab === 'expenses' || tab === 'purchases' || tab === 'purchaseOrders' || tab === 'photos' ? tab : 'worklogs',
    month: /^\d{4}-(0[1-9]|1[0-2])$/.test(month) ? month : `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
  }
}

export function navigationHash(route: NavigationRoute) {
  return '#' + new URLSearchParams({ view: route.view, project: route.projectId, year: route.year, tab: route.projectTab, month: route.month }).toString()
}
