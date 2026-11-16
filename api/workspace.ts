import type { IncomingMessage, ServerResponse } from 'node:http'
import { readSession, sameOrigin, settings } from '../server/security.ts'
import { workspaceSheetsRequest } from '../server/googleSheets.ts'
import { validateWorkspace } from '../server/workspaceValidation.ts'
import { applyWorkspaceOps, readWorkspaceRevision, readWorkspaceRows, replaceOps, validateOps, workspaceSql } from '../server/workspaceDb.ts'
import { outdatedClient, outdatedMessage, serverBuild } from '../server/appBuild.ts'

// Google Sheets revisions are content hashes; the database revision is a counter sent as text.
const workspaceRevision = (value: unknown) => typeof value === 'string' && (/^[a-f0-9]{64}$/.test(value) || /^\d{1,15}$/.test(value)) ? value : null
const rowStore = { sql: () => workspaceSql(settings().databaseUrl), readWorkspaceRevision, readWorkspaceRows, applyWorkspaceOps }

export function createWorkspaceHandler(deps={readSession,sameOrigin,settings,workspaceSheetsRequest,rowStore}) {
return async function handler(req: IncomingMessage & {body?: unknown},res: ServerResponse) {
  res.setHeader('Cache-Control','private, no-store')
  res.setHeader('Content-Type','application/json; charset=utf-8')
  res.setHeader('X-Content-Type-Options','nosniff')
  // Polling reads this to tell an open screen that a newer version is out.
  res.setHeader('X-App-Build',serverBuild())
  try {
    const user=await deps.readSession(req)
    if (!user) {res.statusCode=401;res.end(JSON.stringify({error:'직원 계정으로 로그인해 주세요.'}));return}
    const rows=deps.settings().storage==='postgres'
    if(req.method==='GET'){
      if(!rows){res.end(JSON.stringify(await deps.workspaceSheetsRequest('workspace-read')));return}
      const sql=deps.rowStore.sql()
      // Polling sends the revision it already has; answer without the data when nothing changed.
      const known=new URL(req.url ?? '/', 'http://local').searchParams.get('revision')
      if(known && known===await deps.rowStore.readWorkspaceRevision(sql)){res.end(JSON.stringify({unchanged:true,revision:known}));return}
      res.end(JSON.stringify({...await deps.rowStore.readWorkspaceRows(sql),mode:'rows'}));return
    }
    if(req.method!=='PUT'){res.statusCode=405;res.setHeader('Allow','GET, PUT');res.end('{}');return}
    if(!deps.sameOrigin(req,deps.settings().origin)){res.statusCode=403;res.end(JSON.stringify({error:'접속 주소를 확인하세요.'}));return}
    if(outdatedClient(req)){res.statusCode=409;res.end(JSON.stringify({error:outdatedMessage,outdated:true}));return}
    let input
    try {
      if(Number(req.headers['content-length'])>4000000)throw new Error('자료가 너무 큽니다.')
      const body=typeof req.body==='string'?JSON.parse(req.body):req.body as {data?:unknown;ops?:unknown;revision?:unknown;initialize?:unknown}
      const revision=workspaceRevision(body?.revision)
      if(!revision)throw new Error('자료를 다시 불러오세요.')
      // The database takes just the changed rows; a whole workspace is still accepted (first connection, older open tabs).
      input=rows && body?.ops!==undefined ? {ops:validateOps(body.ops),revision,initialize:false} : {data:validateWorkspace(body?.data),revision,initialize:body?.initialize===true}
    }catch(error){res.statusCode=400;res.end(JSON.stringify({error:error instanceof Error?error.message:'입력값을 확인하세요.'}));return}
    if(input.initialize && user.email!==deps.settings().allowed.values().next().value){res.statusCode=403;res.end(JSON.stringify({error:'관리자가 기존 자료를 연결할 때까지 기다려 주세요.'}));return}
    const conflict=()=>{res.statusCode=409;res.end(JSON.stringify({error:'다른 직원이 먼저 자료를 수정했습니다. 입력 내용을 복사해 두고 창을 닫은 뒤 다시 열어주세요.'}))}
    if(rows){
      const sql=deps.rowStore.sql()
      const revision='ops' in input ? await deps.rowStore.applyWorkspaceOps(sql,input.ops,input.revision,user.email) : await deps.rowStore.applyWorkspaceOps(sql,replaceOps(input.data),input.revision,user.email,{replace:true})
      if(!revision){conflict();return}
      res.end(JSON.stringify('ops' in input ? {revision,mode:'rows'} : {...await deps.rowStore.readWorkspaceRows(sql),mode:'rows'}));return
    }
    const result=await deps.workspaceSheetsRequest('workspace-write',{...input,email:user.email})
    if(!result){conflict();return}
    res.end(JSON.stringify(result))
  }catch{res.statusCode=503;res.end(JSON.stringify({error:'공유 자료에 연결할 수 없습니다. 저장되지 않았습니다.'}))}
}
}
export default createWorkspaceHandler()
