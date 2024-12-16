import { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";

interface TripHistory {
  groupId: number;
  groupName: string;
  date: string;
  backgroundUrl: string | null;
}

class HistoryService {
  private db: Pool;
  constructor(db: Pool) {
    this.db = db;
  }

  public async getHistory(userId: number): Promise<TripHistory[]> {
    try {
      const [histories] = await this.db.query<RowDataPacket[]>(
        `
        SELECT 
          g.group_id,
          g.name as group_name,
          t.date,
          t.trip_id,
          gb.background_url
        FROM group_tb g
        JOIN group_member_tb gm ON g.group_id = gm.group_id
        JOIN trip_tb t ON g.group_id = t.group_id
        LEFT JOIN group_background_tb gb ON g.group_id = gb.group_id
        WHERE 
          gm.user_id = ? 
          AND g.finish = true
        ORDER BY t.date DESC
        `,
        [userId]
      );

      return histories.map((history) => ({
        groupId: history.group_id,
        groupName: history.group_name,
        date: history.date,
        backgroundUrl: history.background_url,
        tripId: history.trip_id,
      }));
    } catch (error) {
      console.error("여행 히스토리 조회 중 오류:", error);
      throw new Error("여행 히스토리 조회에 실패했습니다.");
    }
  }
}

export default HistoryService;
