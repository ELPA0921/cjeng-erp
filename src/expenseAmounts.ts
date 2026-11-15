import type { Expense } from './workspaceTypes.ts'

// Older expenses kept only 합계; their 공급가액 is read back as 합계 ÷ 1.1.
export function getExpenseSupplyAmount(expense: Pick<Expense, 'amount' | 'supplyAmount'>) {
  return expense.supplyAmount ?? Math.round(expense.amount / 1.1)
}

export function getExpenseVatAmount(expense: Pick<Expense, 'amount' | 'supplyAmount' | 'vatAmount'>) {
  return expense.vatAmount ?? expense.amount - getExpenseSupplyAmount(expense)
}
