import test from 'node:test'
import assert from 'node:assert/strict'
import { freightOf, guessFreight, isFreightSetting } from './freightRules.ts'

const e = (vendor, memo, freight) => ({ vendor, memo, ...(freight ? { freight } : {}) })

test('crane and forklift rentals are guessed from the vendor or the memo', () => {
  assert.equal(guessFreight(e('(주)동일크레인', '장비사용료')), '크레인')
  assert.equal(guessFreight(e('대한카고크레인', '금곡동 활성탄 작업 크레인 비용')), '크레인')
  assert.equal(guessFreight(e('（주）매일중기', '활성탄 하차')), '지게차')
  assert.equal(guessFreight(e('진기건설기계', '지게차')), '지게차')
  // A 화물 company renting out a forklift is equipment, not freight.
  assert.equal(guessFreight(e('（유）부안화물', '장비대(지게차)')), '지게차')
})

test('trucks are 운반비, while parcel services are left out', () => {
  assert.equal(guessFreight(e('개별화물', '운반비(공장->영광)')), '화물차')
  assert.equal(guessFreight(e('무림통운', '김포 -> 부안')), '화물차')
  assert.equal(guessFreight(e('양일상운', '운반비')), '화물차')
  assert.equal(guessFreight(e('한국통운물류', '운송비')), '화물차')
  assert.equal(guessFreight(e('함안 대신화물', '산기관 택배비')), null)
  assert.equal(guessFreight(e('대신정기화물（주）', '핸드레일빠찌')), null)
  assert.equal(guessFreight(e('양촌 경동화물', '고압선')), null)
  assert.equal(guessFreight(e('우정사업본부(우체국)', '명함 택배')), null)
})

test('other expenses are left out, and quick couplings are not 퀵서비스', () => {
  assert.equal(guessFreight(e('대성철물', '앵커볼트')), null)
  assert.equal(guessFreight(e('유압상사', '퀵커플링')), null)
  assert.equal(guessFreight(e('신진렌탈', '고소작업대 임대')), null)
})

test('a category picked by hand wins over the guess, and 제외 keeps it off the list', () => {
  assert.equal(freightOf(e('신진렌탈', '고소작업대 임대', '크레인')), '크레인')
  assert.equal(freightOf(e('다이소', '화물차 와이어부러쉬', '제외')), null)
  assert.equal(freightOf(e('다이소', '화물차 와이어부러쉬')), '화물차')
  assert.equal(isFreightSetting('택배'), false)
})
