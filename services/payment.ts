import { Pool, ResultSetHeader, RowDataPacket } from "mysql2/promise";
import { Payment, PaymentData } from "../types/payment";

interface DeadlockConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

class PaymentService {
  private db: Pool;
  private deadlockConfig: DeadlockConfig;

  constructor(
    db: Pool,
    deadlockConfig: DeadlockConfig = {
      maxRetries: 3,
      baseDelay: 50,
      maxDelay: 500,
    }
  ) {
    this.db = db;
    this.deadlockConfig = deadlockConfig;
  }

  // 공통 데드락 재시도 로직
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    config: DeadlockConfig = this.deadlockConfig
  ): Promise<T> {
    const { maxRetries, baseDelay, maxDelay } = config;
    let retries = 0;

    while (retries < maxRetries) {
      try {
        return await operation();
      } catch (error: any) {
        // MySQL 데드락 및 잠금 대기 시간 초과 에러 코드
        const deadlockErrorCodes = ["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"];

        if (deadlockErrorCodes.includes(error.code)) {
          retries++;

          // 지수 백오프 알고리즘
          const delay = Math.min(maxDelay, baseDelay * Math.pow(2, retries));

          console.warn(
            `데드락 감지, 재시도 (${retries}/${maxRetries}): ${error.message}`
          );

          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          throw error;
        }
      }
    }

    throw new Error("데드락 재시도 횟수 초과");
  }

  // 트랜잭션 시작 및 타임아웃 설정 헬퍼 메서드
  private async startTransactionWithTimeout(
    connection: any,
    timeout: number = 5000
  ): Promise<void> {
    // 잠금 대기 시간 타임아웃 설정
    await connection.query(`SET innodb_lock_wait_timeout = ${timeout / 1000}`);
    await connection.beginTransaction();
  }

  // 여행 ID로 그룹 멤버 조회 (기존 로직 유지)
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

  // 결제 저장 (데드락 방지 및 낙관적 락 적용)
  public async savePayments(payments: PaymentData[]): Promise<void> {
    return this.executeWithRetry(async () => {
      const connection = await this.db.getConnection();
      try {
        await this.startTransactionWithTimeout(connection);

        for (const payment of payments) {
          // 여행 존재 확인 및 락
          const [tripCheck] = await connection.query<RowDataPacket[]>(
            "SELECT trip_id FROM trip_tb WHERE trip_id = ? FOR UPDATE",
            [payment.tripId]
          );

          if (tripCheck.length === 0) {
            throw new Error("존재하지 않는 여행입니다.");
          }

          // 결제 저장
          const [paymentResult] = await connection.query<ResultSetHeader>(
            `INSERT INTO payment_tb 
              (trip_id, category, description, total_price, date, paid_by, version) 
             VALUES (?, ?, ?, ?, ?,?, 1)`,
            [
              payment.tripId,
              payment.category,
              payment.description,
              payment.price,
              payment.date,
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
        }
        await connection.commit();
      } catch (error) {
        await connection.rollback();
        console.error("Payment save error:", error);
        throw new Error(`결제 저장 실패: ${error}`);
      } finally {
        connection.release();
      }
    });
  }

  // 결제 업데이트 (데드락 방지 및 낙관적 락 적용)
  public async updatePayments(
    payments: Array<{
      paymentId: number;
      category?: string;
      description?: string;
      price?: number;
      pay?: number;
      date: string;
      expectedVersion?: number;
      group?: Array<{ user_id: number; nickname: string }>;
    }>
  ): Promise<void> {
    return this.executeWithRetry(async () => {
      const connection = await this.db.getConnection();
      try {
        await this.startTransactionWithTimeout(connection);

        for (const payment of payments) {
          // 결제 존재 및 버전 확인
          let versionCheckQuery = `
            SELECT payment_id 
            FROM payment_tb 
            WHERE payment_id = ? FOR UPDATE
          `;
          let versionCheckParams: any[] = [payment.paymentId];

          if (payment.expectedVersion !== undefined) {
            versionCheckQuery += ` AND version = ?`;
            versionCheckParams.push(payment.expectedVersion);
          }

          const [paymentCheck] = await connection.query<RowDataPacket[]>(
            versionCheckQuery,
            versionCheckParams
          );

          if (paymentCheck.length === 0) {
            throw new Error(
              "결제 정보가 존재하지 않거나 버전이 일치하지 않습니다"
            );
          }

          // 결제 정보 업데이트
          await connection.query(
            `UPDATE payment_tb 
             SET 
               category = COALESCE(?, category),
               description = COALESCE(?, description),
               total_price = COALESCE(?, total_price),
               paid_by = COALESCE(?, paid_by),
               date = COALESCE(?, date),
               version = version + 1
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

          // 결제 공유 멤버 업데이트
          if (payment.group && payment.group.length > 0) {
            await connection.query(
              `DELETE FROM payment_share_tb WHERE payment_id = ?`,
              [payment.paymentId]
            );

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
    });
  }

  // 결제 삭제 (데드락 방지 적용)
  public async deletePayment(paymentId: number): Promise<void> {
    return this.executeWithRetry(async () => {
      const connection = await this.db.getConnection();
      try {
        await this.startTransactionWithTimeout(connection);

        // 1. 결제 존재 확인 및 락
        const [paymentCheck] = await connection.query<RowDataPacket[]>(
          "SELECT payment_id FROM payment_tb WHERE payment_id = ? FOR UPDATE",
          [paymentId]
        );

        if (paymentCheck.length === 0) {
          throw new Error("존재하지 않는 결제입니다.");
        }

        // 2. payment_share 테이블에서 해당 결제 관련 항목 모두 삭제
        await connection.query(
          `DELETE FROM payment_share_tb WHERE payment_id = ?`,
          [paymentId]
        );

        // 3. payment 테이블에서 해당 결제 삭제
        await connection.query(`DELETE FROM payment_tb WHERE payment_id = ?`, [
          paymentId,
        ]);

        await connection.commit();
      } catch (error) {
        await connection.rollback();
        console.error("결제 삭제 중 오류:", error);
        throw error;
      } finally {
        connection.release();
      }
    });
  }

  // 기존 결제 내역 조회 메서드는 변경 없음
  public async getPaymentsByTripId(
    tripId: number,
    userId: number
  ): Promise<Payment[]> {
    try {
      const [payments] = await this.db.query<RowDataPacket[]>(
        `
        SELECT 
          p.payment_id,
          p.trip_id,
          p.date,
          p.category,
          p.description,
          p.total_price as price,
          p.paid_by as pay,
          CASE 
            WHEN p.paid_by = ? THEN 'personal'
            ELSE 'group'
          END as payment_type,
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
        LEFT JOIN payment_share_tb ps ON p.payment_id = ps.payment_id
        WHERE 
          p.trip_id = ? AND 
          (p.paid_by = ? OR ps.user_id = ?)
        GROUP BY 
          p.payment_id
        `,
        [userId, tripId, userId, userId]
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
}

export default PaymentService;
