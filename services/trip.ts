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
  public async getGroupTrips(groupId: number): Promise<TripDetails[]> {
    const [trips] = await this.db.query<RowDataPacket[]>(
      "SELECT * FROM trip_tb WHERE group_id = ? ORDER BY start_date DESC",
      [groupId]
    );

    return trips as TripDetails[];
  }
}

export default TripService;
