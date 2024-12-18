import { Server, Socket } from "socket.io";
import { Pool, RowDataPacket } from "mysql2/promise";

interface CalendarData extends RowDataPacket {
  calendar_id: number;
  group_id: number;
  user_id: number;
  start_date: string;
  end_date: string;
  nickname: string;
}

interface DateRange {
  start: string;
  end: string;
}

export class CalendarSocketService {
  private io: Server;
  private pool: Pool;

  constructor(io: Server, pool: Pool) {
    this.io = io;
    this.pool = pool;
  }

  public initialize(): void {
    this.io.on("connection", (socket: Socket) => {
      console.log("Calendar client connected:", socket.id);

      // Handle joining group room
      socket.on("joinGroup", (groupId: number) => {
        socket.join(`group:${groupId}`);
        console.log(`Client ${socket.id} joined group:${groupId}`);
      });

      this.handleSetCalendarDate(socket);
      this.handleGetCalendarDates(socket);
      this.handleClearCalendarDate(socket);
      this.handleDisconnect(socket);
      this.handleTripCreation(socket);
    });
  }

  private handleSetCalendarDate(socket: Socket): void {
    socket.on(
      "setCalendarDate",
      async (data: {
        groupId: number;
        userId: number;
        dateRange: DateRange;
      }) => {
        const { groupId, userId, dateRange } = data;
        const connection = await this.pool.getConnection();

        try {
          await connection.beginTransaction();

          // Check if user is member of the group
          const [memberCheck] = await connection.query<RowDataPacket[]>(
            "SELECT * FROM group_member_tb WHERE group_id = ? AND user_id = ?",
            [groupId, userId]
          );

          if (memberCheck.length === 0) {
            throw new Error("그룹의 멤버가 아닙니다.");
          }

          // Delete existing calendar data for this user in this group
          await connection.query(
            "DELETE FROM group_calendar_tb WHERE group_id = ? AND user_id = ?",
            [groupId, userId]
          );

          // Insert new calendar data
          await connection.query(
            `INSERT INTO group_calendar_tb 
             (group_id, user_id, start_date, end_date) 
             VALUES (?, ?, ?, ?)`,
            [groupId, userId, dateRange.start, dateRange.end]
          );

          // Get updated calendar data including user nickname
          const [updatedData] = await connection.query<CalendarData[]>(
            `SELECT gc.*, u.nickname 
             FROM group_calendar_tb gc
             JOIN user_tb u ON gc.user_id = u.user_id
             WHERE gc.group_id = ? AND gc.user_id = ?`,
            [groupId, userId]
          );

          await connection.commit();

          const calendarData = {
            userId,
            nickname: updatedData[0].nickname,
            dateRange: {
              start: dateRange.start,
              end: dateRange.end,
            },
          };

          // Broadcast to all clients in the group room, including sender
          this.io.to(`group:${groupId}`).emit("calendarUpdated", {
            groupId,
            calendarData,
          });

          // Send specific success response to sender
          socket.emit("calendarUpdateSuccess", {
            groupId,
            calendarData,
            message: "일정이 성공적으로 업데이트되었습니다.",
          });
        } catch (error: any) {
          await connection.rollback();
          console.error("Error in setCalendarDate:", error);
          socket.emit("error", {
            message: error.message || "일정 설정 중 오류가 발생했습니다.",
          });
        } finally {
          connection.release();
        }
      }
    );
  }

  private handleGetCalendarDates(socket: Socket): void {
    socket.on("getCalendarDates", async (data: { groupId: number }) => {
      const { groupId } = data;
      const connection = await this.pool.getConnection();

      try {
        const [calendarData] = await connection.query<CalendarData[]>(
          `SELECT gc.*, u.nickname 
           FROM group_calendar_tb gc
           JOIN user_tb u ON gc.user_id = u.user_id
           WHERE gc.group_id = ?`,
          [groupId]
        );

        const formattedData = calendarData.map((data) => ({
          userId: data.user_id,
          nickname: data.nickname,
          dateRange: {
            start: data.start_date,
            end: data.end_date,
          },
        }));

        socket.emit("calendarDatesList", {
          groupId,
          calendarData: formattedData,
        });
      } catch (error: any) {
        console.error("Error in getCalendarDates:", error);
        socket.emit("error", {
          message: error.message || "일정 조회 중 오류가 발생했습니다.",
        });
      } finally {
        connection.release();
      }
    });
  }

  private handleClearCalendarDate(socket: Socket): void {
    socket.on(
      "clearCalendarDate",
      async (data: { groupId: number; userId: number }) => {
        const { groupId, userId } = data;
        const connection = await this.pool.getConnection();

        try {
          await connection.beginTransaction();

          const [result] = await connection.query<any>(
            "DELETE FROM group_calendar_tb WHERE group_id = ? AND user_id = ?",
            [groupId, userId]
          );

          await connection.commit();

          if (result.affectedRows > 0) {
            // Broadcast to all clients in the group room
            this.io.to(`group:${groupId}`).emit("calendarDateCleared", {
              groupId,
              userId,
            });

            // Send specific success response to sender
            socket.emit("calendarClearSuccess", {
              groupId,
              userId,
              message: "일정이 성공적으로 초기화되었습니다.",
            });
          }
        } catch (error: any) {
          await connection.rollback();
          console.error("Error in clearCalendarDate:", error);
          socket.emit("error", {
            message: error.message || "일정 초기화 중 오류가 발생했습니다.",
          });
        } finally {
          connection.release();
        }
      }
    );
  }
  private handleTripCreation(socket: Socket): void {
    socket.on(
      "tripCreated",
      async (data: { groupId: string; tripId: number }) => {
        const { groupId, tripId } = data;
        console.log(tripId);
        // 브로드 캐스팅
        this.io.to(`group:${groupId}`).emit("redirectToTrip", {
          tripId: tripId,
          message: "여행 일정이 확정되었습니다.",
        });
      }
    );
  }

  private handleDisconnect(socket: Socket): void {
    socket.on("disconnect", () => {
      console.log("Calendar client disconnected:", socket.id);
    });
  }
}
