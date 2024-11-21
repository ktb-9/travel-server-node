import { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import {
  TripDetails,
  TripLocationDetails,
  TripWithMembers,
} from "../types/trip";

class TripService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  public async createTrip(
    groupId: number,
    startDate: string,
    endDate: string,
    destination: string,
    locations: Array<{
      day: number;
      name: string;
      address: string;
      visitTime: string;
      category: string;
      hashtag: string;
      thumbnail: string;
    }>
  ): Promise<TripDetails> {
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();

      // Trip 생성
      const [tripResult] = await connection.query<ResultSetHeader>(
        "INSERT INTO trip_tb (group_id, start_date, end_date, destination) VALUES (?, ?, ?, ?)",
        [groupId, startDate, endDate, destination]
      );
      const tripId = tripResult.insertId;

      // Locations 추가
      for (const location of locations) {
        await connection.query(
          "INSERT INTO trip_location_tb (trip_id, day, name, address, visit_time, category, hashtag, thumbnail) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          [
            tripId,
            location.day,
            location.name,
            location.address,
            location.visitTime,
            location.category,
            location.hashtag,
            location.thumbnail,
          ]
        );
      }

      await connection.commit();
      return {
        trip_id: tripId,
        group_id: groupId,
        start_date: startDate,
        end_date: endDate,
        destination,
      } as TripDetails;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  public async getTripDetails(tripId: number): Promise<TripWithMembers> {
    const connection = await this.db.getConnection();
    try {
      // Trip 정보 조회
      const [trips] = await connection.query<RowDataPacket[]>(
        `SELECT t.*, g.name as group_name 
         FROM trip_tb t
         JOIN group_tb g ON t.group_id = g.group_id
         WHERE t.trip_id = ?`,
        [tripId]
      );

      if (trips.length === 0) {
        throw new Error("존재하지 않는 여행입니다.");
      }

      // Trip Locations 조회
      const [locations] = await connection.query<RowDataPacket[]>(
        `SELECT * FROM trip_location_tb 
         WHERE trip_id = ? 
         ORDER BY day, visit_time`,
        [tripId]
      );

      // Trip에 참여한 멤버 조회 (nickname 포함)
      const [members] = await connection.query<RowDataPacket[]>(
        `SELECT u.user_id, u.nickname, u.profileImage, gm.role
         FROM group_member_tb gm
         JOIN user_tb u ON gm.user_id = u.user_id
         WHERE gm.group_id = ?
         ORDER BY gm.role = 'HOST' DESC, gm.joined_date ASC`,
        [trips[0].group_id]
      );

      return {
        ...trips[0],
        locations: locations as TripLocationDetails[],
        members: members.map((member) => ({
          user_id: member.user_id,
          nickname: member.nickname,
          profileImage: member.profileImage,
          role: member.role,
        })),
      } as TripWithMembers;
    } catch (error) {
      throw error;
    } finally {
      connection.release();
    }
  }

  public async getGroupTrips(groupId: number): Promise<TripDetails[]> {
    const [trips] = await this.db.query<RowDataPacket[]>(
      "SELECT * FROM trip_tb WHERE group_id = ? ORDER BY start_date DESC",
      [groupId]
    );

    return trips as TripDetails[];
  }
}

export default TripService;
