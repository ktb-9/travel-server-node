// types/ExpenseAnalysis.ts

import { RowDataPacket } from "mysql2/promise";

export interface CategoryAnalysis {
  category: string;
  amount: number;
  percentage: number;
  count: number;
  trend: string;
  color: string;
}

export interface MemberExpense {
  memberId: number;
  nickname: string;
  paidAmount: number;
  percentage: number;
}

export interface ExpenseAnalysis {
  totalExpense: number;
  categoryBreakdown: CategoryAnalysis[];
  insights: string[];
  memberExpenses: MemberExpense[];
}

export interface PaymentRow extends RowDataPacket {
  payment_id: number;
  category: string;
  total_price: number;
  paid_by: number;
  date: string;
  nickname: string;
  group_members: string | any[];
}
