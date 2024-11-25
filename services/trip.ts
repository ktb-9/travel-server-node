import { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import {
  TripDetails,
  TripInfo,
  TripLocationDetails,
  TripWithMembers,
  UpdateLocationRequest,
} from "../types/trip";

class TripService {
  private db: Pool;

  constructor(db: Pool) {
    this.db = db;
  }

  public async createTrip(
    groupId: number,
    groupName: string,
    groupThumbnail: string,
    date: string,
    days: Array<{
      day: number;
      destination: string;
      locations: Array<{
        name: string;
        address: string;
        visitTime: string;
        category: string;
        hashtag: string;
        thumbnail: string;
      }>;
    }>
  ): Promise<TripDetails> {
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();

      await connection.query(
        "UPDATE group_tb SET name = ?, group_thumbnail = ? WHERE group_id = ?",
        [groupName, groupThumbnail, groupId]
      );
      // Trip 생성
      const [tripResult] = await connection.query<ResultSetHeader>(
        "INSERT INTO trip_tb (group_id, date) VALUES (?, ?)",
        [groupId, date]
      );
      const tripId = tripResult.insertId;

      // Locations 추가
      for (const day of days) {
        for (const location of day.locations) {
          await connection.query(
            "INSERT INTO trip_location_tb (trip_id, day, destination, name, address, visit_time, category, hashtag, thumbnail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
              tripId,
              day.day,
              day.destination,
              location.name,
              location.address,
              location.visitTime,
              location.category,
              location.hashtag,
              location.thumbnail,
            ]
          );
        }
      }
      await connection.commit();
      return {
        trip_id: tripId,
      } as TripDetails;
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  public async getTripDetails(tripId: number): Promise<{
    trip_id: number;
    group_id: number;
    date: string;
    groupName: string;
    groupThumbnail: string;
    days: Array<{
      day: number;
      destination: string;
      locations: TripLocationDetails[];
    }>;
  }> {
    const connection = await this.db.getConnection();
    try {
      // Trip 정보 조회
      const [trips] = await connection.query<RowDataPacket[]>(
        `SELECT t.*, g.name as group_name, g.group_thumbnail 
         FROM trip_tb t
         JOIN group_tb g ON t.group_id = g.group_id
         WHERE t.trip_id = ?`,
        [tripId]
      );

      if (trips.length === 0) {
        throw new Error("존재하지 않는 여행입니다.");
      }

      // Trip Locations 조회 (day별로 그룹화)
      const [rawLocations] = await connection.query<RowDataPacket[]>(
        `SELECT * FROM trip_location_tb 
         WHERE trip_id = ? 
         ORDER BY day, visit_time`,
        [tripId]
      );

      // locations를 days 구조로 변환
      const daysMap = new Map<
        number,
        {
          day: number;
          destination: string;
          locations: TripLocationDetails[];
        }
      >();

      rawLocations.forEach((location) => {
        if (!daysMap.has(location.day)) {
          daysMap.set(location.day, {
            day: location.day,
            destination: location.destination || "",
            locations: [],
          });
        }

        // 명시적 타입 변환
        const typedLocation: TripLocationDetails = {
          location_id: location.location_id,
          trip_id: location.trip_id,
          day: location.day,
          name: location.name,
          address: location.address,
          visit_time: location.visit_time,
          category: location.category,
          hashtag: location.hashtag,
          thumbnail: location.thumbnail,
        };

        daysMap.get(location.day)!.locations.push(typedLocation);
      });

      return {
        trip_id: trips[0].trip_id,
        group_id: trips[0].group_id,
        date: trips[0].date,
        groupName: trips[0].group_name,
        groupThumbnail: trips[0].group_thumbnail,
        days: Array.from(daysMap.values()),
      };
    } catch (error) {
      throw error;
    } finally {
      connection.release();
    }
  }
  public async getUserTrips(user_id: number): Promise<TripInfo[]> {
    try {
      const [trips] = await this.db.query<RowDataPacket[]>(
        `
            SELECT DISTINCT
                t.trip_id,
                t.date,
                t.created_date,
                g.name as group_name
            FROM 
                trip_tb t
            JOIN 
                group_tb g ON t.group_id = g.group_id
            JOIN 
                group_member_tb gm ON g.group_id = gm.group_id
            WHERE 
                gm.user_id = ?
            ORDER BY 
                t.created_date DESC
            `,
        [user_id]
      );

      if (!Array.isArray(trips)) {
        return [];
      }

      return trips as TripInfo[];
    } catch (error: any) {
      console.error("Error fetching user trips:", error);
      throw new Error(`Failed to fetch user trips: ${error.message}`);
    }
  }

  public async updateTripLocation(
    userId: number,
    groupId: number,
    body: UpdateLocationRequest
  ): Promise<void> {
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();
      console.log(body);
      // 1. 사용자가 그룹의 멤버인지 확인
      const [memberCheck] = await connection.query<RowDataPacket[]>(
        `SELECT COUNT(*) as count 
        FROM group_member_tb 
        WHERE group_id = ? AND user_id = ?`,
        [groupId, userId]
      );
      if (memberCheck[0].count === 0) throw new Error("그룹의 멤버가 아닙니다");
      // 2. 장소 정보가 존재하는지 확인
      const [locationCheck] = await connection.query<RowDataPacket[]>(
        `SELECT trip_id 
         FROM trip_location_tb 
         WHERE location_id = ?`,
        [body.location_id]
      );
      console.log(locationCheck);

      if (locationCheck.length === 0) {
        throw new Error("존재하지 않는 장소입니다.");
      }
      // 3. 장소 정보 업데이트
      await connection.query(
        `UPDATE trip_location_tb 
           SET 
             name = ?,
             address = ?,
             category = ?,
             hashtag = ?,
             thumbnail = ?,
             visit_time = ?
           WHERE location_id = ?`,
        [
          body.name,
          body.address,
          body.category,
          body.hashtag,
          body.thumbnail,
          body.visit_time,
          body.location_id,
        ]
      );

      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }
}

export default TripService;
