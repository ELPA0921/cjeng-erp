import ModalClose from './ModalClose'
import type { PostingSource } from './cardAccounting'

const money = (value: number) => value.toLocaleString('ko-KR')

/** 분할회계반영 for a tax invoice starts here: match it against expenses already entered, or split it anew. */
export default function SplitChoiceModal({ row, onMatch, onSplit, onClose }: {
  row: PostingSource
  onMatch: () => void
  onSplit: () => void
  onClose: () => void
}) {
  return <div className="modal-backdrop card-order-picker-backdrop" role="presentation">
    <section className="modal-panel small-modal split-choice-modal" role="dialog" aria-modal="true" aria-labelledby="split-choice-title">
      <div className="modal-heading">
        <div><h3 id="split-choice-title">분할회계반영</h3>
          <span>{row.date} {row.vendor} · 합계 {money(row.amount)}원 (공급가액 {money(row.supplyAmount ?? 0)}원)</span></div>
        <ModalClose onClose={onClose} />
      </div>
      <div className="split-choice-options">
        <button type="button" onClick={onMatch}>
          <strong>등록된 지출과 대조</strong>
          <span>한 달치를 모아 발행한 세금계산서처럼, 이미 지출내역에 하나씩 등록해 둔 건들과 금액을 맞춰 봅니다. 금액이 맞으면 그 지출들을 이 세금계산서로 반영합니다.</span>
        </button>
        <button type="button" onClick={onSplit}>
          <strong>새로 나눠서 반영</strong>
          <span>공급가액을 수주별로 직접 나눠, 나눈 만큼 지출을 새로 등록합니다.</span>
        </button>
      </div>
    </section>
  </div>
}
