import test from 'node:test'
import assert from 'node:assert/strict'
import { freightOf, guessFreight, guessRoute, isFreightSetting } from './freightRules.ts'

const e = (vendor, memo, freight) => ({ vendor, memo, ...(freight ? { freight } : {}) })

test('crane and forklift rentals are guessed from the vendor or the memo', () => {
  assert.equal(guessFreight(e('(주)동일크레인', '장비사용료')), '크레인')
  assert.equal(guessFreight(e('대한카고크레인', '금곡동 활성탄 작업 크레인 비용')), '크레인')
  assert.equal(guessFreight(e('（주）매일중기', '활성탄 하차')), '지게차')
  assert.equal(guessFreight(e('진기건설기계', '지게차')), '지게차')
  // A 화물 company renting out a forklift is equipment, not freight.
  assert.equal(guessFreight(e('（유）부안화물', '장비대(지게차)')), '지게차')
})

test('고소작업대 and 렌탈 are 고소작업대, but moving one by truck is 운반비', () => {
  assert.equal(guessFreight(e('주식회사 신진렌탈', '고소작업대 임대')), '고소작업대')
  assert.equal(guessFreight(e('백두고소작업대리프트렌탈', '10/10~10/16 용암 세일건업')), '고소작업대')
  assert.equal(guessFreight(e('글로벌스카이연합', '고소작업차 임대비')), '고소작업대')
  assert.equal(guessFreight(e('정읍렌탈', '렌탈 사용료')), '고소작업대')
  assert.equal(guessFreight(e('윤하개별화물', '고소작업대 外 운송비')), '화물차')
})

test('스카이, 사다리차 and 포크레인 are 장비 of their own', () => {
  assert.equal(guessFreight(e('전진스카이', '5t 스카이')), '스카이')
  assert.equal(guessFreight(e('우진스카이', '스카이 사용료')), '스카이')
  assert.equal(guessFreight(e('도원중기', '스카이')), '스카이')
  assert.equal(guessFreight(e('대건스카이', '장비사용료')), '스카이')
  assert.equal(guessFreight(e('신인천스카이', '카고크레인사용료')), '크레인')
  assert.equal(guessFreight(e('스카이물류 홍성애', '운송료')), '화물차')
  assert.equal(guessFreight(e('스카이', '숙박비')), null)
  assert.equal(guessFreight(e('이마트24안산스카이점', '음료수')), null)
  assert.equal(guessFreight(e('김영기화물', '사다리차 사용료')), '사다리차')
  assert.equal(guessFreight(e('우리스카이차크레인', '사다리차 사용료')), '사다리차')
  assert.equal(guessFreight(e('삼현건설기계', '포크레인 사용료')), '포크레인')
  assert.equal(guessFreight(e('대성중기', '굴삭기 임대')), '포크레인')
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
})

test('a category picked by hand wins over the guess, and 제외 keeps it off the list', () => {
  assert.equal(freightOf(e('정읍렌탈', '렌탈 사용료', '고소작업대')), '고소작업대')
  assert.equal(freightOf(e('다이소', '화물차 와이어부러쉬', '제외')), null)
  assert.equal(freightOf(e('다이소', '화물차 와이어부러쉬')), '화물차')
  assert.equal(isFreightSetting('택배'), false)
})

test('출발지 and 목적지 are read from an arrow in the 내용', () => {
  assert.deepEqual(guessRoute('공장 -> 일산실업 화물비'), { from: '공장', to: '일산실업' })
  assert.deepEqual(guessRoute('운반비(공장->영광)'), { from: '공장', to: '영광' })
  assert.deepEqual(guessRoute('대호냉각기 -> 공장 운반비'), { from: '대호냉각기', to: '공장' })
  assert.deepEqual(guessRoute('경기김포양촌읍 -> 경기남양주 화도읍 (오더번호:160642640, 오더일자:20260729)'), { from: '경기김포양촌읍', to: '경기남양주 화도읍' })
  assert.equal(guessRoute('운반비'), null)
  assert.equal(guessRoute('닥트운반(대명-공장)'), null)
})
