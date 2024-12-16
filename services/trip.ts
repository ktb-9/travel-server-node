import { Pool, RowDataPacket, ResultSetHeader } from "mysql2/promise";
import {
  TripDetails,
  TripInfo,
  TripLocationDetails,
  UpdateLocationRequest,
} from "../types/trip";

interface DeadlockConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

class TripService {
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

  // 여행 생성
  public async createTrip(
    groupId: number,
    groupName: string,
    groupThumbnail: string,
    date: string
  ): Promise<TripDetails> {
    return this.executeWithRetry(async () => {
      const connection = await this.db.getConnection();
      try {
        await this.startTransactionWithTimeout(connection);

        // 그룹 정보 순서대로 업데이트 (일관된 락 순서)
        await connection.query(
          "UPDATE group_tb SET name = ?, group_thumbnail = ? WHERE group_id = ?",
          [groupName, groupThumbnail, groupId]
        );

        // 여행 생성
        const [tripResult] = await connection.query<ResultSetHeader>(
          "INSERT INTO trip_tb (group_id, date) VALUES (?, ?)",
          [groupId, date]
        );

        const tripId = tripResult.insertId;
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
    });
  }

  // 위치 추가 (낙관적 동시성 제어)
  public async addLocation(body: {
    tripId: number;
    day: number;
    destination: number;
    locations: Array<{
      name: string;
      address: string;
      visit_time: string;
      category: string;
      hashtag: string;
      thumbnail: string;
    }>;
  }): Promise<void> {
    return this.executeWithRetry(async () => {
      const connection = await this.db.getConnection();
      try {
        await this.startTransactionWithTimeout(connection);

        // 여행 존재 확인 및 락
        const [tripCheck] = await connection.query<RowDataPacket[]>(
          "SELECT trip_id FROM trip_tb WHERE trip_id = ? FOR UPDATE",
          [body.tripId]
        );

        if (tripCheck.length === 0) {
          throw new Error("존재하지 않는 여행입니다.");
        }

        // 장소 추가
        for (const location of body.locations) {
          await connection.query(
            "INSERT INTO trip_location_tb (trip_id, day, destination, name, address, visit_time, category, hashtag, thumbnail) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
              body.tripId,
              body.day,
              body.destination,
              location.name,
              location.address,
              location.visit_time,
              location.category,
              location.hashtag,
              location.thumbnail,
            ]
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

  // 여행 위치 업데이트 (버전 관리 포함)
  public async updateTripLocation(
    userId: number,
    groupId: number,
    body: UpdateLocationRequest & { expectedVersion?: number }
  ): Promise<void> {
    return this.executeWithRetry(async () => {
      const connection = await this.db.getConnection();
      try {
        await this.startTransactionWithTimeout(connection);

        // 사용자 그룹 멤버십 확인
        const [memberCheck] = await connection.query<RowDataPacket[]>(
          `SELECT COUNT(*) as count 
           FROM group_member_tb 
           WHERE group_id = ? AND user_id = ?`,
          [groupId, userId]
        );

        if (memberCheck[0].count === 0) {
          throw new Error("그룹의 멤버가 아닙니다");
        }

        // 장소 존재 및 버전 확인
        const [locationCheck] = await connection.query<RowDataPacket[]>(
          `SELECT trip_id, version 
           FROM trip_location_tb 
           WHERE location_id = ? FOR UPDATE`,
          [body.location_id]
        );

        if (locationCheck.length === 0) {
          throw new Error("존재하지 않는 장소입니다.");
        }

        // 선택적 버전 확인 로직
        if (
          body.expectedVersion !== undefined &&
          locationCheck[0].version !== body.expectedVersion
        ) {
          throw new Error("동시성 충돌: 다른 사용자가 이미 수정했습니다");
        }

        // 장소 업데이트 (버전 증가)
        await connection.query(
          `UPDATE trip_location_tb 
           SET 
             name = ?,
             address = ?,
             category = ?,
             hashtag = ?,
             thumbnail = ?,
             visit_time = ?,
             version = version + 1
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
    });
  }

  public async getTripDetails(tripId: number): Promise<{
    trip_id: number;
    group_id: number;
    date: string;
    backgroundUrl: string;
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

      // Background URLs 조회
      const [backgrounds] = await connection.query<RowDataPacket[]>(
        "SELECT background_url FROM group_background_tb WHERE group_id = ?",
        [trips[0].group_id]
      );

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
        backgroundUrl:
          backgrounds.length > 0 ? backgrounds[0].background_url : "", // 단일 배경 URL 반환
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

  public async deleteTripLocation(location_id: number): Promise<void> {
    const connection = await this.db.getConnection();
    try {
      await connection.beginTransaction();
      console.log(location_id);
      // 1. 장소 정보가 존재하는지 확인
      const [locationCheck] = await connection.query<RowDataPacket[]>(
        `SELECT trip_id 
         FROM trip_location_tb 
         WHERE location_id = ?`,
        [location_id]
      );

      if (locationCheck.length === 0) {
        throw new Error("존재하지 않는 장소입니다.");
      }
      await connection.query(
        `DELETE FROM trip_location_tb WHERE location_id=?`,
        [location_id]
      );
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  public async getUpcomingTrip(userId: number): Promise<TripInfo[]> {
    try {
      const [upcomingTrips] = await this.db.query<RowDataPacket[]>(
        `
        SELECT 
          t.trip_id,
          t.date,
          g.name AS group_name,
          g.group_thumbnail,
          gb.background_url,
          STR_TO_DATE(SUBSTRING_INDEX(t.date, '~', 1), '%Y.%m.%d') as start_date
        FROM 
          trip_tb t
        JOIN 
          group_tb g ON t.group_id = g.group_id
        JOIN 
          group_member_tb gm ON g.group_id = gm.group_id
        LEFT JOIN 
          group_background_tb gb ON g.group_id = gb.group_id
        WHERE 
          gm.user_id = ?
          AND STR_TO_DATE(SUBSTRING_INDEX(t.date, '~', 1), '%Y.%m.%d') >= CURDATE()
        ORDER BY 
          start_date ASC
        LIMIT 1 
      `,
        [userId]
      );

      return upcomingTrips as TripInfo[];
    } catch (error: any) {
      console.error("다가오는 일정 조회 오류:", error);
      throw new Error(`다가오는 일정 조회에 실패 했습니다.: ${error.message}`);
    }
  }
}

export default TripService;
