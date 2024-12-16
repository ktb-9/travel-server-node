import { Pool, RowDataPacket } from "mysql2/promise";
import {
  CategoryAnalysis,
  ExpenseAnalysis,
  MemberExpense,
  PaymentRow,
} from "../types/ExpenseAnalysis";

class ExpenseAnalysisService {
  private db: Pool;
  private readonly CATEGORY_COLORS: { [key: string]: string } = {
    술: "#FF6B6B",
    카페: "#4ECDC4",
    간식: "#FFB323",
    주스: "#95A5A6",
    식사: "#45B7D1",
    교통: "#96C93D",
    숙박: "#845EC2",
    쇼핑: "#FF9671",
    문화: "#FFC75F",
    기타: "#F9F871",
  };

  constructor(db: Pool) {
    this.db = db;
  }

  public async updateGroupFinish(tripId: number): Promise<void> {
    try {
      // 1. tripId로 groupId 조회
      const [tripResult] = await this.db.query<RowDataPacket[]>(
        `SELECT group_id FROM trip_tb WHERE trip_id = ?`,
        [tripId]
      );

      if (!tripResult || tripResult.length === 0) {
        throw new Error("해당하는 여행을 찾을 수 없습니다.");
      }

      const groupId = tripResult[0].group_id;

      // 2. group_tb의 finish 상태 업데이트
      await this.db.query(
        `UPDATE group_tb SET finish = true WHERE group_id = ?`,
        [groupId]
      );
    } catch (error) {
      console.error("그룹 완료 상태 업데이트 중 오류 발생:", error);
      throw new Error("그룹 완료 상태 업데이트에 실패했습니다.");
    }
  }

  public async analyzeExpenses(tripId: number): Promise<ExpenseAnalysis> {
    try {
      // 1. 결제 내역 조회
      const [payments] = await this.db.query<PaymentRow[]>(
        `
        SELECT 
          p.payment_id,
          p.category,
          p.total_price,
          p.paid_by,
          p.date,
          u.nickname,
          COALESCE(
            (
              SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                  'user_id', ps_sub.user_id, 
                  'nickname', u_sub.nickname
                )
              ) 
              FROM payment_share_tb ps_sub
              JOIN user_tb u_sub ON ps_sub.user_id = u_sub.user_id
              WHERE ps_sub.payment_id = p.payment_id
            ), 
            JSON_ARRAY()
          ) as group_members
        FROM payment_tb p
        JOIN user_tb u ON p.paid_by = u.user_id
        WHERE p.trip_id = ?
        GROUP BY 
          p.payment_id, 
          p.category, 
          p.total_price, 
          p.paid_by,
          p.date,
          u.nickname
        ORDER BY p.date DESC
        `,
        [tripId]
      );

      const categoryMap = new Map<string, CategoryAnalysis>();
      const memberExpenseMap = new Map<
        number,
        {
          nickname: string;
          totalAmount: number;
        }
      >();

      let totalExpense = 0;

      // 2. 각 결제 건별 분석
      payments.forEach((payment) => {
        const fullAmount = Number(payment.total_price);
        let groupMembers = [];

        try {
          groupMembers = payment.group_members
            ? typeof payment.group_members === "string"
              ? JSON.parse(payment.group_members)
              : payment.group_members
            : [];
        } catch (e) {
          console.error("JSON parse error:", e);
          groupMembers = [];
        }

        // 실제 부담 금액 계산
        const membersCount = groupMembers.length || 1;
        const actualAmount =
          groupMembers.length > 0
            ? fullAmount / membersCount // n빵인 경우
            : fullAmount; // 개인 지출인 경우

        // 카테고리 분석 업데이트
        const category = payment.category || "기타";
        const existingCategory = categoryMap.get(category);

        if (existingCategory) {
          existingCategory.amount += actualAmount;
          existingCategory.count += 1;
        } else {
          categoryMap.set(category, {
            category,
            amount: actualAmount,
            percentage: 0,
            count: 1,
            trend: this.calculateTrend(payments, category),
            color: this.CATEGORY_COLORS[category] || "#95A5A6",
          });
        }

        // 멤버별 지출 업데이트
        if (groupMembers.length > 0) {
          // n빵인 경우
          groupMembers.forEach(
            (member: { user_id: number; nickname: string }) => {
              const memberData = memberExpenseMap.get(member.user_id) || {
                nickname: member.nickname,
                totalAmount: 0,
              };
              memberData.totalAmount += actualAmount;
              memberExpenseMap.set(member.user_id, memberData);
            }
          );
        } else {
          // 개인 지출인 경우
          const memberData = memberExpenseMap.get(payment.paid_by) || {
            nickname: payment.nickname,
            totalAmount: 0,
          };
          memberData.totalAmount += actualAmount;
          memberExpenseMap.set(payment.paid_by, memberData);
        }

        totalExpense += actualAmount;
      });

      // 3. 카테고리 분석 결과 생성
      const categoryBreakdown = Array.from(categoryMap.values()).map(
        (category) => ({
          ...category,
          amount: Number(category.amount.toFixed(0)),
          percentage: Number(
            ((category.amount / totalExpense) * 100).toFixed(1)
          ),
        })
      );

      // 4. 멤버별 분석 결과 생성
      const memberExpenses = Array.from(memberExpenseMap.entries()).map(
        ([memberId, data]) => ({
          memberId,
          nickname: data.nickname,
          paidAmount: Number(data.totalAmount.toFixed(0)),
          percentage: Number(
            ((data.totalAmount / totalExpense) * 100).toFixed(1)
          ),
        })
      );

      // 5. 인사이트 생성
      const insights = this.generateInsights(
        categoryBreakdown,
        memberExpenses,
        payments,
        totalExpense
      );
      // 분석이 완료되면 그룹 상태 업데이트
      await this.updateGroupFinish(tripId);
      return {
        totalExpense: Number(totalExpense.toFixed(0)),
        categoryBreakdown: categoryBreakdown.sort(
          (a, b) => b.amount - a.amount
        ),
        insights,
        memberExpenses: memberExpenses.sort(
          (a, b) => b.paidAmount - a.paidAmount
        ),
      };
    } catch (error) {
      console.error("지출 분석 중 오류 발생:", error);
      throw new Error(`지출 분석 실패: ${error}`);
    }
  }

  private calculateTrend(payments: PaymentRow[], category: string): string {
    const categoryPayments = payments
      .filter((p) => p.category === category)
      .slice(0, 3)
      .map((p) => Number(p.total_price));

    if (categoryPayments.length < 2) return "유지";

    const recentAvg = categoryPayments[0];
    const previousAvg = categoryPayments[categoryPayments.length - 1];

    if (recentAvg > previousAvg * 1.1) return "증가";
    if (recentAvg < previousAvg * 0.9) return "감소";
    return "유지";
  }

  private generateInsights(
    categories: CategoryAnalysis[],
    memberExpenses: MemberExpense[],
    payments: PaymentRow[],
    totalExpense: number
  ): string[] {
    const insights: string[] = [];

    // 카테고리 분석 인사이트
    if (categories.length > 0) {
      const topCategory = categories[0];
      if (topCategory.percentage > 30) {
        insights.push(
          `${topCategory.category} 카테고리가 전체 지출의 ${topCategory.percentage}%를 차지하고 있어요`
        );
      }
    }

    // 높은 단일 결제 분석
    const paymentsWithAmount = payments.map((p) => {
      const groupMembers =
        typeof p.group_members === "string"
          ? JSON.parse(p.group_members)
          : p.group_members;
      const membersCount = groupMembers.length || 1;
      return {
        ...p,
        actualAmount: Number(p.total_price) / membersCount,
      };
    });

    const highestPayment = paymentsWithAmount.sort(
      (a, b) => b.actualAmount - a.actualAmount
    )[0];

    if (highestPayment && highestPayment.actualAmount > totalExpense * 0.2) {
      insights.push(
        `${highestPayment.category}에서 한 번에 많은 금액을 지출했어요`
      );
    }

    // 소액 다건 분석
    const frequentCategories = categories.filter(
      (c) => c.count > 2 && c.amount / c.count < 10000
    );
    if (frequentCategories.length > 0) {
      insights.push(
        `${frequentCategories[0].category}은 소액으로 자주 구매했네요`
      );
    }

    // 지출 비중 분석
    const topSpender = memberExpenses[0];
    if (topSpender && topSpender.percentage > 40) {
      insights.push(
        `${topSpender.nickname}님의 지출 비중이 가장 높아요 (${topSpender.percentage}%)`
      );
    }

    return insights;
  }
}

export default ExpenseAnalysisService;
