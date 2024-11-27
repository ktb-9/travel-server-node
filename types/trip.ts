export interface TripDetails {
  trip_id: number;
  group_id: number;
  groupName: string;
  groupThumbnail: string;
  date: string;
  created_date?: string;
  updated_date?: string;
}

export interface TripLocationDetails {
  location_id: number;
  trip_id: number;
  day: number;
  name: string;
  address: string;
  visit_time: string;
  category: string;
  hashtag: string;
  thumbnail: string;
  created_date?: string;
}

export interface TripWithMembers extends TripDetails {
  group_name: string;
  locations: TripLocationDetails[];
  members: Array<{
    user_id: number;
    nickname: string;
    profileImage?: string;
    role: string;
  }>;
}
export interface TripInfo {
  trip_id: number;
  date: string; // "2024.11.05~2024.11.08" 형식
  group_name: string;
}

export interface UpdateLocationRequest {
  location_id: number;
  name: string;
  address: string;
  category: string;
  hashtag: string;
  thumbnail: string;
  visit_time: string;
}
