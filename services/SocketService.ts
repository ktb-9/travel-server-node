import { Server, Socket } from "socket.io";
import { Pool, RowDataPacket } from "mysql2/promise";

interface UserInfo extends RowDataPacket {
  user_id: string;
  nickname: string;
  profileImage: string;
}

interface GroupMember extends RowDataPacket {
  group_id: string;
  user_id: string;
  role: string;
}

interface Group extends RowDataPacket {
  group_id: string;
}

export class SocketService {
  private io: Server;
  private pool: Pool;
  private connectedUsers: Map<string, Set<string>> = new Map();

  constructor(io: Server, pool: Pool) {
    this.io = io;
    this.pool = pool;
  }

  public initialize(): void {
    this.io.on("connection", (socket: Socket) => {
      console.log("Client connected:", socket.id);

      this.handleJoinGroup(socket);
      this.handleLeaveGroup(socket);
      this.handleGetMembers(socket);

      this.handleDisconnect(socket);
    });
  }

  private async trackUserConnection(
    groupId: string,
    userId: string,
    isConnecting: boolean
  ) {
    if (!this.connectedUsers.has(groupId)) {
      this.connectedUsers.set(groupId, new Set());
    }

    const groupUsers = this.connectedUsers.get(groupId)!;

    if (isConnecting) {
      groupUsers.add(userId);
    } else {
      groupUsers.delete(userId);
    }
  }

  private handleGetMembers(socket: Socket): void {
    socket.on("getMembers", async (data: { groupId: string }) => {
      const { groupId } = data;
      const connection = await this.pool.getConnection();

      try {
        const [members] = await connection.query<(GroupMember & UserInfo)[]>(
          `SELECT gm.group_id, gm.user_id, gm.role, u.nickname, u.profileImage 
           FROM group_member_tb gm 
           JOIN user_tb u ON gm.user_id = u.user_id 
           WHERE gm.group_id = ?`,
          [groupId]
        );

        socket.emit("membersList", {
          groupId,
          members: members.map((member) => ({
            user_id: member.user_id,
            nickname: member.nickname,
            profileImage: member.profileImage,
            role: member.role,
          })),
        });
      } catch (error: any) {
        console.error("Error in getMembers:", error);
        socket.emit("error", {
          message: error.message || "멤버 목록 조회 중 오류가 발생했습니다.",
        });
      } finally {
        connection.release();
      }
    });
  }

  private handleJoinGroup(socket: Socket): void {
    socket.on(
      "joinGroup",
      async (data: { groupId: string; userId: string }) => {
        const { groupId, userId } = data;
        const connection = await this.pool.getConnection();

        try {
          await connection.beginTransaction();

          const [existingMember] = await connection.query<GroupMember[]>(
            "SELECT * FROM group_member_tb WHERE group_id = ? AND user_id = ?",
            [groupId, userId]
          );

          const [groupExists] = await connection.query<Group[]>(
            "SELECT * FROM group_tb WHERE group_id = ?",
            [groupId]
          );

          if (groupExists.length === 0) {
            throw new Error("존재하지 않는 그룹입니다.");
          }

          socket.join(`group:${groupId}`);
          await this.trackUserConnection(groupId, userId, true);

          if (existingMember.length === 0) {
            await connection.query(
              'INSERT INTO group_member_tb (group_id, user_id, role) VALUES (?, ?, "COMPANION")',
              [groupId, userId]
            );

            const [userInfo] = await connection.query<UserInfo[]>(
              "SELECT user_id, nickname, profileImage FROM user_tb WHERE user_id = ?",
              [userId]
            );

            this.io.to(`group:${groupId}`).emit("memberJoined", {
              groupId,
              newMember: userInfo[0],
              message: "새로운 멤버가 참가했습니다.",
            });
          }

          await connection.commit();
        } catch (error: any) {
          await connection.rollback();
          console.error("Error in joinGroup:", error);
          socket.emit("error", {
            message: error.message || "멤버 추가 중 오류가 발생했습니다.",
          });
        } finally {
          connection.release();
        }
      }
    );
  }

  private handleLeaveGroup(socket: Socket): void {
    socket.on(
      "leaveGroup",
      async (data: { groupId: string; userId: string }) => {
        const { groupId, userId } = data;
        const connection = await this.pool.getConnection();

        try {
          await connection.beginTransaction();

          // 1. 사용자의 역할 확인
          const [userRoleResult] = await connection.query<GroupMember[]>(
            "SELECT role FROM group_member_tb WHERE group_id = ? AND user_id = ?",
            [groupId, userId]
          );

          const isHost = userRoleResult[0]?.role === "HOST";

          // 2. 트래킹 정보 업데이트
          await this.trackUserConnection(groupId, userId, false);
          socket.leave(`group:${groupId}`);

          if (isHost) {
            // 호스트가 나가는 경우 - 전체 그룹 삭제
            await connection.query(
              "DELETE FROM group_invite_tb WHERE group_id = ?",
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

            // 그룹 삭제 이벤트 브로드캐스트
            this.io.to(`group:${groupId}`).emit("groupDeleted", {
              groupId,
              message: "호스트가 나가서 그룹이 삭제되었습니다.",
            });
          } else {
            // 일반 멤버가 나가는 경우 - 자신의 모든 관련 정보 삭제
            // group_member_tb에서 삭제
            await connection.query(
              "DELETE FROM group_member_tb WHERE group_id = ? AND user_id = ?",
              [groupId, userId]
            );

            // group_calendar_tb에서 삭제
            await connection.query(
              "DELETE FROM group_calendar_tb WHERE group_id = ? AND user_id = ?",
              [groupId, userId]
            );

            // 멤버 나감 이벤트 브로드캐스트
            this.io.to(`group:${groupId}`).emit("memberLeft", {
              groupId,
              userId,
              message: "멤버가 그룹을 나갔습니다.",
            });
            this.io.to(`group:${groupId}`).emit("calendarDateCleared", {
              groupId,
              userId,
            });
          }

          await connection.commit();
        } catch (error: any) {
          await connection.rollback();
          socket.emit("error", {
            message: error.message || "그룹 나가기 중 오류가 발생했습니다.",
          });
        } finally {
          connection.release();
        }
      }
    );
  }
  private handleDisconnect(socket: Socket): void {
    socket.on("disconnect", () => {
      console.log("Client disconnected:", socket.id);
      socket.rooms.forEach((room) => {
        if (room.startsWith("group:")) {
          const groupId = room.split(":")[1];
          this.io.to(room).emit("userDisconnected", {
            socketId: socket.id,
            message: "사용자의 연결이 끊어졌습니다.",
          });
        }
      });
    });
  }
}
