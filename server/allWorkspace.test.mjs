import {test} from 'node:test'
import assert from 'node:assert/strict'
import {validateWorkspace} from './workspaceValidation.ts'
import {createWorkspaceHandler} from '../api/workspace.ts'
import {sameOrigin} from './security.ts'
const origin='https://workspace.example.test'
const empty=()=>({expenses:[],workLogs:[],purchases:[],inactiveVendorKeys:[],deletedVendorKeys:[],vendorEdits:{},customVendorContacts:{purchase:[],order:[]},deliveries:[],cardAccounting:[],estimateItems:[],estimates:[],materialQuotes:[],researchProjects:[],estimateSettings:{}})
const data=()=>({...empty(),expenses:[{id:'e',projectId:'p',date:'2026-10-22',kind:'법인카드',vendor:'거래처',memo:'',amount:1100,supplyAmount:1000,vatAmount:100}],workLogs:[{id:'w',projectId:'p',date:'2026-10-22',worker:'직원',workerType:'직원',startTime:'07:30',endTime:'16:30',location:'',task:'작업',note:'',hours:8,overtimeHours:0}]})
const req=(body,method='PUT')=>({method,headers:{origin,'content-type':'application/json'},body})
const res=()=>({statusCode:200,setHeader(){},end(value){this.body=JSON.parse(value)}})
test('all-menu validation preserves amounts, empty notes and dates; rejects corrupt data and duplicate IDs',()=>{
  assert.deepEqual(validateWorkspace(data()),data())
  const broken=data();broken.expenses[0].amount=Infinity
  assert.throws(()=>validateWorkspace(broken),/숫자/)
  const invalid=data();invalid.workLogs[0].date='2026-02-30'
  assert.throws(()=>validateWorkspace(invalid),/날짜/)
  const duplicate=data();duplicate.expenses.push({...duplicate.expenses[0]})
  assert.throws(()=>validateWorkspace(duplicate),/중복/)
})
test('all-menu API denies outsiders and cross-origin writes, restricts initialization, and reports conflict/failure',async()=>{
  let user=null,calls=0,conflict=false,fail=false
  const deps={readSession:async()=>user,sameOrigin,settings:()=>({origin,allowed:new Set(['admin@example.test','staff@example.test'])}),workspaceSheetsRequest:async()=>{calls++;if(fail)throw new Error('offline');return conflict?null:{data:data(),revision:'a'.repeat(64),initialized:true}}}
  const handler=createWorkspaceHandler(deps)
  let response=res();await handler(req({},'GET'),response);assert.equal(response.statusCode,401)
  user={email:'staff@example.test'}
  response=res();await handler({...req({data:data(),revision:'a'.repeat(64)}),headers:{origin:'https://evil.example','content-type':'application/json'}},response);assert.equal(response.statusCode,403)
  response=res();await handler(req({data:data(),revision:'a'.repeat(64),initialize:true}),response);assert.equal(response.statusCode,403);assert.equal(calls,0)
  response=res();await handler(req({data:data(),revision:'a'.repeat(64)}),response);assert.equal(response.statusCode,200)
  conflict=true;response=res();await handler(req({data:data(),revision:'a'.repeat(64)}),response);assert.equal(response.statusCode,409)
  fail=true;response=res();await handler(req({data:data(),revision:'a'.repeat(64)}),response);assert.equal(response.statusCode,503)
})

test('card accounting defaults for older snapshots and rejects unknown statuses',()=>{
  const {cardAccounting,...legacy}=empty()
  assert.deepEqual(cardAccounting,[])
  assert.deepEqual(validateWorkspace(legacy).cardAccounting,[])
  const posted={id:'a',status:'회계반영',orderNo:'26006',memo:'',expenseId:'card-a',updatedAt:'2026-10-23T00:00:00.000Z'}
  const forced={id:'b',status:'강제회계반영',orderNo:'',memo:'',updatedAt:'2026-10-23T00:00:00.000Z'}
  assert.deepEqual(validateWorkspace({...empty(),cardAccounting:[posted,forced]}).cardAccounting,[posted,forced])
  assert.throws(()=>validateWorkspace({...empty(),cardAccounting:[{...forced,status:'반영'}]}),/회계반영 상태/)
  assert.throws(()=>validateWorkspace({...empty(),cardAccounting:[forced,forced]}),/중복/)
})

test('연구비 numbers must be 269NN-style, named and used once', () => {
  const ok = validateWorkspace({ ...empty(), researchProjects: [{ id: 'research-a', orderNo: '26901', name: '필터 테스트' }] })
  assert.deepEqual(ok.researchProjects, [{ id: 'research-a', orderNo: '26901', name: '필터 테스트' }])
  for (const bad of [[{ id: 'r1', orderNo: '26035', name: 'x' }], [{ id: 'r1', orderNo: '26900', name: 'x' }], [{ id: 'r1', orderNo: '26901', name: ' ' }],
    [{ id: 'r1', orderNo: '26901', name: 'a' }, { id: 'r2', orderNo: '26901', name: 'b' }]])
    assert.throws(() => validateWorkspace({ ...empty(), researchProjects: bad }))
})
