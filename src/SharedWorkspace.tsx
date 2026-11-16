import { useCallback, useEffect, useRef, useState } from 'react'
import App from './App'
import type { Order } from './orderTypes'
import type { WorkspaceData, WorkspaceSnapshot } from './workspaceTypes'
import { browserWorkspace, mergeBrowserWorkspace } from './browserWorkspace'
import { hasOps, workspaceOps } from './workspaceDiff'
import './SharedWorkspace.css'
import UserManager from './UserManager'

type User = { email: string; name: string; sub: string }
type Session = { user: User | null; clientId?: string; nonce?: string; canInitialize?: boolean; canManageUsers?: boolean }
type OrderSnapshot = { orders: Order[]; revision: number | string }
type Snapshot = OrderSnapshot & { workspace: WorkspaceSnapshot }
type GoogleIdentity = { initialize: (config: { client_id: string; nonce: string; callback: (response: { credential: string }) => void }) => void; renderButton: (element: HTMLElement, config: { theme: string; size: string; text: string; locale: string }) => void; disableAutoSelect: () => void }
declare global { interface Window { google?: { accounts: { id: GoogleIdentity } } } }

// Saves name the version they come from; an answer from a newer version tells this screen to reload.
const outdatedEvent = 'cjeng-outdated'
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-App-Build': __APP_BUILD__, ...init?.headers } })
  const build = response.headers.get('X-App-Build')
  if (build && __APP_BUILD__ && build !== __APP_BUILD__) window.dispatchEvent(new Event(outdatedEvent))
  const body = await response.json().catch(() => ({}))
  if (!response.ok) throw Object.assign(new Error(body.error || '서버에 연결할 수 없습니다.'), { status: response.status })
  return body as T
}

type Unchanged = { unchanged: true }
const unchanged = (value: object): value is Unchanged => 'unchanged' in value
// With the current snapshot, the server answers "unchanged" instead of resending everything.
async function loadSnapshot(signal?: AbortSignal, current?: Snapshot | null): Promise<Snapshot> {
  const since = (revision: number | string | undefined) => current ? `?revision=${encodeURIComponent(String(revision))}` : ''
  const [orders,workspace] = await Promise.all([
    api<OrderSnapshot | Unchanged>('/api/orders'+since(current?.revision),{signal}),
    api<WorkspaceSnapshot | Unchanged>('/api/workspace'+since(current?.workspace.revision),{signal}),
  ])
  const nextOrders = unchanged(orders) && current ? { orders: current.orders, revision: current.revision } : orders as OrderSnapshot
  const nextWorkspace = unchanged(workspace) && current ? current.workspace : workspace as WorkspaceSnapshot
  return {...nextOrders,workspace:nextWorkspace}
}

function GoogleButton({ clientId, nonce, onCredential }: { clientId: string; nonce: string; onCredential: (credential: string) => void }) {
  const host = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    const render = () => {
      if (!active || !host.current || !window.google) return
      window.google.accounts.id.initialize({ client_id: clientId, nonce, callback: response => onCredential(response.credential) })
      host.current.replaceChildren()
      window.google.accounts.id.renderButton(host.current, { theme: 'outline', size: 'large', text: 'signin_with', locale: 'ko' })
    }
    let script = document.querySelector<HTMLScriptElement>('script[data-cjeng-google]')
    if (window.google) render()
    else {
      if (!script) {
        script = document.createElement('script')
        script.src = 'https://accounts.google.com/gsi/client'
        script.async = true
        script.dataset.cjengGoogle = 'true'
        document.head.appendChild(script)
      }
      script.addEventListener('load', render)
      script.addEventListener('error', failed)
    }
    function failed() { if (active) setError('Google 로그인 화면을 불러오지 못했습니다. 새로고침 후 다시 시도하세요.') }
    return () => { active = false; script?.removeEventListener('load', render); script?.removeEventListener('error', failed) }
  }, [clientId, nonce, onCredential])
  return <><div ref={host} />{error && <p role="alert">{error}</p>}</>
}

function SignedInWorkspace({ user, canInitialize, canManageUsers, onSignOut }: { user: User; canInitialize: boolean; canManageUsers: boolean; onSignOut: () => Promise<void> }) {
  const [managingUsers, setManagingUsers] = useState(false)
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null)
  const latest = useRef<Snapshot | null>(null)
  useEffect(() => { latest.current = snapshot }, [snapshot])
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const readTask = useRef<Promise<void> | null>(null)
  const writePending = useRef(false)
  const [signOutError, setSignOutError] = useState('')
  const [outdated, setOutdated] = useState(false)
  useEffect(() => {
    const onOutdated = () => setOutdated(true)
    window.addEventListener(outdatedEvent, onOutdated)
    return () => window.removeEventListener(outdatedEvent, onOutdated)
  }, [])
  const refresh = useCallback(async () => {
    if (busy.current || writePending.current) return
    busy.current = true
    const task=loadSnapshot(undefined,latest.current).then(data=>{if(data!==latest.current)setSnapshot(data);setMessage('')})
      .catch(error=>setMessage(error instanceof Error?error.message:'공용 자료를 불러오지 못했습니다.'))
      .finally(()=>{busy.current=false;readTask.current=null})
    readTask.current=task
    await task
  }, [])
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    busy.current = true
    readTask.current = loadSnapshot(controller.signal)
      .then(data => { if (active) { setSnapshot(data); setMessage('') } })
      .catch(error => { if (active) setMessage(error instanceof Error ? error.message : '수주대장을 불러오지 못했습니다.') })
      .finally(() => { if (active) { busy.current = false; readTask.current=null } })
    const interval = window.setInterval(() => { if (document.visibilityState === 'visible') void refresh() }, 10000)
    const onFocus = () => { void refresh() }
    window.addEventListener('focus', onFocus)
    return () => { active = false; controller.abort(); window.clearInterval(interval); window.removeEventListener('focus', onFocus) }
  }, [refresh])
  async function startWrite() {
    if(writePending.current)return false
    writePending.current=true
    setSaving(true)
    // Let an in-flight refresh finish, then serialize this save before another poll.
    if(readTask.current)await readTask.current
    busy.current=true
    return true
  }
  async function save(orders: Order[], revision: number | string) {
    if (!await startWrite()) return false
    try {
      const data = await api<OrderSnapshot>('/api/orders', { method: 'PUT', body: JSON.stringify({ orders, revision }) })
      setSnapshot(current => current ? {...current,...data} : null)
      setMessage('수주대장 저장 완료')
      return true
    } catch (error) {
      const text = error instanceof Error ? error.message : '저장하지 못했습니다. 다시 시도해 주세요.'
      setMessage(text)
      if ((error as { status?: number }).status === 409) {
        try { setSnapshot(await loadSnapshot()) } catch { /* Keep the last successfully loaded data. */ }
      }
      window.alert(text)
      return false
    } finally { busy.current = false; writePending.current=false; setSaving(false) }
  }
  async function saveWorkspace(patch: Partial<WorkspaceData>, revision: string, initialize=false) {
    if (!snapshot || !await startWrite()) return false
    try {
      if(snapshot.workspace.mode==='rows' && !initialize){
        // Send only the rows this save adds, changes or removes.
        const ops=workspaceOps(snapshot.workspace.data,patch)
        if(hasOps(ops)){
          const saved=await api<{revision:string}>('/api/workspace',{method:'PUT',body:JSON.stringify({ops,revision})})
          setSnapshot(current=>current?{...current,workspace:{...current.workspace,data:{...current.workspace.data,...patch},revision:saved.revision}}:null)
        }
      } else {
        const workspace=await api<WorkspaceSnapshot>('/api/workspace',{method:'PUT',body:JSON.stringify({data:{...snapshot.workspace.data,...patch},revision,initialize})})
        setSnapshot(current=>current?{...current,workspace}:null)
      }
      setMessage('공용 자료 저장 완료')
      return true
    }catch(error){
      const message=error instanceof Error?error.message:'저장하지 못했습니다.'
      setMessage(message);window.alert(message)
      if((error as {status?:number}).status===409){try{setSnapshot(await loadSnapshot())}catch{/* Preserve the last snapshot. */}}
      return false
    }finally{busy.current=false;writePending.current=false;setSaving(false)}
  }
  async function importBrowser(initialize=false) {
    if(!snapshot)return
    try {
      const local=browserWorkspace(snapshot.orders)
      const result=initialize?{data:local,added:local.expenses.length+local.workLogs.length+local.deliveries.length,conflicts:0}:mergeBrowserWorkspace(snapshot.workspace.data,local)
      if(!initialize && !result.added){window.alert(`추가할 브라우저 자료가 없습니다.${result.conflicts?' 공용 자료와 다른 기존 항목은 덮어쓰지 않았습니다.':''}`);return}
      if(!initialize && !window.confirm(`기존 브라우저 자료 ${result.added}건을 직원들과 공유할까요? 공용 자료와 다른 ${result.conflicts}건은 덮어쓰지 않습니다.`))return
      await saveWorkspace(result.data,snapshot.workspace.revision,initialize)
    }catch(error){window.alert(error instanceof Error?error.message:'브라우저 자료를 읽지 못했습니다.')}
  }
  return <>
    <div className="shared-workspace-bar">
      <div className="shared-workspace-identity"><strong>공용 자료 연결됨</strong><span>{user.name}</span></div>
      <div className="shared-workspace-buttons">
        <details className="shared-workspace-management">
          <summary>관리</summary>
          <div className="shared-workspace-menu">
            <strong>{user.name}</strong><small>{user.email}</small>
            {canManageUsers && <button type="button" className="ghost-button" onClick={event => { (event.currentTarget.closest('details') as HTMLDetailsElement | null)?.removeAttribute('open'); setManagingUsers(true) }}>직원 계정 관리</button>}
            {canInitialize && snapshot?.workspace.initialized && <button type="button" className="ghost-button" disabled={saving} onClick={()=>void importBrowser()}>기존 브라우저 자료 추가</button>}
          </div>
        </details>
        <button type="button" className="ghost-button" disabled={saving} onClick={() => void refresh()}>최신 상태 확인</button>
        <button type="button" className="ghost-button" disabled={saving} onClick={() => { setSignOutError(''); void onSignOut().catch(() => setSignOutError('로그아웃에 실패했습니다. 다시 시도해 주세요.')) }}>로그아웃</button>
      </div>
    </div>
    {outdated && <div className="shared-workspace-outdated" role="alert"><span>프로그램이 새 버전으로 바뀌었습니다. 저장하기 전에 새로고침해 주세요.</span><button type="button" className="primary-button" onClick={() => window.location.reload()}>새로고침</button></div>}
    {managingUsers && <UserManager me={user.email} onClose={() => setManagingUsers(false)} />}
    {(message || signOutError) && <p className="shared-workspace-message" role="status">{signOutError || message}</p>}
    {!snapshot ? <div className="workspace-login"><p>{message || '공유 수주대장을 불러오는 중입니다.'}</p><button className="ghost-button" onClick={() => void refresh()}>다시 불러오기</button></div>
      : !snapshot.workspace.initialized ? <div className="workspace-login"><section className="workspace-login-card"><h2>전체 업무 공유 연결</h2><p>기존 수주대장과 함께 지출·작업일보·납품실적·거래처를 공용으로 연결합니다. 이 브라우저의 원본은 보존됩니다.</p>{canInitialize ? <button type="button" className="primary-button" disabled={saving} onClick={()=>void importBrowser(true)}>기존 자료를 공용으로 연결</button> : <p>관리자가 기존 자료를 연결할 때까지 기다려 주세요.</p>}</section></div>
      : <><div inert={saving || undefined}><App orderStore={{ orders:snapshot.orders,revision:snapshot.revision,save }} workspaceStore={{...snapshot.workspace,save:saveWorkspace}} /></div>{saving && <div className="workspace-saving" role="status">공용 자료 저장 중…</div>}</>}
  </>
}

export default function SharedWorkspace() {
  const [session, setSession] = useState<Session | null>(null)
  const [error, setError] = useState('')
  const [signingIn, setSigningIn] = useState(false)
  const loadSession = useCallback(async () => {
    try { setSession(await api<Session>('/api/session')); setError('') }
    catch (failure) { setError(failure instanceof Error ? failure.message : '로그인 설정을 확인하세요.') }
  }, [])
  useEffect(() => {
    let active = true
    const controller = new AbortController()
    void api<Session>('/api/session', { signal: controller.signal })
      .then(data => { if (active) { setSession(data); setError('') } })
      .catch(failure => { if (active) setError(failure instanceof Error ? failure.message : '로그인 설정을 확인하세요.') })
    return () => { active = false; controller.abort() }
  }, [])
  const onCredential = useCallback(async (credential: string) => {
    setSigningIn(true)
    setError('')
    try { setSession(await api<Session>('/api/session', { method: 'POST', body: JSON.stringify({ credential }) })) }
    catch (failure) {
      setError(failure instanceof Error ? failure.message : '로그인하지 못했습니다.')
      try { setSession(await api<Session>('/api/session')) } catch { /* Show the sign-in error. */ }
    } finally { setSigningIn(false) }
  }, [])
  async function signOut() {
    await api('/api/session', { method: 'DELETE' })
    window.google?.accounts.id.disableAutoSelect()
    setSession(null)
    await loadSession()
  }
  if (session?.user) return <SignedInWorkspace key={session.user.sub} user={session.user} canInitialize={session.canInitialize===true} canManageUsers={session.canManageUsers===true} onSignOut={signOut} />
  return <main className="workspace-login"><section className="workspace-login-card">
    <span className="workspace-login-brand">CHANGJO ENGINEERING</span>
    <h1>창조이엔지 공사 관리</h1>
    <p>허용된 직원 Google 계정으로 로그인해 주세요.</p>
    {error && <p role="alert">{error}</p>}
    {signingIn ? <p role="status">로그인 확인 중입니다.</p> : session?.clientId && session.nonce ? <GoogleButton clientId={session.clientId} nonce={session.nonce} onCredential={onCredential} /> : <button type="button" className="ghost-button" onClick={() => void loadSession()}>로그인 연결 확인</button>}
  </section></main>
}
