import { Pool, RowDataPacket } from "mysql2/promise";

interface DeadlockConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

class DeleteService {
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
        const deadlockErrorCodes = ["ER_LOCK_DEADLOCK", "ER_LOCK_WAIT_TIMEOUT"];

        if (deadlockErrorCodes.includes(error.code)) {
          retries++;
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

  public async leaveGroupByTripId(
    tripId: number,
    userId: number
  ): Promise<void> {
    return this.executeWithRetry(async () => {
      const connection = await this.db.getConnection();
      try {
        await connection.beginTransaction();

        // 1. trip_id로 group_id 조회
        const [tripInfo] = await connection.query<RowDataPacket[]>(
          "SELECT group_id FROM trip_tb WHERE trip_id = ? FOR UPDATE",
          [tripId]
        );

        if (tripInfo.length === 0) {
          throw new Error("존재하지 않는 여행입니다.");
        }

        const groupId = tripInfo[0].group_id;

        // 2. 사용자가 해당 그룹의 멤버인지 확인
        const [memberCheck] = await connection.query<RowDataPacket[]>(
          "SELECT COUNT(*) as count FROM group_member_tb WHERE group_id = ? AND user_id = ?",
          [groupId, userId]
        );

        if (memberCheck[0].count === 0) {
          throw new Error("해당 그룹의 멤버가 아닙니다.");
        }

        // 3. 그룹의 총 멤버 수 확인
        const [memberCount] = await connection.query<RowDataPacket[]>(
          "SELECT COUNT(*) as count FROM group_member_tb WHERE group_id = ?",
          [groupId]
        );

        // 4. 마지막 멤버인 경우 그룹 전체 삭제
        if (memberCount[0].count === 1) {
          // 결제 공유 데이터 삭제
          await connection.query(
            "DELETE FROM payment_share_tb WHERE payment_id IN (SELECT payment_id FROM payment_tb WHERE trip_id = ?)",
            [tripId]
          );

          // 결제 데이터 삭제
          await connection.query("DELETE FROM payment_tb WHERE trip_id = ?", [
            tripId,
          ]);

          // 여행 위치 데이터 삭제
          await connection.query(
            "DELETE FROM trip_location_tb WHERE trip_id = ?",
            [tripId]
          );

          // 여행 데이터 삭제
          await connection.query("DELETE FROM trip_tb WHERE group_id = ?", [
            groupId,
          ]);

          // 그룹 관련 데이터 삭제
          await connection.query(
            "DELETE FROM group_invite_tb WHERE group_id = ?",
            [groupId]
          );
          await connection.query(
            "DELETE FROM group_background_tb WHERE group_id = ?",
            [groupId]
          );
          await connection.query(
            "DELETE FROM group_calendar_tb WHERE group_id = ?",
            [groupId]
          );
          await connection.query(
            "DELETE FROM group_member_tb WHERE group_id = ?",
            [groupId]
          );
          await connection.query("DELETE FROM group_tb WHERE group_id = ?", [
            groupId,
          ]);
        } else {
          // 5. 마지막 멤버가 아닌 경우, 해당 사용자의 데이터만 삭제
          await connection.query(
            "DELETE FROM group_member_tb WHERE group_id = ? AND user_id = ?",
            [groupId, userId]
          );
        }

        await connection.commit();
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    });
  }
}

export default DeleteService;
