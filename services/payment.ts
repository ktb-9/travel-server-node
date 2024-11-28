import { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { Payment, PaymentData } from "../types/payment";

class PaymentService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  public async getGroupMembersByTripId(
    userId: number,
    tripId: number
  ): Promise<
    Array<{
      user_id: number;
      nickname: string;
      profile_image: string | null;
      isMe: boolean;
    }>
  > {
    try {
      const [members] = await this.db.query<RowDataPacket[]>(
        `
        SELECT 
          u.user_id, 
          u.nickname,
          u.profileImage as profile_image
        FROM 
          trip_tb t
        JOIN 
          group_member_tb gm ON t.group_id = gm.group_id
        JOIN 
          user_tb u ON gm.user_id = u.user_id
        WHERE 
          t.trip_id = ?
        `,
        [tripId]
      );

      return members.map((member) => ({
        user_id: member.user_id,
        nickname: member.nickname,
        profile_image: member.profile_image,
        isMe: member.user_id === userId,
      }));
    } catch (error: any) {
      console.error("여행 ID로 결제를 위한 그룹 멤버 조회 오류", error);
      throw new Error(
        `여행 ID로 결제를 위한 그룹 멤버 조회 실패: ${error.message}`
      );
    }
  }

  public async savePayments(payments: PaymentData[]): Promise<void> {
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();
      for (const payment of payments) {
        const [paymentResult] = await connection.query<ResultSetHeader>(
          `INSERT INTO payment_tb 
            (trip_id, category, description, total_price, paid_by) 
           VALUES (?, ?, ?, ?, ?)`,
          [
            payment.tripId,
            payment.category,
            payment.description,
            payment.price,
            payment.pay,
          ]
        );
        const paymentId = paymentResult.insertId;

        // 그룹이 있으면 그룹 멤버들에게 분배
        if (payment.group.length > 0) {
          const shareInserts = payment.group.map((memberId) =>
            connection.query(
              `INSERT INTO payment_share_tb 
                (payment_id, user_id, is_paid) 
               VALUES (?, ?, ?)`,
              [paymentId, memberId, memberId === payment.pay]
            )
          );
          await Promise.all(shareInserts);
        }
        // 그룹이 없으면 개인 지출이므로 아무 작업도 하지 않음
      }
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      console.error("Payment save error:", error);
      throw new Error(`결제 저장 실패: ${error}`);
    } finally {
      connection.release();
    }
  }
  public async getPaymentsByTripId(tripId: number): Promise<Payment[]> {
    try {
      const [payments] = await this.db.query<RowDataPacket[]>(
        `
        SELECT 
          p.payment_id,
          p.trip_id,
          p.category,
          p.description,
          p.total_price as price,
          p.paid_by as pay,
          COALESCE(
            (
              SELECT JSON_ARRAYAGG(
                JSON_OBJECT(
                  'user_id', ps.user_id, 
                  'nickname', u.nickname
                )
              ) 
              FROM payment_share_tb ps 
              JOIN user_tb u ON ps.user_id = u.user_id
              WHERE ps.payment_id = p.payment_id
            ), 
            JSON_ARRAY()
          ) as group_members
        FROM 
          payment_tb p
        WHERE 
          p.trip_id = ?
        `,
        [tripId]
      );

      return payments.map((payment) => ({
        paymentId: payment.payment_id,
        tripId: payment.trip_id,
        category: payment.category,
        description: payment.description,
        price: parseInt(payment.price),
        pay: payment.pay,
        date: payment.date,
        group: payment.group_members
          ? (typeof payment.group_members === "string"
              ? JSON.parse(payment.group_members)
              : payment.group_members
            ).filter(
              (member: { user_id: number; nickname: string }) =>
                member.user_id !== null
            )
          : [],
      }));
    } catch (error: any) {
      console.error("여행 ID로 결제 내역 조회 오류", error);
      throw new Error(`여행 ID로 결제 내역 조회 실패: ${error.message}`);
    }
  }

  public async updatePayments(
    payments: Array<{
      paymentId: number;
      category?: string;
      description?: string;
      price?: number;
      pay?: number;
      date: string;
      group?: Array<{ user_id: number; nickname: string }>;
    }>
  ): Promise<void> {
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();

      for (const payment of payments) {
        await connection.query(
          `UPDATE payment_tb 
           SET 
             category = COALESCE(?, category),
             description = COALESCE(?, description),
             total_price = COALESCE(?, total_price),
             paid_by = COALESCE(?, paid_by),
             date = COALESCE(?, date)
           WHERE payment_id = ?`,
          [
            payment.category,
            payment.description,
            payment.price,
            payment.pay,
            payment.date,
            payment.paymentId,
          ]
        );

        // If group is provided, update payment shares
        if (payment.group && payment.group.length > 0) {
          // First, delete existing payment shares
          await connection.query(
            `DELETE FROM payment_share_tb WHERE payment_id = ?`,
            [payment.paymentId]
          );

          // Then insert new payment shares
          const shareInserts = payment.group.map((member) =>
            connection.query(
              `INSERT INTO payment_share_tb 
                (payment_id, user_id, is_paid) 
               VALUES (?, ?, ?)`,
              [
                payment.paymentId,
                member.user_id,
                member.user_id === payment.pay,
              ]
            )
          );
          await Promise.all(shareInserts);
        }
      }

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      console.error("Payments update error:", error);
      throw new Error(`결제들 업데이트 실패: ${error}`);
    } finally {
      connection.release();
    }
  }
}

export default PaymentService;
