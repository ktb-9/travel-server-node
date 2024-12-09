import { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import { CreateGroupDto, GroupDetails, GroupMember } from "../types/group";

class GroupService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  //  실패 케이스 (트랜잭션이 없다면):
  // 1. group_tb INSERT 성공
  // 2. group_member_tb INSERT 실패
  // -> 호스트 없는 그룹이 남게 됨

  //  트랜잭션 사용 시:
  // 1. group_tb INSERT 성공
  // 2. group_member_tb INSERT 실패
  // 3. 전체 롤백 -> 데이터 일관성 유지
  public async createGroup(
    groupData: CreateGroupDto,
    userId: Number
  ): Promise<GroupDetails> {
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();

      // 그룹 생성
      const [groupResult] = await connection.query<ResultSetHeader>(
        "INSERT INTO group_tb (name, host_id) VALUES (?, ?)",
        [groupData.name, userId]
      );
      const groupId = groupResult.insertId;

      // 생성자를 HOST로 멤버 추가
      await connection.query(
        "INSERT INTO group_member_tb (group_id, user_id, role) VALUES (?, ?, 'HOST')",
        [groupId, userId]
      );
      // 생성된 그룹 정보 조회
      const [groups] = await connection.query<RowDataPacket[]>(
        "SELECT group_id, host_id FROM group_tb WHERE group_id = ?",
        [groupId]
      );

      await connection.commit();
      return groups[0] as GroupDetails;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
  public async getGroupDetails(groupId: number): Promise<GroupDetails> {
    const [groups] = await this.db.query<RowDataPacket[]>(
      "SELECT * FROM group_tb WHERE group_id = ?",
      [groupId]
    );

    if (groups.length === 0) {
      throw new Error("존재하지 않는 그룹입니다.");
    }

    return groups[0] as GroupDetails;
  }
  public async updateGroup(
    tripId: number,
    body: {
      group_id: number;
      groupName: string;
      groupThumbnail: string;
      date: string;
    }
  ): Promise<void> {
    const connection = await this.db.getConnection();
    try {
      // 트랜잭션 시작
      await connection.beginTransaction();
      // group_tb 업데이트
      await connection.query(
        "UPDATE group_tb SET name = ?, group_thumbnail = ? WHERE group_id = ?",
        [body.groupName, body.groupThumbnail, body.group_id]
      );

      // trip_tb 업데이트
      await connection.query("UPDATE trip_tb SET date = ? WHERE trip_id = ?", [
        body.date,
        tripId,
      ]);

      // 커밋
      await connection.commit();
    } catch (error) {
      // 롤백
      await connection.rollback();
      throw error; // 상위 호출부로 에러 전달
    } finally {
      // 연결 해제
      connection.release();
    }
  }

  public async createInviteLink(
    groupId: number,
    userId: number
  ): Promise<string> {
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();
      // HOST 권한 확인
      const [members] = await connection.query<RowDataPacket[]>(
        "SELECT role FROM group_member_tb WHERE group_id = ? AND user_id = ?",
        [groupId, userId]
      );
      if (members.length === 0 || members[0].role !== "HOST") {
        throw new Error("초대 권한이 없습니다.");
      }
      // 24시간 유효한 초대 링크 생성
      const expiredDate = new Date();
      expiredDate.setHours(expiredDate.getHours() + 24);

      const [result] = await connection.query<ResultSetHeader>(
        "INSERT INTO group_invite_tb (group_id, created_by, expired_date) VALUES (?, ?, ?)",
        [groupId, userId, expiredDate]
      );

      await connection.commit();

      return `/group/join/${groupId}`;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  public async getGroupMembers(groupId: number): Promise<GroupMember[]> {
    const [members] = await this.db.query<RowDataPacket[]>(
      `SELECT u.user_id, u.nickname, u.profileImage, gm.role
       FROM group_member_tb gm
       JOIN user_tb u ON gm.user_id = u.user_id
       WHERE gm.group_id = ?
       ORDER BY gm.role = 'HOST' DESC, gm.joined_date ASC`,
      [groupId]
    );

    return members as GroupMember[];
  }
  public async getPreviousGroup(userId: number): Promise<number[]> {
    const [groupIds] = await this.db.query<RowDataPacket[]>(
      `SELECT g.group_id 
       FROM group_tb g
       INNER JOIN group_member_tb gm ON g.group_id = gm.group_id
       WHERE gm.user_id = ? AND g.schedule = false
       ORDER BY g.created_date DESC`,
      [userId]
    );

    return groupIds.map((row) => row.group_id);
  }
}
export default GroupService;
