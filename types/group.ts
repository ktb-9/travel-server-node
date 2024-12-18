export interface CreateGroupDto {
  name: string;
}

export interface GroupDetails {
  group_id: number;
  name: string;
  host_id: number;
  created_date: Date;
}

export interface GroupMember {
  user_id: number;
  nickname: string;
  profileImage: string;
  role: "HOST" | "COMPANION";
}
